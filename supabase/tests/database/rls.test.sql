-- RLS and integrity tests for the initial schema (CLAUDE.md: enforce ownership and RLS).
-- Run with: npx supabase test db   (needs a local or CI database; see README)
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Two owners. In production there is one, but RLS must still isolate users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');


-- ---------------------------------------------------------------------------
-- Setup as user A
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.plant_species (id, scientific_name_key, scientific_name, source)
     values ('10000000-0000-0000-0000-000000000001', 'monstera deliciosa', 'Monstera deliciosa', 'perenual') $$,
  'signed-in user can cache a species'
);

select lives_ok(
  $$ insert into public.user_plants (id, species_id, nickname, environment, initial_last_watered_range,
                                   light_level, initial_last_repotted_range, pot_material)
     values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '거실 몬스테라',
             'indoor', 'about_1_week', 'bright_indirect', 'never', 'plastic') $$,
  'A registers a pot; user_id defaults to auth.uid()'
);

select is(
  (select user_id from public.user_plants where id = '20000000-0000-0000-0000-00000000000a'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'pot is owned by A'
);

select lives_ok(
  $$ insert into public.care_logs (plant_id, care_type, performed_at, idempotency_key)
     values ('20000000-0000-0000-0000-00000000000a', 'water', now(), 'a-water-1') $$,
  'A logs watering on own pot'
);

select throws_ok(
  $$ insert into public.care_logs (plant_id, care_type, performed_at, idempotency_key)
     values ('20000000-0000-0000-0000-00000000000a', 'water', now(), 'a-water-1') $$,
  '23505', null,
  'the same idempotency key cannot create a second log'
);

select lives_ok(
  $$ insert into public.species_care (species_id, field, value, source, user_id, review_status)
     values ('10000000-0000-0000-0000-000000000001', 'light', '"밝은 간접광"', 'user',
             '00000000-0000-0000-0000-00000000000a', 'pending') $$,
  'A saves a user-entered care value (S13)'
);

select lives_ok(
  $$ insert into public.species_care (species_id, field, value, source, fetched_at)
     values ('10000000-0000-0000-0000-000000000001', 'watering', '"Average"', 'perenual', now()) $$,
  'API care values are shared rows without an owner'
);

-- ---------------------------------------------------------------------------
-- User B cannot see or touch A's data
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select is((select count(*)::int from public.user_plants), 0, 'B sees none of A''s pots');
select is((select count(*)::int from public.care_logs), 0, 'B sees none of A''s care logs');
select is(
  (select count(*)::int from public.species_care where source = 'user'), 0,
  'B does not see A''s user-entered care values'
);
select is(
  (select count(*)::int from public.species_care where source = 'perenual'), 1,
  'B does see shared API care values'
);
select is((select count(*)::int from public.plant_species), 1, 'species reference is shared');

with changed as (
  update public.user_plants set nickname = 'hijacked'
  where id = '20000000-0000-0000-0000-00000000000a' returning 1
)
select is((select count(*)::int from changed), 0, 'B cannot update A''s pot');

with removed as (
  delete from public.user_plants where id = '20000000-0000-0000-0000-00000000000a' returning 1
)
select is((select count(*)::int from removed), 0, 'B cannot delete A''s pot');

select throws_ok(
  $$ insert into public.user_plants (user_id, nickname, environment, initial_last_watered_range, light_level, initial_last_repotted_range, pot_material)
     values ('00000000-0000-0000-0000-00000000000a', 'planted for A', 'indoor', 'unknown', 'unknown', 'unknown', 'plastic') $$,
  '42501', null,
  'B cannot create a pot owned by A'
);

select throws_ok(
  $$ insert into public.care_logs (plant_id, care_type, performed_at, idempotency_key)
     values ('20000000-0000-0000-0000-00000000000a', 'water', now(), 'b-on-a') $$,
  '23503', null,
  'B cannot attach a care log to A''s pot (composite FK)'
);

select throws_ok(
  $$ insert into public.species_care (species_id, field, value, source, user_id, review_status)
     values ('10000000-0000-0000-0000-000000000001', 'soil', '"x"', 'user',
             '00000000-0000-0000-0000-00000000000a', 'pending') $$,
  '42501', null,
  'B cannot write a user care value in A''s name'
);

-- B's own photo, used below to check that A cannot link it. A care-log photo:
-- health photos always need a pot (20261124100000_health_check_save.sql).
select lives_ok(
  $$ insert into public.plant_photos (id, storage_path, photo_type)
     values ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b/b1.jpg', 'log') $$,
  'B stores an unattached photo in own folder'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitors get nothing
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
  $$ select count(*) from public.user_plants $$,
  '42501', null,
  'anon has no access to pots'
);
select throws_ok(
  $$ select count(*) from public.plant_species $$,
  '42501', null,
  'anon has no access to the species reference'
);

-- ---------------------------------------------------------------------------
-- Integrity rules from the specs
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.user_plants (environment, initial_last_watered_range, light_level, initial_last_repotted_range, pot_material)
     values ('indoor', 'unknown', 'unknown', '6개월 이상', 'plastic') $$,
  '23514', null,
  'repotting range must be one of the ten confirmed codes (05 snapshot rule 1)'
);

select throws_ok(
  $$ insert into public.user_plants (status, environment, initial_last_watered_range, light_level, initial_last_repotted_range, pot_material)
     values ('archived', 'indoor', 'unknown', 'unknown', 'unknown', 'plastic') $$,
  '23514', null,
  'an archived pot must record when it was archived'
);

select throws_ok(
  $$ insert into public.plant_observations (plant_id, observed_at)
     values ('20000000-0000-0000-0000-00000000000a', now()) $$,
  '23514', null,
  'an empty observation is not saved'
);

select throws_ok(
  $$ insert into public.plant_photos (storage_path, photo_type)
     values ('00000000-0000-0000-0000-00000000000b/x.jpg', 'plant') $$,
  '23514', null,
  'a photo row must point into its owner''s storage folder'
);

