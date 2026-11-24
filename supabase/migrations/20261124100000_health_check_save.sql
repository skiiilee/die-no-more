-- S07-S 건강 점검 결과를 화분에 저장 (03 §4 F05, ADR-0003 D6, ADR-0006 D5).
--
-- 1. plant_analyses keeps what S07-B showed: the outcome ('found' or
--    'unclear'), when the symptom was noticed, the user's own notes, and the
--    AI texts with their model (owner decision 2026-11-24: saved with the
--    result, shown as AI text). The request checks every AI text against a
--    server signature before it reaches here.
-- 2. A health photo always belongs to a pot, like a pot photo.
-- 3. save_health_check() writes the analysis, its photo rows and the links in
--    one transaction, after the request uploaded the files. If it fails, the
--    request removes those files itself (same as pot photos, ADR-0003 D6).
--    Runs as the caller: RLS and the (plant_id, user_id) foreign keys keep it
--    to the user's own pot.

alter table public.plant_analyses
  add column outcome text not null default 'found' check (outcome in ('found', 'unclear')),
  add column noticed text not null default 'unknown' check (noticed in ('unknown', 'today', 'this_week', 'over_a_week')),
  add column notes text check (notes is null or char_length(notes) between 1 and 300),
  add column ai_explanation jsonb,
  add column ai_judgement jsonb,
  add column ai_model text check (ai_model is null or char_length(ai_model) between 1 and 100),
  -- A found result has causes; an unclear one has none (Pl@ntNet gave nothing above the bar).
  add constraint plant_analyses_outcome_causes check (
    (outcome = 'found') = (jsonb_typeof(candidate_causes) = 'array' and jsonb_array_length(candidate_causes) > 0)
  ),
  -- AI text is stored only with the model that wrote it.
  add constraint plant_analyses_ai_model check (
    (ai_explanation is null and ai_judgement is null) or ai_model is not null
  );

alter table public.plant_photos
  add constraint plant_photos_health_needs_pot check (photo_type <> 'health' or plant_id is not null);

-- Saves one checked result with its 1–5 uploaded photos. Returns the analysis id.
create or replace function public.save_health_check(p_plant_id uuid, p_analysis jsonb, p_photo_paths text[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  analysis_id uuid;
  photo_id uuid;
  path text;
  saved_at timestamptz := now();
begin
  if coalesce(cardinality(p_photo_paths), 0) not between 1 and 5 then
    raise exception 'a health check needs 1 to 5 photos' using errcode = '22023';
  end if;

  insert into public.plant_analyses (
    plant_id, provider, endpoint, symptoms, candidate_causes, uncertainty_notes, analyzed_at,
    outcome, noticed, notes, ai_explanation, ai_judgement, ai_model
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
    p_analysis ->> 'ai_model'
  )
  returning id into analysis_id;

  foreach path in array p_photo_paths loop
    insert into public.plant_photos (plant_id, storage_path, photo_type, attached_at)
    values (p_plant_id, path, 'health', saved_at)
    returning id into photo_id;
    insert into public.analysis_photos (analysis_id, photo_id, plant_id)
    values (analysis_id, photo_id, p_plant_id);
  end loop;

  return analysis_id;
end;
$$;

revoke all on function public.save_health_check(uuid, jsonb, text[]) from public, anon;
grant execute on function public.save_health_check(uuid, jsonb, text[]) to authenticated;
