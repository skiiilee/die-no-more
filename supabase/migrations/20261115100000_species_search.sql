-- Name search (S03 → S04-A → S04-B), docs/stage2/04-data-sources.md.
--
-- 1. Plant DB search: case-insensitive partial match on Korean name, English
--    common name and scientific name with pg_trgm indexes (ADR-0003 D10).
-- 2. plant_species keeps what S04 shows and what was already asked of each
--    provider, so the same species never costs a second provider call.
-- 3. species_care gains 'care_level' (Perenual care_level, S04-B 관리 난이도) and
--    'description' (Perenual description in English, S04-B 짧은 식물 설명;
--    translated later per ADR-0004, the original is kept).

create extension if not exists pg_trgm with schema extensions;

alter table public.plant_species
  -- Provider reference photo for S04 (never a user photo). https only.
  add column image_url text check (image_url is null or image_url ~ '^https://'),
  -- Where korean_name came from (ADR-0004 D2): provider Korean first, then Azure.
  add column korean_name_source text check (korean_name_source in ('trefle', 'azure_translator')),
  -- Set once the providers were asked for a Korean name, even if they had none.
  add column korean_name_checked_at timestamptz,
  -- Result of the Perenual care lookup: care data stored, species outside the
  -- free range (IDs above 3000), or no Perenual match. Null = not asked yet.
  add column care_status text check (care_status in ('available', 'outside_free_range', 'not_found')),
  add column care_checked_at timestamptz,
  add constraint plant_species_care_checked check ((care_status is null) = (care_checked_at is null)),
  add constraint plant_species_korean_name_sourced check (korean_name is null or korean_name_source is not null);

create index plant_species_korean_name_trgm on public.plant_species
  using gin (korean_name extensions.gin_trgm_ops);
create index plant_species_common_name_trgm on public.plant_species
  using gin (common_name_en extensions.gin_trgm_ops);
create index plant_species_scientific_name_trgm on public.plant_species
  using gin (scientific_name extensions.gin_trgm_ops);

-- Plant DB search (ADR-0003 D10). The query is trimmed, its spaces collapsed,
-- and LIKE wildcards in it are matched literally. Exact scientific-name
-- matches come first, then Korean-name matches. Runs as the caller (RLS).
create or replace function public.search_species(query text, max_results integer default 20)
returns setof public.plant_species
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select lower(btrim(regexp_replace(query, '\s+', ' ', 'g'))) as key
  ), pattern as (
    select key,
           '%' || replace(replace(replace(key, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like
    from q
  )
  select s.*
  from public.plant_species s, pattern p
  where p.key <> ''
    and (s.korean_name ilike p.like or s.common_name_en ilike p.like or s.scientific_name ilike p.like)
  order by (s.scientific_name_key = p.key) desc,
           (s.korean_name ilike p.like) desc,
           s.scientific_name
  limit least(greatest(coalesce(max_results, 20), 1), 50);
$$;

revoke all on function public.search_species(text, integer) from public, anon;
grant execute on function public.search_species(text, integer) to authenticated;

alter table public.species_care drop constraint species_care_field_check;
alter table public.species_care add constraint species_care_field_check check (field in (
  'light', 'watering', 'watering_benchmark', 'fertilizer_interval', 'care_level', 'description',
  'soil', 'temperature', 'toxicity', 'pests', 'notes'
));