select throws_ok(
  $$ insert into public.plant_species (scientific_name_key, scientific_name, source)
     values ('Monstera  Deliciosa', 'Monstera deliciosa', 'perenual') $$,
  '23514', null,
  'scientific name key must be normalized (ADR-0003 D10)'
);

select throws_ok(
  $$ insert into public.care_tasks (plant_id, task_type, due_at, status)
     values ('20000000-0000-0000-0000-00000000000a', 'water', now(), 'pending') $$,
  '23514', null,
  'reminder tasks are soil checks, not watering orders (D16)'
);

-- Provider usage log names the providers actually used (ADR-0004 D1).
select lives_ok(
  $$ insert into public.api_usage_logs (provider, operation, status)
     values ('azure_translator', 'translate', 'success') $$,
  'usage can be logged for Azure Translator'
);

select throws_ok(
  $$ insert into public.api_usage_logs (provider, operation, status)
     values ('google_translate', 'translate', 'success') $$,
  '23514', null,
  'Google Translation is not an adopted provider'
);

-- A pot can be registered with a typed name or as unknown species (D12).
select lives_ok(
  $$ insert into public.user_plants (user_entered_name, environment, initial_last_watered_range, light_level,
                                   initial_last_repotted_range, pot_material)
     values ('우리집 고무나무', 'indoor', 'about_1_week', 'bright_indirect', 'months_3_to_6', 'terracotta') $$,
  'a pot with a typed name and S05 choices is saved'
);

select lives_ok(
  $$ insert into public.user_plants (environment, initial_last_watered_range, light_level, initial_last_repotted_range, pot_material)
     values ('outdoor', 'unknown', 'unknown', 'unknown', 'garden_bed') $$,
  'a pot with unknown species is saved'
);

-- Every S05 choice is required (user decision, 2026-11-13).
select throws_ok(
  $$ insert into public.user_plants (initial_last_watered_range, light_level, initial_last_repotted_range, pot_material)
     values ('unknown', 'unknown', 'unknown', 'plastic') $$,
  '23502', null,
  'a pot without environment is not saved'
);

select throws_ok(
  $$ insert into public.user_plants (environment, light_level, initial_last_repotted_range, pot_material)
     values ('indoor', 'unknown', 'unknown', 'plastic') $$,
  '23502', null,
  'a pot without initial_last_watered_range is not saved'
);

select throws_ok(
  $$ insert into public.user_plants (environment, initial_last_watered_range, initial_last_repotted_range, pot_material)
     values ('indoor', 'unknown', 'unknown', 'plastic') $$,
  '23502', null,
  'a pot without light_level is not saved'
);

select throws_ok(
  $$ insert into public.user_plants (environment, initial_last_watered_range, light_level, pot_material)
     values ('indoor', 'unknown', 'unknown', 'plastic') $$,
  '23502', null,
  'a pot without initial_last_repotted_range is not saved'
);

select throws_ok(
  $$ insert into public.user_plants (environment, initial_last_watered_range, light_level, initial_last_repotted_range)
     values ('indoor', 'unknown', 'unknown', 'unknown') $$,
  '23502', null,
  'a pot without pot_material is not saved'
);

select throws_ok(
  $$ insert into public.user_plants (nickname, environment, initial_last_watered_range, light_level, initial_last_repotted_range, pot_material)
     values ('   ', 'indoor', 'unknown', 'unknown', 'unknown', 'plastic') $$,
  '23514', null,
  'an empty nickname is not stored'
);

-- Empty observations: blank or whitespace-only text counts as empty (03 §7).
select throws_ok(
  $$ insert into public.plant_observations (plant_id, observed_at, notes)
     values ('20000000-0000-0000-0000-00000000000a', now(), '') $$,
  '23514', null,
  'an observation with only an empty note is not saved'
);

select throws_ok(
  $$ insert into public.plant_observations (plant_id, observed_at, leaf_state, pest_observation, notes)
     values ('20000000-0000-0000-0000-00000000000a', now(), '   ', E'\t', E' \n ') $$,
  '23514', null,
  'an observation with only whitespace is not saved'
);

select lives_ok(
  $$ insert into public.plant_observations (plant_id, observed_at, notes)
     values ('20000000-0000-0000-0000-00000000000a', now(), '  새 잎이 나옴 ') $$,
  'an observation with real text is saved'
);

select lives_ok(
  $$ insert into public.plant_observations (plant_id, observed_at, soil_state, notes)
     values ('20000000-0000-0000-0000-00000000000a', now(), 'dry', '') $$,
  'an observation with only a soil state is saved'
);

-- ---------------------------------------------------------------------------
-- Photo links: analyses and S08 records (GPT review on PR #11, item 1)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.user_plants (id, nickname, environment, initial_last_watered_range, light_level, initial_last_repotted_range, pot_material)
     values ('20000000-0000-0000-0000-00000000000c', '베란다 고무나무', 'indoor', 'unknown', 'unknown', 'unknown', 'plastic') $$,
  'A registers a second pot'
);

select lives_ok(
  $$ insert into public.plant_photos (id, plant_id, storage_path, photo_type) values
       ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a/a1.jpg', 'health'),
       ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000c',
        '00000000-0000-0000-0000-00000000000a/a2.jpg', 'health') $$,
  'A stores one photo on each pot'
);

select lives_ok(
  $$ insert into public.plant_analyses (id, plant_id, provider, endpoint, analyzed_at, outcome)
     values ('40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
             'plantnet', 'health', now(), 'unclear') $$,
  'A saves a health check on the first pot'
);

select lives_ok(
  $$ insert into public.analysis_photos (analysis_id, photo_id, plant_id)
     values ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1',
             '20000000-0000-0000-0000-00000000000a') $$,
  'a health check links a photo of the same pot'
);

select throws_ok(
  $$ insert into public.analysis_photos (analysis_id, photo_id, plant_id)
     values ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000ff',
             '20000000-0000-0000-0000-00000000000a') $$,
  '23503', null,
  'a health check cannot link a photo that does not exist'
);

