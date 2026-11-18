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

-- Single-flight claim (review P1). Only one request at a time asks the care AI
-- for a species. Each claim gets its own token (claim id), and only the request
-- holding the current token can finish or release it (review 2026-11-18): a
-- request whose claim expired cannot clear a newer claim or store a late answer.
-- A claim older than 2 minutes counts as abandoned (the request died), so a
-- later visit can take it.
alter table public.plant_species
  add column care_ai_claim_id uuid,
  add column care_ai_claimed_at timestamptz,
  add constraint plant_species_care_ai_claim check ((care_ai_claim_id is null) = (care_ai_claimed_at is null));

-- Returns the new claim id, or null when the species is already asked, unknown,
-- or claimed by a live request.
create or replace function public.claim_care_ai(p_species_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claim uuid := gen_random_uuid();
begin
  update public.plant_species
     set care_ai_claim_id = claim, care_ai_claimed_at = now()
   where id = p_species_id
     and care_ai_checked_at is null
     and (care_ai_claimed_at is null or care_ai_claimed_at < now() - interval '2 minutes');
  if not found then
    return null;
  end if;
  return claim;
end;
$$;

-- Gives the claim back after a failed call. No-op unless p_claim_id is the
-- current claim. Returns whether it released.
create or replace function public.release_care_ai(p_species_id uuid, p_claim_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.plant_species
     set care_ai_claim_id = null, care_ai_claimed_at = null
   where id = p_species_id
     and care_ai_checked_at is null
     and care_ai_claim_id = p_claim_id;
  return found;
end;
$$;

-- Records one answer in one transaction: marks the species as asked and stores
-- the values ({field: value}, source 'ai', with the model). Nothing is written
-- unless p_claim_id is the current claim. An empty object stores no values but
-- still marks the species as asked. Returns whether it stored.
create or replace function public.finish_care_ai(
  p_species_id uuid,
  p_claim_id uuid,
  p_model text,
  p_values jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.plant_species
     set care_ai_checked_at = now(), care_ai_claim_id = null, care_ai_claimed_at = null
   where id = p_species_id
     and care_ai_checked_at is null
     and care_ai_claim_id = p_claim_id;
  if not found then
    return false;
  end if;
  insert into public.species_care (species_id, field, value, source, ai_model, fetched_at)
  select p_species_id, item.key, item.value, 'ai', p_model, now()
    from jsonb_each(coalesce(p_values, '{}'::jsonb)) as item
  on conflict (species_id, field, source, user_id) do nothing;
  return true;
end;
$$;

revoke all on function public.claim_care_ai(uuid) from public, anon;
grant execute on function public.claim_care_ai(uuid) to authenticated;
revoke all on function public.release_care_ai(uuid, uuid) from public, anon;
grant execute on function public.release_care_ai(uuid, uuid) to authenticated;
revoke all on function public.finish_care_ai(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.finish_care_ai(uuid, uuid, text, jsonb) to authenticated;
