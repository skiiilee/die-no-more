-- Initial schema for Die No More.
-- Source: docs/05-database-design.md, ADR-0003 (D2, D6, D10, D12, D13, D16, D18).
--
-- Two groups:
--   Plant DB (shared species reference): plant_species, species_aliases, species_care
--   Pot DB (per user, RLS on user_id):   user_plants and everything hanging off a pot
--
-- Every per-user table carries user_id and a composite FK (plant_id, user_id) to
-- user_plants, so a row can never point at another user's pot even if RLS were
-- misconfigured.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plant DB (shared)
-- ---------------------------------------------------------------------------

create table public.plant_species (
  id uuid primary key default gen_random_uuid(),
  -- ADR-0003 D10: lowercase, trimmed, single spaces, no author citation.
  scientific_name_key text not null unique
    check (scientific_name_key = lower(btrim(regexp_replace(scientific_name_key, '\s+', ' ', 'g')))
           and scientific_name_key <> ''),
  scientific_name text not null,
  common_name_en text,
  korean_name text,
  korean_name_translated_at timestamptz,
  family text,
  perenual_id integer unique,
  trefle_id integer unique,
  source text not null check (source in ('perenual', 'trefle', 'plantnet')),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plant_species_updated_at
  before update on public.plant_species
  for each row execute function public.set_updated_at();

create table public.species_aliases (
  id uuid primary key default gen_random_uuid(),
  species_id uuid not null references public.plant_species (id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  lang text not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (species_id, alias, lang)
);

-- Care reference per species and field. API rows are shared; user rows (S13)
-- belong to one user, carry a review status and never drive reminders (D13).
create table public.species_care (
  id uuid primary key default gen_random_uuid(),
  species_id uuid not null references public.plant_species (id) on delete cascade,
  field text not null check (field in (
    'light', 'watering', 'watering_benchmark', 'fertilizer_interval',
    'soil', 'temperature', 'toxicity', 'pests', 'notes'
  )),
  value jsonb not null,
  source text not null check (source in ('perenual', 'user')),
  user_id uuid references auth.users (id) on delete cascade,
  review_status text check (review_status in ('pending', 'approved')),
  approved_at timestamptz,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- API rows have no owner; user rows always do and always have a review status.
  check ((source = 'user') = (user_id is not null)),
  check ((source = 'user') = (review_status is not null)),
  -- Approved <=> approval time recorded, both ways (D13). API rows have neither.
  check (coalesce(review_status = 'approved', false) = (approved_at is not null)),
  unique nulls not distinct (species_id, field, source, user_id)
);

create trigger species_care_updated_at
  before update on public.species_care
  for each row execute function public.set_updated_at();

-- D13: editing an approved user value sends it back to review. Approval is a
-- separate update that only sets review_status/approved_at, so a write that
-- changes the value can never leave it approved.
create or replace function public.species_care_reset_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'user' and new.value is distinct from old.value then
    new.review_status = 'pending';
    new.approved_at = null;
  end if;
  return new;
end;
$$;

create trigger species_care_reset_review
  before update on public.species_care
  for each row execute function public.species_care_reset_review();

-- ---------------------------------------------------------------------------
-- Pot DB (per user)
-- ---------------------------------------------------------------------------

create table public.user_plants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Confirmed species (nullable: unknown or manual name, D12). AI candidates are
  -- kept separately in identification_sessions.candidates.
  species_id uuid references public.plant_species (id) on delete set null,
  user_entered_name text,
  nickname text check (nickname is null or btrim(nickname) <> ''),
  environment text check (environment in ('indoor', 'outdoor')),
  location text,
  memo text,
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  -- S05 initial state (03 §5). Stored as the chosen category, never as a date.
  light_level text check (light_level in ('direct', 'bright_indirect', 'medium', 'low', 'unknown')),
  pot_material text check (pot_material in ('plastic', 'terracotta', 'glass', 'ceramic', 'garden_bed')),
  initial_last_watered_range text check (initial_last_watered_range in (
    'within_1_day', 'about_1_week', 'about_1_month', 'unknown'
  )),
  -- 05 snapshot rule 1: ten non-overlapping ranges.
  initial_last_repotted_range text check (initial_last_repotted_range in (
    'within_1_day', 'days_2_to_6', 'week_1_to_month_1', 'months_1_to_2', 'months_2_to_3',
    'months_3_to_6', 'months_6_to_12', 'over_1_year', 'unknown', 'never'
  )),
  initial_state_recorded_at timestamptz not null default now(),
  water_reminder_enabled boolean not null default false,
  fertilizer_reminder_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'archived') = (archived_at is not null)),
  unique (id, user_id)
);