select throws_ok(
  $$ insert into public.analysis_photos (analysis_id, photo_id, plant_id)
     values ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2',
             '20000000-0000-0000-0000-00000000000a') $$,
  '23503', null,
  'a health check cannot link a photo of another pot'
);

select throws_ok(
  $$ insert into public.analysis_photos (analysis_id, photo_id, plant_id)
     values ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2',
             '20000000-0000-0000-0000-00000000000c') $$,
  '23503', null,
  'a link cannot claim another pot to match the photo'
);

select throws_ok(
  $$ insert into public.analysis_photos (analysis_id, photo_id, plant_id)
     values ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000b1',
             '20000000-0000-0000-0000-00000000000a') $$,
  '23503', null,
  'a health check cannot link another user''s photo'
);

-- One S08 save writes a record, its logs, its observation and its photo links.
select lives_ok(
  $$ insert into public.care_records (id, plant_id, recorded_at, idempotency_key)
     values ('50000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
             now(), 's08-1') $$,
  'A saves an S08 record'
);

select throws_ok(
  $$ insert into public.care_records (plant_id, recorded_at, idempotency_key)
     values ('20000000-0000-0000-0000-00000000000a', now(), 's08-1') $$,
  '23505', null,
  'a double submit cannot create a second record'
);

select lives_ok(
  $$ insert into public.care_logs (plant_id, record_id, care_type, performed_at, idempotency_key) values
       ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 'water', now(), 's08-1-water'),
       ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 'fertilize', now(), 's08-1-fert') $$,
  'one record holds several care logs of different types'
);

select throws_ok(
  $$ insert into public.care_logs (plant_id, record_id, care_type, performed_at, idempotency_key)
     values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
             'water', now(), 's08-1-water-again') $$,
  '23505', null,
  'one record writes at most one watering log'
);

select throws_ok(
  $$ insert into public.care_logs (plant_id, record_id, care_type, performed_at, idempotency_key)
     values ('20000000-0000-0000-0000-00000000000c', '50000000-0000-0000-0000-00000000000a',
             'prune', now(), 's08-1-other-pot') $$,
  '23503', null,
  'a care log cannot join a record of another pot'
);

select lives_ok(
  $$ insert into public.plant_observations (plant_id, record_id, observed_at, soil_state)
     values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', now(), 'moist') $$,
  'the record holds its observation'
);

select throws_ok(
  $$ insert into public.plant_observations (plant_id, record_id, observed_at, notes)
     values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', now(), '두 번째') $$,
  '23505', null,
  'one record holds at most one observation'
);

select lives_ok(
  $$ insert into public.care_record_photos (record_id, photo_id, plant_id)
     values ('50000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1',
             '20000000-0000-0000-0000-00000000000a') $$,
  'a record links a photo of the same pot'
);

select throws_ok(
  $$ insert into public.care_record_photos (record_id, photo_id, plant_id)
     values ('50000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000ff',
             '20000000-0000-0000-0000-00000000000a') $$,
  '23503', null,
  'a record cannot link a photo that does not exist'
);

select throws_ok(
  $$ insert into public.care_record_photos (record_id, photo_id, plant_id)
     values ('50000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2',
             '20000000-0000-0000-0000-00000000000a') $$,
  '23503', null,
  'a record cannot link a photo of another pot'
);

select throws_ok(
  $$ insert into public.care_record_photos (record_id, photo_id, plant_id)
     values ('50000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000b1',
             '20000000-0000-0000-0000-00000000000a') $$,
  '23503', null,
  'a record cannot link another user''s photo'
);

select throws_ok(
  $$ update public.plant_photos set plant_id = '20000000-0000-0000-0000-00000000000c'
     where id = '30000000-0000-0000-0000-0000000000a1' $$,
  '23503', null,
  'a linked photo cannot be moved to another pot'
);

-- ---------------------------------------------------------------------------
-- S13 review status (ADR-0003 D13; GPT review on PR #11, item 2)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.species_care (species_id, field, value, source, user_id, review_status)
     values ('10000000-0000-0000-0000-000000000001', 'soil', '"배수 좋은 흙"', 'user',
             '00000000-0000-0000-0000-00000000000a', 'approved') $$,
  '23514', null,
  'an approved user value must record its approval time'
);

select throws_ok(
  $$ update public.species_care set review_status = 'approved'
     where source = 'user' and field = 'light' $$,
  '23514', null,
  'approving without an approval time is rejected'
);

select throws_ok(
  $$ update public.species_care set approved_at = now()
     where source = 'perenual' and field = 'watering' $$,
  '23514', null,
  'API values carry no approval time'
);

select lives_ok(
  $$ update public.species_care set review_status = 'approved', approved_at = now()
     where source = 'user' and field = 'light' $$,
  'A approves the reviewed value with its approval time'
);

select is(
  (select review_status || ':' || (approved_at is not null)::text
     from public.species_care where source = 'user' and field = 'light'),
  'approved:true',
  'approval status and time are stored'
);

select throws_ok(
  $$ update public.species_care set review_status = 'pending'
     where source = 'user' and field = 'light' $$,
  '23514', null,
  'returning to review must clear the approval time'
);

update public.species_care set fetched_at = now() where source = 'user' and field = 'light';
select is(
  (select review_status from public.species_care where source = 'user' and field = 'light'),
  'approved',
  'an update that keeps the value keeps the approval'
);

update public.species_care set value = '"보통"' where source = 'user' and field = 'light';
select is(
  (select review_status || ':' || (approved_at is null)::text
     from public.species_care where source = 'user' and field = 'light'),
  'pending:true',
  'editing an approved value returns it to review and clears the approval time'
);

update public.species_care
   set value = '"약함"', review_status = 'approved', approved_at = now()
 where source = 'user' and field = 'light';
select is(
  (select review_status from public.species_care where source = 'user' and field = 'light'),
  'pending',
  'a value change cannot be approved in the same write'
);

