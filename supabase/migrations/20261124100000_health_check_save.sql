-- S07-S 건강 점검 결과를 화분에 저장 (03 §4 F05, ADR-0003 D6, ADR-0006 D5).
--
-- 1. plant_analyses keeps what S07-B showed: the outcome ('found' or
--    'unclear'), when the symptom was noticed, the user's own notes, and the
--    AI texts with their model (owner decision 2026-11-24: saved with the
--    result, shown as AI text). The request checks every AI text against a
--    server signature before it reaches here.
-- 2. One saved check per signed result (PR #26 review P2): `result_digest`
--    (SHA-256 of the result token) is unique per user, so a retried or
--    repeated save returns the existing check instead of a copy.
-- 3. A health photo always belongs to a pot, like a pot photo.
-- 4. save_health_check() writes the analysis, its photo rows and the links in
--    one transaction, after the request uploaded the files. The request first
--    records those paths in storage_deletions as 'pending' (PR #26 review P2);
--    this function removes that record in the same transaction, so a path
--    left 'pending' is a file no saved check uses (a failed or interrupted
--    save), for the clean-up job (DF-06). Runs as the caller: RLS and the
--    (plant_id, user_id) foreign keys keep it to the user's own pot.
--
-- Existing rows (PR #26 review, deploy check): none are expected, because no
-- screen saved health checks before this migration. Even so, rows without
-- causes are marked 'unclear' before the outcome rule is added, and the
-- health-photo rule is added NOT VALID, so old rows can never block it.

alter table public.plant_analyses
  add column outcome text not null default 'found' check (outcome in ('found', 'unclear')),
  add column noticed text not null default 'unknown' check (noticed in ('unknown', 'today', 'this_week', 'over_a_week')),
  add column notes text check (notes is null or char_length(notes) between 1 and 300),
  add column ai_explanation jsonb,
  add column ai_judgement jsonb,
  add column ai_model text check (ai_model is null or char_length(ai_model) between 1 and 100),
  add column result_digest text check (result_digest is null or result_digest ~ '^[0-9a-f]{64}$');

update public.plant_analyses
   set outcome = 'unclear'
 where not (jsonb_typeof(candidate_causes) = 'array' and jsonb_array_length(candidate_causes) > 0);

alter table public.plant_analyses
  -- A found result has causes; an unclear one has none (Pl@ntNet gave nothing above the bar).
  add constraint plant_analyses_outcome_causes check (
    (outcome = 'found') = (jsonb_typeof(candidate_causes) = 'array' and jsonb_array_length(candidate_causes) > 0)
  ),
  -- AI text is stored only with the model that wrote it.
  add constraint plant_analyses_ai_model check (
    (ai_explanation is null and ai_judgement is null) or ai_model is not null
  );

create unique index plant_analyses_user_result_digest_idx
  on public.plant_analyses (user_id, result_digest) where result_digest is not null;

alter table public.plant_photos
  add constraint plant_photos_health_needs_pot check (photo_type <> 'health' or plant_id is not null) not valid;

-- Saves one checked result with its 1–5 uploaded photos, once per result.
-- Returns the check, its pot, and whether this call created it (false: the
-- same result was saved before, by this or a concurrent request).
create or replace function public.save_health_check(
  p_plant_id uuid,
  p_analysis jsonb,
  p_photo_paths text[],
  p_result_digest text,
  p_cleanup_request uuid
)
returns table (analysis_id uuid, plant_id uuid, created boolean)
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
  saved_at timestamptz := now();
begin
  if coalesce(cardinality(p_photo_paths), 0) not between 1 and 5 then
    raise exception 'a health check needs 1 to 5 photos' using errcode = '22023';
  end if;
  if p_result_digest is null then
    raise exception 'a health check needs its result digest' using errcode = '22023';
  end if;

  -- Saved before: hand back that check; the caller removes the files it uploaded.
  return query
    select existing.id, existing.plant_id, false
      from public.plant_analyses as existing
     where existing.user_id = auth.uid() and existing.result_digest = p_result_digest;
  if found then
    return;
  end if;

  begin
    insert into public.plant_analyses (
      plant_id, provider, endpoint, symptoms, candidate_causes, uncertainty_notes, analyzed_at,
      outcome, noticed, notes, ai_explanation, ai_judgement, ai_model, result_digest
    ) values (
      p_plant_id,
      'plantnet',
      'v2/diseases/identify',
      coalesce(p_analysis -> 'symptoms', '[]'::jsonb),
      coalesce(p_analysis -> 'causes', '[]'::jsonb),
      p_analysis ->> 'uncertainty',
      (p_analysis ->> 'analyzed_at')::timestamptz,
      p_analysis ->> 'outcome',
      coalesce(p_analysis ->> 'noticed', 'unknown'),
      nullif(p_analysis ->> 'notes', ''),
      nullif(p_analysis -> 'ai_explanation', 'null'::jsonb),
      nullif(p_analysis -> 'ai_judgement', 'null'::jsonb),
      p_analysis ->> 'ai_model',
      p_result_digest
    )
    returning id into new_id;
  exception when unique_violation then
    -- A concurrent request saved the same result first.
    return query
      select existing.id, existing.plant_id, false
        from public.plant_analyses as existing
       where existing.user_id = auth.uid() and existing.result_digest = p_result_digest;
    return;
  end;

  foreach path in array p_photo_paths loop
    insert into public.plant_photos (plant_id, storage_path, photo_type, attached_at)
    values (p_plant_id, path, 'health', saved_at)
    returning id into photo_id;
    insert into public.analysis_photos (analysis_id, photo_id, plant_id)
    values (new_id, photo_id, p_plant_id);
  end loop;

  -- The files are now in use: they are no longer clean-up candidates.
  delete from public.storage_deletions as planned
   where planned.deletion_request_id = p_cleanup_request
     and planned.user_id = auth.uid()
     and planned.storage_path = any (p_photo_paths);

  return query select new_id, p_plant_id, true;
end;
$$;

revoke all on function public.save_health_check(uuid, jsonb, text[], text, uuid) from public, anon;
grant execute on function public.save_health_check(uuid, jsonb, text[], text, uuid) to authenticated;