create index user_plants_user_status_idx on public.user_plants (user_id, status);

create trigger user_plants_updated_at
  before update on public.user_plants
  for each row execute function public.set_updated_at();

create table public.plant_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plant_id uuid,
  -- Path inside the private "plant-photos" bucket: "<user_id>/<file>".
  storage_path text not null unique check (storage_path like user_id::text || '/%'),
  photo_type text not null check (photo_type in ('identification', 'plant', 'health', 'log')),
  captured_at timestamptz,
  -- Null until linked to a pot, record or saved check; unlinked photos are
  -- removed after 24h (D6).
  attached_at timestamptz,
  created_at timestamptz not null default now(),
  -- Target for the link tables below, so a link can only use a photo of the
  -- same pot and owner.
  unique (id, plant_id, user_id),
  foreign key (plant_id, user_id) references public.user_plants (id, user_id) on delete cascade
);

create index plant_photos_plant_idx on public.plant_photos (plant_id);
create index plant_photos_unattached_idx on public.plant_photos (created_at) where attached_at is null;

create table public.identification_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  provider text not null,
  -- Normalized candidates exactly as returned (order, score, provider, fetched_at).
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  selected_species_id uuid references public.plant_species (id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.plant_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Saving a health check requires choosing a pot (05 snapshot rule 6).
  plant_id uuid not null,
  provider text not null,
  endpoint text not null,
  symptoms jsonb not null default '[]'::jsonb,
  candidate_causes jsonb not null default '[]'::jsonb,
  uncertainty_notes text,
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, plant_id, user_id),
  foreign key (plant_id, user_id) references public.user_plants (id, user_id) on delete cascade
);

create index plant_analyses_plant_idx on public.plant_analyses (plant_id, analyzed_at desc);

-- Photos used for a saved health check. Both FKs carry (plant_id, user_id), so
-- the photo must exist and belong to the same pot and owner as the analysis.
create table public.analysis_photos (
  analysis_id uuid not null,
  photo_id uuid not null,
  plant_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (analysis_id, photo_id),
  foreign key (analysis_id, plant_id, user_id)
    references public.plant_analyses (id, plant_id, user_id) on delete cascade,
  foreign key (photo_id, plant_id, user_id)
    references public.plant_photos (id, plant_id, user_id) on delete cascade
);

create index analysis_photos_photo_idx on public.analysis_photos (photo_id);

-- One S08 save (03 §7). The form can write several care logs and one
-- observation at once; this row groups them under the shared record time and
-- owns the photos attached in that save. Logs written outside S08 (S09 task
-- completion) have no record.
create table public.care_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plant_id uuid not null,
  recorded_at timestamptz not null,
  -- Prevents a second record from a double submit of the same form.
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (id, plant_id, user_id),
  foreign key (plant_id, user_id) references public.user_plants (id, user_id) on delete cascade
);

create index care_records_plant_idx on public.care_records (plant_id, recorded_at desc);

create table public.care_record_photos (
  record_id uuid not null,
  photo_id uuid not null,
  plant_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (record_id, photo_id),
  foreign key (record_id, plant_id, user_id)
    references public.care_records (id, plant_id, user_id) on delete cascade,
  foreign key (photo_id, plant_id, user_id)
    references public.plant_photos (id, plant_id, user_id) on delete cascade
);

create index care_record_photos_photo_idx on public.care_record_photos (photo_id);

create table public.plant_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plant_id uuid not null,
  -- The S08 save this observation came from; at most one observation per save.
  record_id uuid unique,
  soil_state text check (soil_state in ('dry', 'moist', 'wet', 'unknown')),
  leaf_state text,
  pest_observation text,
  notes text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- An empty observation is not saved (03 §7). Blank or whitespace-only text
  -- counts as empty.
  check (coalesce(
    soil_state is not null
      or leaf_state ~ '\S'
      or pest_observation ~ '\S'
      or notes ~ '\S',
    false
  )),
  foreign key (plant_id, user_id) references public.user_plants (id, user_id) on delete cascade,
  foreign key (record_id, plant_id, user_id)
    references public.care_records (id, plant_id, user_id) on delete cascade
);

create index plant_observations_plant_idx on public.plant_observations (plant_id, observed_at desc);

create table public.care_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plant_id uuid not null,
  -- The S08 save this log came from; null for logs from S09 task completion.
  record_id uuid,
  care_type text not null check (care_type in ('water', 'fertilize', 'repot', 'prune')),
  performed_at timestamptz not null,
  amount numeric check (amount is null or amount > 0),
  unit text,
  notes text,
  -- Prevents duplicate logs from double submits or batch completion (03 §7, §8).
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  -- One log per activity type per save ("물주기 로그는 1회 생성", 03 §7).
  unique (record_id, care_type),
  foreign key (plant_id, user_id) references public.user_plants (id, user_id) on delete cascade,
  foreign key (record_id, plant_id, user_id)
    references public.care_records (id, plant_id, user_id) on delete cascade
);