-- B cannot see A's records or photo links.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select is((select count(*)::int from public.care_records), 0, 'B sees none of A''s S08 records');
select is((select count(*)::int from public.care_record_photos), 0, 'B sees none of A''s record photo links');
select is((select count(*)::int from public.analysis_photos), 0, 'B sees none of A''s analysis photo links');

-- ---------------------------------------------------------------------------
-- Storage: private bucket, own folder only
-- ---------------------------------------------------------------------------
-- Bucket settings are not readable by signed-in users, so check as the owner.
reset role;
select is(
  (select public from storage.buckets where id = 'plant-photos'),
  false,
  'plant-photos bucket is private'
);

-- Back to A for the upload checks (the bucket check above runs as the owner).
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('plant-photos', '00000000-0000-0000-0000-00000000000a/p1.jpg') $$,
  'A can upload into own folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('plant-photos', '00000000-0000-0000-0000-00000000000b/p1.jpg') $$,
  '42501', null,
  'A cannot upload into B''s folder'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'plant-photos'), 0,
  'B cannot list A''s photos'
);

-- ---------------------------------------------------------------------------
-- Name search: plant DB search and stored provider answers (S03/S04)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.plant_species (scientific_name_key, scientific_name, common_name_en, korean_name,
                                       korean_name_source, source, image_url)
     values ('ficus elastica', 'Ficus elastica', 'Rubber plant', '고무나무', 'trefle', 'trefle',
             'https://example.test/ficus.jpg'),
            ('ficus lyrata', 'Ficus lyrata', 'Fiddle-leaf fig', null, null, 'perenual', null),
            ('aloe 50%', 'Aloe 50%', null, null, null, 'perenual', null) $$,
  'search results are cached in the plant DB'
);

select is(
  (select array_agg(scientific_name order by scientific_name) from public.search_species('FICUS')),
  array['Ficus elastica', 'Ficus lyrata'],
  'search ignores case and matches part of the scientific name'
);

select is(
  (select scientific_name from public.search_species('  고무  ')),
  'Ficus elastica',
  'search matches part of the Korean name after trimming'
);

select is(
  (select scientific_name from public.search_species('fiddle')),
  'Ficus lyrata',
  'search matches the English common name'
);

select is(
  (select scientific_name from public.search_species('ficus lyrata') limit 1),
  'Ficus lyrata',
  'an exact scientific name comes first'
);

select is(
  (select count(*)::int from public.search_species('%')),
  1,
  'a % in the query is matched literally, not as a wildcard'
);

select is((select count(*)::int from public.search_species('   ')), 0, 'a blank query finds nothing');

select throws_ok(
  $$ insert into public.plant_species (scientific_name_key, scientific_name, source, image_url)
     values ('pilea peperomioides', 'Pilea peperomioides', 'trefle', 'http://example.test/p.jpg') $$,
  '23514', null,
  'reference photos must be https URLs'
);

select throws_ok(
  $$ insert into public.plant_species (scientific_name_key, scientific_name, source, korean_name)
     values ('hoya carnosa', 'Hoya carnosa', 'trefle', '호야') $$,
  '23514', null,
  'a Korean name records where it came from (ADR-0004 D2)'
);

select throws_ok(
  $$ update public.plant_species set care_status = 'available' where scientific_name_key = 'ficus lyrata' $$,
  '23514', null,
  'a care lookup result records when it was checked'
);

select lives_ok(
  $$ update public.plant_species set care_status = 'outside_free_range', care_checked_at = now()
     where scientific_name_key = 'ficus lyrata' $$,
  'a species outside the Perenual free range is marked once'
);

select lives_ok(
  $$ insert into public.species_care (species_id, field, value, source, fetched_at)
     select id, 'care_level', '"Medium"', 'perenual', now()
     from public.plant_species where scientific_name_key = 'ficus elastica' $$,
  'Perenual care level is stored as a care field'
);

select lives_ok(
  $$ insert into public.species_care (species_id, field, value, source, fetched_at)
     select id, 'description', '"A rubber plant."', 'perenual', now()
     from public.plant_species where scientific_name_key = 'ficus elastica' $$,
  'the Perenual description is stored in English as a care field'
);

-- ---------------------------------------------------------------------------
-- Provider call reservation (PR #15 review, items 1 and 4)
-- ---------------------------------------------------------------------------
-- Role here is user B, who has no usage rows yet.
select ok(
  (select reservation_id is not null and blocked is null
     from public.reserve_provider_call('perenual', 'search', now() - interval '1 hour', 2)),
  'a call is reserved while the cap has room'
);

select is(
  (select status from public.api_usage_logs where provider = 'perenual' order by called_at desc limit 1),
  'reserved',
  'the reservation is a counted usage row'
);

select ok(
  (select reservation_id is not null from public.reserve_provider_call('perenual', 'search', now() - interval '1 hour', 2)),
  'the second call of a cap of 2 is reserved'
);

select is(
  (select blocked from public.reserve_provider_call('perenual', 'search', now() - interval '1 hour', 2)),
  'limit',
  'the third call is refused: retries and repeated requests count against the cap'
);

select is(
  (select blocked from public.reserve_provider_call('perenual', 'search', now() + interval '1 minute', 2)),
  null,
  'calls before the day boundary do not count (KST day passed in by the app)'
);

update public.api_usage_logs set status = 'quota_exceeded'
 where id = (select id from public.api_usage_logs where provider = 'perenual' order by called_at limit 1);
select is(
  (select blocked from public.reserve_provider_call('perenual', 'search', now() - interval '1 hour', 90)),
  'quota',
  'after the provider reported its quota used up, no call is reserved that day'
);

select lives_ok(
  $$ insert into public.api_usage_logs (provider, operation, status, retry_at)
     values ('trefle', 'search', 'failure', now() + interval '30 seconds') $$,
  'a Trefle 429 records when it may be asked again'
);

select is(
  (select blocked || ':' || (retry_at > now())::text
     from public.reserve_provider_call('trefle', 'search', now() - interval '1 hour', 300)),
  'cooldown:true',
  'Trefle is skipped until its Retry-After time, and the time is returned'
);

update public.api_usage_logs set retry_at = now() - interval '1 second' where provider = 'trefle';
select ok(
  (select reservation_id is not null from public.reserve_provider_call('trefle', 'search', now() - interval '1 hour', 300)),
  'Trefle is asked again once the Retry-After time has passed'
);

select ok(
  (select reservation_id is not null from public.reserve_provider_call('plantnet', 'identify', now() - interval '1 hour', 1)),
  'a cooldown or cap of one provider does not block another'
);

select throws_ok(
  $$ insert into public.api_usage_logs (provider, operation, status) values ('trefle', 'search', 'pending') $$,
  '23514', null,
  'usage status is one of the known values'
);

-- ---------------------------------------------------------------------------
-- Photo identification (20261117100000_photo_identification.sql)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.plant_species (scientific_name_key, scientific_name, source, image_credit)
     values ('credit only', 'Credit only', 'plantnet', 'Someone / Pl@ntNet, cc-by-sa') $$,
  '23514', null,
  'a photo credit is never stored without its photo'
);

