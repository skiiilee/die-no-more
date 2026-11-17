-- Photo identification (S03 → S03-P → S04-A), ADR-0003 D4–D7.
--
-- 1. plant_species.image_credit: Pl@ntNet reference photos are CC BY-SA and
--    come with a citation ("Author / Pl@ntNet, cc-by-sa"); it is stored with
--    the photo and shown under it (live check 2026-11-17). Never without a photo.
-- 2. identification_sessions keeps the endpoint and the provider's engine
--    version next to the normalized candidates (D6, 04-api-design
--    "preserve provider/model/version provenance"). Raw answers are not stored.

alter table public.plant_species
  add column image_credit text check (image_credit is null or btrim(image_credit) <> ''),
  add constraint plant_species_image_credit_with_photo check (image_credit is null or image_url is not null);

alter table public.identification_sessions
  add column endpoint text,
  add column provider_version text;