create index care_logs_plant_idx on public.care_logs (plant_id, care_type, performed_at desc);

create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plant_id uuid not null,
  -- Watering reminders are soil checks, not watering orders (D16).
  task_type text not null check (task_type in ('soil_check', 'fertilize')),
  due_at timestamptz not null,
  -- "Overdue" is derived from due_at, not stored.
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'snoozed', 'skipped', 'cancelled')),
  completed_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'snoozed') = (snoozed_until is not null)),
  foreign key (plant_id, user_id) references public.user_plants (id, user_id) on delete cascade
);

create index care_tasks_open_idx on public.care_tasks (user_id, due_at)
  where status in ('pending', 'snoozed');

create trigger care_tasks_updated_at
  before update on public.care_tasks
  for each row execute function public.set_updated_at();

-- Daily quota per provider, counted per KST day (D8).
create table public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('plantnet', 'perenual', 'trefle', 'google_translate')),
  operation text not null,
  status text not null check (status in ('success', 'failure', 'quota_exceeded')),
  called_at timestamptz not null default now()
);

create index api_usage_logs_daily_idx on public.api_usage_logs (provider, called_at);

-- Storage paths queued for deletion in the same transaction that deletes rows (D18).
create table public.storage_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deletion_request_id uuid not null,
  storage_path text not null check (storage_path like user_id::text || '/%'),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deletion_request_id, storage_path)
);

create index storage_deletions_pending_idx on public.storage_deletions (status) where status <> 'done';

create trigger storage_deletions_updated_at
  before update on public.storage_deletions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Nothing in this app is public: the anon role gets no table access at all.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

alter table public.plant_species enable row level security;
alter table public.species_aliases enable row level security;
alter table public.species_care enable row level security;
alter table public.user_plants enable row level security;
alter table public.plant_photos enable row level security;
alter table public.identification_sessions enable row level security;
alter table public.plant_analyses enable row level security;
alter table public.analysis_photos enable row level security;
alter table public.care_records enable row level security;
alter table public.care_record_photos enable row level security;
alter table public.plant_observations enable row level security;
alter table public.care_logs enable row level security;
alter table public.care_tasks enable row level security;
alter table public.api_usage_logs enable row level security;
alter table public.storage_deletions enable row level security;

-- Shared species reference: signed-in users read it, and the server (acting as
-- the signed-in owner) caches search results into it. No deletes.
create policy "species readable by signed-in users" on public.plant_species
  for select to authenticated using (true);
create policy "species cached by signed-in users" on public.plant_species
  for insert to authenticated with check (true);
create policy "species refreshed by signed-in users" on public.plant_species
  for update to authenticated using (true) with check (true);

create policy "aliases readable by signed-in users" on public.species_aliases
  for select to authenticated using (true);
create policy "aliases cached by signed-in users" on public.species_aliases
  for insert to authenticated with check (true);

-- Care reference: API rows are shared; user rows only visible to their owner.
create policy "care readable: api rows or own rows" on public.species_care
  for select to authenticated
  using (source <> 'user' or user_id = (select auth.uid()));
create policy "care writable: api rows or own rows" on public.species_care
  for insert to authenticated
  with check (
    (source = 'perenual' and user_id is null)
    or (source = 'user' and user_id = (select auth.uid()))
  );
create policy "care updatable: api rows or own rows" on public.species_care
  for update to authenticated
  using (source <> 'user' or user_id = (select auth.uid()))
  with check (
    (source = 'perenual' and user_id is null)
    or (source = 'user' and user_id = (select auth.uid()))
  );
create policy "care deletable: own rows only" on public.species_care
  for delete to authenticated
  using (source = 'user' and user_id = (select auth.uid()));

-- Per-user tables: owner only, for every operation.
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_plants', 'plant_photos', 'identification_sessions', 'plant_analyses',
    'analysis_photos', 'care_records', 'care_record_photos', 'plant_observations', 'care_logs', 'care_tasks', 'api_usage_logs', 'storage_deletions'
  ]
  loop
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, one folder per user (D4, D6)
-- ---------------------------------------------------------------------------

-- Server re-encodes every upload to JPEG at most 3 MB (D4).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plant-photos', 'plant-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "plant photos: owner folder only (select)" on storage.objects
  for select to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "plant photos: owner folder only (insert)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "plant photos: owner folder only (update)" on storage.objects
  for update to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "plant photos: owner folder only (delete)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