select lives_ok(
  $$ insert into public.plant_species (scientific_name_key, scientific_name, source, image_url, image_credit)
     values ('monstera adansonii', 'Monstera adansonii', 'plantnet',
             'https://bs.plantnet.org/image/m/010f', 'Edgardo Barbieri / Pl@ntNet, cc-by-sa') $$,
  'a Pl@ntNet candidate is stored with its photo and credit'
);

select lives_ok(
  $$ insert into public.identification_sessions (id, provider, endpoint, provider_version, status, candidates)
     values ('60000000-0000-0000-0000-00000000000a', 'plantnet', '/v2/identify/all', '2026-03-20 (7.5)', 'completed',
             '[{"rank": 1, "score": 0.88, "speciesId": "x", "scientificName": "Monstera deliciosa"}]') $$,
  'a completed identification keeps endpoint, engine version and ranked candidates'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.identification_sessions where id = '60000000-0000-0000-0000-00000000000a'),
  0,
  'B cannot see A''s identification'
);

-- ---------------------------------------------------------------------------
-- Pot photos (20261119100000_pot_photos.sql): S05/S06 photo, delete per D18
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.plant_photos (storage_path, photo_type)
     values ('00000000-0000-0000-0000-00000000000a/no-pot.jpg', 'plant') $$,
  '23514', null,
  'a pot photo always belongs to a pot'
);

select lives_ok(
  $$ insert into public.plant_photos (id, plant_id, storage_path, photo_type, attached_at) values
       ('30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a/p1.jpg', 'plant', now()) $$,
  'A links a photo to own pot'
);

-- newest_pot_photos (20261119110000, PR #20 review P2): one row per pot, the newest.
insert into public.plant_photos (id, plant_id, storage_path, photo_type, attached_at, created_at) values
  ('30000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-00000000000a/p2.jpg', 'plant', now(), now() - interval '1 day'),
  ('30000000-0000-0000-0000-0000000000f3', '20000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-00000000000a/p3.jpg', 'plant', now(), now() - interval '2 days');

select is(
  (select count(*)::int from public.newest_pot_photos(array[
     '20000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000c']::uuid[])),
  2, 'one newest photo per pot, however many photos a pot has'
);
select is(
  (select id from public.newest_pot_photos(array['20000000-0000-0000-0000-00000000000a']::uuid[])),
  '30000000-0000-0000-0000-0000000000f1'::uuid,
  'the newest photo is the one returned'
);
select is(
  (select count(*)::int from public.newest_pot_photos(array['20000000-0000-0000-0000-00000000000a']::uuid[])
    where id = '30000000-0000-0000-0000-0000000000a1'),
  0, 'a health photo on the pot is not a pot photo'
);

-- B cannot delete A's photo: no row comes back, nothing is queued.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.delete_pot_photo('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1')),
  0, 'B cannot delete A''s pot photo'
);
select is(
  (select count(*)::int from public.newest_pot_photos(array['20000000-0000-0000-0000-00000000000a']::uuid[])),
  0, 'B cannot see A''s pot photos'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.plant_photos where id = '30000000-0000-0000-0000-0000000000f1'),
  1, 'A''s photo is still there after B tried');

select is(
  (select count(*)::int from public.delete_pot_photo('20000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-0000000000f1')),
  0, 'a photo is only deleted through its own pot'
);
select is(
  (select count(*)::int from public.delete_pot_photo('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1')),
  0, 'only pot photos are deleted here (a health photo is not)'
);

select is(
  (select storage_path from public.delete_pot_photo('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1')),
  '00000000-0000-0000-0000-00000000000a/p1.jpg',
  'A deletes own pot photo and gets the file path to remove'
);
select is((select count(*)::int from public.plant_photos where id = '30000000-0000-0000-0000-0000000000f1'),
  0, 'the photo row is gone');
