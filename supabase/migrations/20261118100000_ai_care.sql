-- AI care reference (ADR-0005). Fills the S04-B care fields that Perenual does
-- not give, one call per species, stored with the model that answered.
--
-- 1. species_care gets source 'ai' (shared rows, like 'perenual': no owner,
--    no review status) and records the model that produced each value.
-- 2. plant_species records that the AI was asked, so the same species is
--    never asked twice. A failed call leaves it unchecked (tries again later).
--    claim_care_ai() makes sure only one request asks at a time.
-- 3. api_usage_logs accepts the care AI provider (any OpenAI-compatible endpoint, ADR-0005), counted against our own cap.

alter table public.species_care
  drop constraint species_care_source_check;
alter table public.species_care
  add constraint species_care_source_check check (source in ('perenual', 'user', 'ai'));

alter table public.species_care
  add column ai_model text,
  add constraint species_care_ai_model_check check ((source = 'ai') = (ai_model is not null));

drop policy "care writable: api rows or own rows" on public.species_care;
create policy "care writable: api rows or own rows" on public.species_care
  for insert to authenticated
  with check (
    (source in ('perenual', 'ai') and user_id is null)
    or (source = 'user' and user_id = (select auth.uid()))
  );

drop policy "care updatable: api rows or own rows" on public.species_care;
create policy "care updatable: api rows or own rows" on public.species_care
  for update to authenticated
  using (source <> 'user' or user_id = (select auth.uid()))
  with check (
    (source in ('perenual', 'ai') and user_id is null)
    or (source = 'user' and user_id = (select auth.uid()))
  );

alter table public.plant_species
  add column care_ai_checked_at timestamptz;

alter table public.api_usage_logs
  drop constraint api_usage_logs_provider_check;
alter table public.api_usage_logs
  add constraint api_usage_logs_provider_check
  check (provider in ('plantnet', 'perenual', 'trefle', 'azure_translator', 'care_ai'));

-- Single-flight claim (review P1): only one request at a time asks the care AI
-- for a species. A claim older than 2 minutes counts as abandoned (the request
-- died), so a later visit can ask again. Released on failure, cleared on save.
alter table public.plant_species
  add column care_ai_claimed_at timestamptz;

create or replace function public.claim_care_ai(p_species_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed integer;
begin
  update public.plant_species
     set care_ai_claimed_at = now()
   where id = p_species_id
     and care_ai_checked_at is null
     and (care_ai_claimed_at is null or care_ai_claimed_at < now() - interval '2 minutes');
  get diagnostics claimed = row_count;
  return claimed > 0;
end;
$$;

revoke all on function public.claim_care_ai(uuid) from public, anon;
grant execute on function public.claim_care_ai(uuid) to authenticated;
