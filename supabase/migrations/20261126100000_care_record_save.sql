-- S08 관리 기록 저장 (03 §7 F08–F09, wireframe §7, 05 database design).
--
-- 1. care_records gets the form's common memo (공통 메모).
-- 2. A care-record photo (photo_type 'log') always belongs to a pot, like the
--    pot and health photos. Added NOT VALID so old rows can never block it.
-- 3. save_care_record() writes one S08 save in one transaction: the record,
--    one care log per ticked activity, at most one observation (soil state
--    and/or the observation text), the 0–5 uploaded photos and their links.
--    Only what was entered is written; an empty save is refused (03 §7).
--    The same idempotency key returns the record saved before (double submit,
--    retry after a lost answer), also when a concurrent request wins.
--    Photo paths were recorded in storage_deletions as 'pending' before the
--    upload (as for health checks, PR #26 review); this function drops that
--    record in the same transaction. Runs as the caller: RLS and the
--    (plant_id, user_id) foreign keys keep it to the user's own pot.

alter table public.care_records
  add column notes text check (notes is null or char_length(notes) between 1 and 500);

alter table public.plant_photos
  add constraint plant_photos_log_needs_pot check (photo_type <> 'log' or plant_id is not null) not valid;

create or replace function public.save_care_record(
  p_plant_id uuid,
  p_record jsonb,
  p_photo_paths text[],
  p_idempotency_key text,
  p_cleanup_request uuid
)
returns table (record_id uuid, plant_id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
-- The output names match table columns; inside SQL they always mean the column.
#variable_conflict use_column
declare
  new_id uuid;
  photo_id uuid;
  path text;
  action jsonb;
  done_at timestamptz;
  memo text := nullif(btrim(coalesce(p_record ->> 'notes', '')), '');
  actions jsonb := coalesce(p_record -> 'actions', '[]'::jsonb);
  observation jsonb := nullif(p_record -> 'observation', 'null'::jsonb);
  photo_count int := coalesce(cardinality(p_photo_paths), 0);
  saved_at timestamptz := now();
begin
  if photo_count > 5 then
    raise exception 'a care record holds at most 5 photos' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 100 then
    raise exception 'a care record needs its idempotency key' using errcode = '22023';
  end if;
  if jsonb_typeof(actions) <> 'array' then
    raise exception 'actions must be a list' using errcode = '22023';
  end if;

  -- Saved before: hand back that record; the caller removes the files it uploaded.
  return query
    select existing.id, existing.plant_id, false
      from public.care_records as existing
     where existing.user_id = auth.uid() and existing.idempotency_key = p_idempotency_key;
  if found then
    return;
  end if;

  -- Nothing entered: nothing is saved (03 §7).
  if jsonb_array_length(actions) = 0 and observation is null and photo_count = 0 and memo is null then
    raise exception 'an empty care record is not saved' using errcode = '22023';
  end if;

  done_at := (p_record ->> 'recorded_at')::timestamptz;

  begin
    insert into public.care_records (plant_id, recorded_at, idempotency_key, notes)
    values (p_plant_id, done_at, p_idempotency_key, memo)
    returning id into new_id;
  exception when unique_violation then
    -- A concurrent request saved the same form first.
    return query
      select existing.id, existing.plant_id, false
        from public.care_records as existing
       where existing.user_id = auth.uid() and existing.idempotency_key = p_idempotency_key;
    return;
  end;

  -- One log per ticked activity; a type twice breaks unique (record_id, care_type).
  for action in select value from jsonb_array_elements(actions) loop
    insert into public.care_logs (plant_id, record_id, care_type, performed_at, amount, unit, notes, idempotency_key)
    values (
      p_plant_id,
      new_id,
      action ->> 'type',
      done_at,
      (action ->> 'amount_ml')::numeric,
      case when action ->> 'amount_ml' is not null then 'ml' end,
      nullif(btrim(coalesce(action ->> 'notes', '')), ''),
      p_idempotency_key || ':' || (action ->> 'type')
    );
  end loop;

  -- A soil check is an observation, never a watering log (03 §7).
  if observation is not null then
    insert into public.plant_observations (plant_id, record_id, soil_state, notes, observed_at)
    values (
      p_plant_id,
      new_id,
      observation ->> 'soil_state',
      nullif(btrim(coalesce(observation ->> 'notes', '')), ''),
      done_at
    );
  end if;

  if photo_count > 0 then
    foreach path in array p_photo_paths loop
      insert into public.plant_photos (plant_id, storage_path, photo_type, attached_at)
      values (p_plant_id, path, 'log', saved_at)
      returning id into photo_id;
      insert into public.care_record_photos (record_id, photo_id, plant_id)
      values (new_id, photo_id, p_plant_id);
    end loop;

    -- The files are now in use: they are no longer clean-up candidates.
    delete from public.storage_deletions as planned
     where planned.deletion_request_id = p_cleanup_request
       and planned.user_id = auth.uid()
       and planned.storage_path = any (p_photo_paths);
  end if;

  return query select new_id, p_plant_id, true;
end;
$$;

revoke all on function public.save_care_record(uuid, jsonb, text[], text, uuid) from public, anon;
grant execute on function public.save_care_record(uuid, jsonb, text[], text, uuid) to authenticated;