select is(
  (select status from public.storage_deletions where storage_path = '00000000-0000-0000-0000-00000000000a/p1.jpg'),
  'pending', 'its file is queued for removal in the same transaction (D18)'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$ select * from public.delete_pot_photo('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'anon cannot delete pot photos'
);
select throws_ok(
  $$ select * from public.newest_pot_photos(array['20000000-0000-0000-0000-00000000000a']::uuid[]) $$,
  '42501', null,
  'anon cannot read pot photos'
);

-- ---------------------------------------------------------------------------
-- Care AI single-flight claim with ownership (20261118100000_ai_care.sql,
-- PR #19 review P1 and 2026-11-18 re-review: only the current claim's owner
-- may release or finish it)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

insert into public.plant_species (id, scientific_name_key, scientific_name, source)
values ('70000000-0000-0000-0000-00000000000a', 'claim test', 'Claim test', 'perenual');

-- Request A claims.
select set_config('test.claim_a', public.claim_care_ai('70000000-0000-0000-0000-00000000000a')::text, true);
select isnt(current_setting('test.claim_a'), '', 'the first request gets a claim id');

select is(public.claim_care_ai('70000000-0000-0000-0000-00000000000a'), null,
  'a second request cannot claim while the first claim is live');

select is(public.release_care_ai('70000000-0000-0000-0000-00000000000a', gen_random_uuid()), false,
  'a wrong claim id cannot release the claim');

-- A's claim expires; request B takes a new one.
update public.plant_species set care_ai_claimed_at = now() - interval '3 minutes'
 where id = '70000000-0000-0000-0000-00000000000a';
select set_config('test.claim_b', public.claim_care_ai('70000000-0000-0000-0000-00000000000a')::text, true);
select ok(current_setting('test.claim_b') not in ('', current_setting('test.claim_a')),
  'after 2 minutes the claim is treated as abandoned and B gets a new claim id');

-- A finishes late: neither its release nor its save touches B's claim.
select is(public.release_care_ai('70000000-0000-0000-0000-00000000000a', current_setting('test.claim_a')::uuid), false,
  'an expired claim cannot release the newer claim');
select is(public.finish_care_ai('70000000-0000-0000-0000-00000000000a', current_setting('test.claim_a')::uuid,
          'model-a', '{"light": "A light"}'::jsonb), false,
  'an expired claim cannot store a late answer');
select is((select care_ai_claim_id::text from public.plant_species where id = '70000000-0000-0000-0000-00000000000a'),
  current_setting('test.claim_b'), 'B still holds its claim after A''s late release and save');
select is((select count(*)::int from public.species_care where species_id = '70000000-0000-0000-0000-00000000000a'),
  0, 'nothing from the expired claim is stored');
select is(public.claim_care_ai('70000000-0000-0000-0000-00000000000a'), null,
  'a third request still cannot claim while B holds the claim');

-- B finishes: values stored as 'ai' with the model, species marked as asked.
select is(public.finish_care_ai('70000000-0000-0000-0000-00000000000a', current_setting('test.claim_b')::uuid,
          'model-b', '{"light": "밝은 간접광", "watering_benchmark": {"min": 5, "max": 7, "unit": "days"}}'::jsonb), true,
  'the current claim stores its answer');
select is((select count(*)::int from public.species_care
            where species_id = '70000000-0000-0000-0000-00000000000a' and source = 'ai' and ai_model = 'model-b' and user_id is null),
  2, 'the answer is stored as shared ai rows with the model');
select ok((select care_ai_checked_at is not null and care_ai_claim_id is null and care_ai_claimed_at is null
             from public.plant_species where id = '70000000-0000-0000-0000-00000000000a'),
  'finishing marks the species as asked and clears the claim');
select is(public.claim_care_ai('70000000-0000-0000-0000-00000000000a'), null,
  'a species already asked is never claimed again');
select is(public.finish_care_ai('70000000-0000-0000-0000-00000000000a', current_setting('test.claim_b')::uuid,
          'model-b', '{}'::jsonb), false,
  'the same claim cannot finish twice');

-- An empty answer: marked as asked, nothing stored.
insert into public.plant_species (id, scientific_name_key, scientific_name, source)
values ('70000000-0000-0000-0000-00000000000b', 'claim empty', 'Claim empty', 'perenual');
select set_config('test.claim_c', public.claim_care_ai('70000000-0000-0000-0000-00000000000b')::text, true);
select is(public.finish_care_ai('70000000-0000-0000-0000-00000000000b', current_setting('test.claim_c')::uuid, null, '{}'::jsonb), true,
  'an empty answer is recorded with no model');
select is((select count(*)::int from public.species_care where species_id = '70000000-0000-0000-0000-00000000000b'),
  0, 'an empty answer stores no values');

-- A failed call releases its own claim, so the next visit can ask.
insert into public.plant_species (id, scientific_name_key, scientific_name, source)
values ('70000000-0000-0000-0000-00000000000c', 'claim release', 'Claim release', 'perenual');
select set_config('test.claim_d', public.claim_care_ai('70000000-0000-0000-0000-00000000000c')::text, true);
select is(public.release_care_ai('70000000-0000-0000-0000-00000000000c', current_setting('test.claim_d')::uuid), true,
  'the owner releases its claim after a failed call');
select isnt(public.claim_care_ai('70000000-0000-0000-0000-00000000000c'), null,
  'a released species can be claimed again');

select is(public.claim_care_ai('70000000-0000-0000-0000-0000000000ff'), null,
  'an unknown species cannot be claimed');

select throws_ok(
  $$ update public.plant_species set care_ai_claim_id = gen_random_uuid()
      where id = '70000000-0000-0000-0000-00000000000b' $$,
  '23514', null,
  'a claim id is never stored without its claim time'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$ select public.claim_care_ai('70000000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'anon cannot claim a care AI call'
);
select throws_ok(
  $$ select public.finish_care_ai('70000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'm', '{}'::jsonb) $$,
  '42501', null,
  'anon cannot store a care AI answer'
);
select throws_ok(
  $$ select public.release_care_ai('70000000-0000-0000-0000-00000000000a', gen_random_uuid()) $$,
  '42501', null,
  'anon cannot release a care AI claim'
);
select throws_ok(
  $$ select * from public.search_species('ficus') $$,
  '42501', null,
  'anon cannot search the plant DB'
);
select throws_ok(
  $$ select * from public.reserve_provider_call('trefle', 'search', now(), 300) $$,
  '42501', null,
  'anon cannot reserve provider calls'
);

-- ---------------------------------------------------------------------------
-- Health check save (20261124100000_health_check_save.sql): S07-S
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.plant_photos (storage_path, photo_type)
     values ('00000000-0000-0000-0000-00000000000a/h-no-pot.jpg', 'health') $$,
  '23514', null,
  'a health photo always belongs to a pot'
);

-- The request records the paths as pending clean-up before uploading (PR #26 review P2).
insert into public.storage_deletions (deletion_request_id, storage_path, status) values
  ('60000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a/h1.jpg', 'pending'),
  ('60000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a/h2.jpg', 'pending');

select set_config('test.health_a', (select analysis_id from public.save_health_check(
  '20000000-0000-0000-0000-00000000000a',
  '{"outcome": "found", "causes": [{"code": "BOTRCI", "name": "Botrytis cinerea", "score": 0.3}],
    "symptoms": ["spots"], "noticed": "this_week", "notes": "잎에 회색 가루",
    "analyzed_at": "2026-11-24T06:00:00Z", "uncertainty": "사진만으로 확정할 수 없음",
    "ai_explanation": {"causes": [], "checks": ["통풍 확인"], "actions": []}, "ai_judgement": null, "ai_model": "model-x"}'::jsonb,
  array['00000000-0000-0000-0000-00000000000a/h1.jpg', '00000000-0000-0000-0000-00000000000a/h2.jpg'],
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '60000000-0000-0000-0000-0000000000c1'
))::text, true);

select is(
  (select outcome || '|' || noticed || '|' || notes || '|' || ai_model || '|' || result_digest from public.plant_analyses
    where id = current_setting('test.health_a')::uuid),
  'found|this_week|잎에 회색 가루|model-x|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'A saves a found result with the observation, notes, AI model and result digest'
);
select ok(
  (select ai_judgement is null and ai_explanation is not null from public.plant_analyses
    where id = current_setting('test.health_a')::uuid),
  'a JSON null AI part is stored as no value'
);
select is(
  (select count(*)::int from public.analysis_photos ap
     join public.plant_photos p on p.id = ap.photo_id
    where ap.analysis_id = current_setting('test.health_a')::uuid
      and p.photo_type = 'health' and p.attached_at is not null and p.plant_id = '20000000-0000-0000-0000-00000000000a'),
  2, 'both photos are stored as attached health photos of the pot and linked in the same call'
);
select is(
  (select count(*)::int from public.storage_deletions where deletion_request_id = '60000000-0000-0000-0000-0000000000c1'),
  0, 'the saved photos are no longer pending clean-up (same transaction)'
);

-- The same result again (retry or double request): the saved check comes back, nothing new.
select is(
  (select analysis_id::text || '|' || plant_id::text || '|' || created::text from public.save_health_check(
     '20000000-0000-0000-0000-00000000000c',
     '{"outcome": "unclear", "causes": [], "analyzed_at": "2026-11-24T06:00:00Z"}'::jsonb,
     array['00000000-0000-0000-0000-00000000000a/h1-again.jpg'],
     'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid())),
  current_setting('test.health_a') || '|20000000-0000-0000-0000-00000000000a|false',
  'saving the same result again returns the first check, on its pot, as not created'
);
select is(
  (select count(*)::int from public.plant_photos where storage_path = '00000000-0000-0000-0000-00000000000a/h1-again.jpg'),
  0, 'a repeated save adds no photo rows'
);
select throws_ok(
  $$ insert into public.plant_analyses (plant_id, provider, endpoint, analyzed_at, outcome, result_digest)
     values ('20000000-0000-0000-0000-00000000000a', 'plantnet', 'x', now(), 'unclear', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  '23505', null,
  'one check per result digest per user, even for concurrent writers'
);
select throws_ok(
  $$ select * from public.save_health_check('20000000-0000-0000-0000-00000000000a',
       '{"outcome": "unclear", "causes": [], "analyzed_at": "2026-11-24T06:00:00Z"}'::jsonb,
       array['00000000-0000-0000-0000-00000000000a/h5.jpg'], null, gen_random_uuid()) $$,
  '22023', null,
  'a saved health check needs its result digest'
);

select throws_ok(
  $$ select * from public.save_health_check('20000000-0000-0000-0000-00000000000a',
       '{"outcome": "found", "causes": [], "analyzed_at": "2026-11-24T06:00:00Z"}'::jsonb,
       array['00000000-0000-0000-0000-00000000000a/h3.jpg'], 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', gen_random_uuid()) $$,
  '23514', null,
  'a found result needs causes'
);
select throws_ok(
  $$ select * from public.save_health_check('20000000-0000-0000-0000-00000000000a',
       '{"outcome": "unclear", "causes": [], "analyzed_at": "2026-11-24T06:00:00Z",
         "ai_judgement": {"signs": ["x"]}}'::jsonb,
       array['00000000-0000-0000-0000-00000000000a/h4.jpg'], 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', gen_random_uuid()) $$,
  '23514', null,
  'AI text is never stored without its model'
);
select throws_ok(
  $$ select * from public.save_health_check('20000000-0000-0000-0000-00000000000a',
       '{"outcome": "unclear", "causes": [], "analyzed_at": "2026-11-24T06:00:00Z"}'::jsonb,
       array[]::text[], 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', gen_random_uuid()) $$,
  '22023', null,
  'a saved health check needs at least one photo'
);
select is(
  (select count(*)::int from public.plant_photos
    where storage_path in ('00000000-0000-0000-0000-00000000000a/h3.jpg', '00000000-0000-0000-0000-00000000000a/h4.jpg')),
  0, 'a refused save leaves no photo rows behind'
);

-- B cannot save onto A's pot, nor see A's check, nor reuse A's result.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok(
  $$ select * from public.save_health_check('20000000-0000-0000-0000-00000000000a',
       '{"outcome": "unclear", "causes": [], "analyzed_at": "2026-11-24T06:00:00Z"}'::jsonb,
       array['00000000-0000-0000-0000-00000000000b/hb.jpg'], 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', gen_random_uuid()) $$,
  null, null,
  'B cannot save a health check on A''s pot'
);
select is(
  (select count(*)::int from public.plant_analyses where id = current_setting('test.health_a')::uuid),
  0, 'B cannot see A''s saved health check'
);
select throws_ok(
  $$ select * from public.save_health_check('20000000-0000-0000-0000-00000000000a',
       '{"outcome": "unclear", "causes": [], "analyzed_at": "2026-11-24T06:00:00Z"}'::jsonb,
       array['00000000-0000-0000-0000-00000000000b/hb2.jpg'], 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid()) $$,
  null, null,
  'A''s result digest never hands A''s check to B'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$ select * from public.save_health_check('20000000-0000-0000-0000-00000000000a', '{}'::jsonb, array['x/y.jpg'], 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid()) $$,
  '42501', null,
  'anon cannot save health checks'
);
-- ---------------------------------------------------------------------------
-- Care record save (20261126100000_care_record_save.sql): S08
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.plant_photos (storage_path, photo_type)
     values ('00000000-0000-0000-0000-00000000000a/c-no-pot.jpg', 'log') $$,
  '23514', null,
  'a care record photo always belongs to a pot'
);

insert into public.storage_deletions (deletion_request_id, storage_path, status) values
  ('60000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a/c1.jpg', 'pending');

select set_config('test.care_a', (select record_id from public.save_care_record(
  '20000000-0000-0000-0000-00000000000a',
  '{"recorded_at": "2026-11-26T05:30:00Z", "notes": "베란다",
    "actions": [{"type": "water", "amount_ml": 300, "notes": null}, {"type": "prune", "amount_ml": null, "notes": "아래 잎"}],
    "observation": {"soil_state": "dry", "notes": "새 잎"}}'::jsonb,
  array['00000000-0000-0000-0000-00000000000a/c1.jpg'],
  'care-key-1', '60000000-0000-0000-0000-0000000000d1'
))::text, true);

select ok(
  (select notes = '베란다' and recorded_at = '2026-11-26T05:30:00Z'::timestamptz
     from public.care_records where id = current_setting('test.care_a')::uuid),
  'A saves a record with its time and common memo'
);
select is(
  (select string_agg(care_type || ':' || coalesce(amount::text, '-') || ':' || coalesce(unit, '-') || ':' || coalesce(notes, '-'), ',' order by care_type)
     from public.care_logs where record_id = current_setting('test.care_a')::uuid),
  'prune:-:-:아래 잎,water:300:ml:-',
  'one log per ticked activity, the amount in ml for watering only'
);
select is(
  (select soil_state || '|' || notes from public.plant_observations where record_id = current_setting('test.care_a')::uuid),
  'dry|새 잎',
  'the soil state and observation text are one observation'
);
select is(
  (select count(*)::int from public.care_record_photos l join public.plant_photos p on p.id = l.photo_id
    where l.record_id = current_setting('test.care_a')::uuid and p.photo_type = 'log' and p.attached_at is not null),
  1, 'the photo is stored as an attached log photo and linked in the same call'
);
select is(
  (select count(*)::int from public.storage_deletions where deletion_request_id = '60000000-0000-0000-0000-0000000000d1'),
  0, 'the saved photo is no longer pending clean-up'
);

-- The same form again (double submit, retry): the first record comes back, nothing new.
select is(
  (select record_id::text || '|' || created::text from public.save_care_record(
     '20000000-0000-0000-0000-00000000000a',
     '{"recorded_at": "2026-11-26T05:30:00Z", "actions": [{"type": "fertilize"}]}'::jsonb,
     null, 'care-key-1', null)),
  current_setting('test.care_a') || '|false',
  'saving the same form again returns the first record as not created'
);
select is(
  (select count(*)::int from public.care_records where idempotency_key = 'care-key-1'), 1,
  'a repeated save adds no record'
);

-- A soil check alone is an observation, never a watering log.
select set_config('test.care_soil', (select record_id from public.save_care_record(
  '20000000-0000-0000-0000-00000000000a',
  '{"recorded_at": "2026-11-26T06:00:00Z", "actions": [], "observation": {"soil_state": "moist", "notes": null}}'::jsonb,
  null, 'care-key-2', null
))::text, true);
select is(
  (select count(*)::int from public.care_logs where record_id = current_setting('test.care_soil')::uuid), 0,
  'a soil check writes no care log'
);

select throws_ok(
  $$ select * from public.save_care_record('20000000-0000-0000-0000-00000000000a',
       '{"recorded_at": "2026-11-26T06:00:00Z", "actions": [], "observation": null, "notes": "  "}'::jsonb,
       null, 'care-key-3', null) $$,
  '22023', null,
  'an empty record is not saved'
);
select throws_ok(
  $$ select * from public.save_care_record('20000000-0000-0000-0000-00000000000a',
       '{"recorded_at": "2026-11-26T06:00:00Z", "actions": [{"type": "water"}, {"type": "water"}]}'::jsonb,
       null, 'care-key-4', null) $$,
  '23505', null,
  'one record writes at most one log per activity'
);
select is(
  (select count(*)::int from public.care_records where idempotency_key = 'care-key-4'), 0,
  'a refused save leaves no record behind'
);
select throws_ok(
  $$ select * from public.save_care_record('20000000-0000-0000-0000-00000000000a',
       '{"recorded_at": "2026-11-26T06:00:00Z", "actions": [{"type": "water"}]}'::jsonb,
       null, null, null) $$,
  '22023', null,
  'a record needs its form key'
);

-- B cannot save onto A's pot, see A's record, or reuse A's form key.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok(
  $$ select * from public.save_care_record('20000000-0000-0000-0000-00000000000a',
       '{"recorded_at": "2026-11-26T06:00:00Z", "actions": [{"type": "water"}]}'::jsonb,
       null, 'care-key-b', null) $$,
  null, null,
  'B cannot save a care record on A''s pot'
);
select is(
  (select count(*)::int from public.care_records where id = current_setting('test.care_a')::uuid), 0,
  'B cannot see A''s care record'
);
select throws_ok(
  $$ select * from public.save_care_record('20000000-0000-0000-0000-00000000000a',
       '{"recorded_at": "2026-11-26T06:00:00Z", "actions": [{"type": "water"}]}'::jsonb,
       null, 'care-key-1', null) $$,
  null, null,
  'A''s form key never hands A''s record to B'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$ select * from public.save_care_record('20000000-0000-0000-0000-00000000000a', '{}'::jsonb, null, 'k', null) $$,
  '42501', null,
  'anon cannot save care records'
);

reset role;

select * from finish();
rollback;
