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
  $$ insert into public.user_plants (id, species_id, nickname, initial_last_repotted_range)
     values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '거실 몬스테라', 'never') $$,
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
  $$ insert into public.user_plants (user_id, nickname)
     values ('00000000-0000-0000-0000-00000000000a', 'planted for A') $$,
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

-- B's own photo, used below to check that A cannot link it.
select lives_ok(
  $$ insert into public.plant_photos (id, storage_path, photo_type)
     values ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b/b1.jpg', 'health') $$,
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
  $$ insert into public.user_plants (initial_last_repotted_range) values ('6개월 이상') $$,
  '23514', null,
  'repotting range must be one of the ten confirmed codes (05 snapshot rule 1)'
);

select throws_ok(
  $$ insert into public.user_plants (status) values ('archived') $$,
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

-- A pot can be registered with only a typed name or as unknown species (D12).
select lives_ok(
  $$ insert into public.user_plants (user_entered_name, environment, initial_last_watered_range, light_level, pot_material)
     values ('우리집 고무나무', 'indoor', 'about_1_week', 'bright_indirect', 'terracotta') $$,
  'a pot with a typed name and S05 choices is saved'
);

select lives_ok(
  $$ insert into public.user_plants (environment) values ('outdoor') $$,
  'a pot with unknown species is saved'
);

select throws_ok(
  $$ insert into public.user_plants (nickname) values ('   ') $$,
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
  $$ insert into public.user_plants (id, nickname)
     values ('20000000-0000-0000-0000-00000000000c', '베란다 고무나무') $$,
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
  $$ insert into public.plant_analyses (id, plant_id, provider, endpoint, analyzed_at)
     values ('40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
             'plantnet', 'health', now()) $$,
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

select * from finish();
rollback;
