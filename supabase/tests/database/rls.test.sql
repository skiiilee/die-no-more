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
