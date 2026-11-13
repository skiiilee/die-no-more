# Database design

Status: Concept schema approved as implementation baseline (2026-11-12, [ADR-0003](decisions/ADR-0003-implementation-decisions.md)). Column types, indexes and RLS SQL are finalized in the migration PR.

PostgreSQL + Supabase; UUID primary keys and timestamptz event times. Date math for tasks uses Asia/Seoul.

## Plant DB (shared species data, keyed by scientific name)
- `plant_species`: `scientific_name_key` (unique, normalized per ADR-0003 D10), scientific name as returned, English common name, `korean_name` (nullable), `korean_name_translated_at`, family, provider IDs (Perenual, Trefle, Pl@ntNet), `source`, `fetched_at`.
- `species_aliases`: alternate names/languages. Never used for automatic merging.
- `species_care`: one row per species and field (light, watering, watering benchmark days min/max, fertilizer interval days, soil, temperature, toxicity, pests…), `source` (`perenual` | `user`), `user_id` (set only for `user` rows, RLS-protected), `fetched_at` or `entered_at`/`updated_at`; for `user` rows `review_status` (`pending` | `approved`) and `approved_at` (D13). API and user values coexist; user values never overwrite API values and never drive reminders (D13).

## Pot DB (per user, RLS on `user_id`)
- `user_plants`: `user_id`, `species_id` nullable, `user_entered_name` nullable (manual/unknown, D12), `nickname` nullable, indoor/outdoor, location, `status` (`active` | `archived`), `light_level`, `pot_material`, `initial_last_watered_range`, `initial_last_repotted_range`, `initial_state_recorded_at`, `water_reminder_enabled`, `fertilizer_reminder_enabled`.
- `plant_photos`: `user_id`, `plant_id` nullable, private storage path, photo type, `captured_at`, `attached_at` nullable (unattached photos deleted after 24h, D6).
- `identification_sessions`: `user_id`, status (`processing` | `completed` | `failed`), normalized candidates JSON (order, score, provider, fetched_at), `selected_species_id` nullable.
- `plant_analyses`: `user_id`, `plant_id` not null (saving requires a pot), provider/endpoint, user-entered symptoms, candidate causes, uncertainty notes, `analyzed_at`. Provider raw responses are not stored. Photos are linked through `analysis_photos`.
- `analysis_photos`: `analysis_id`, `photo_id`, `plant_id`, `user_id`. Both FKs include `(plant_id, user_id)`, so only an existing photo of the same pot and owner can be linked.
- `care_records`: one S08 save (03 §7): `plant_id`, `recorded_at` (the shared record time), `idempotency_key` unique per user. Groups the care logs and observation written together.
- `care_record_photos`: photos attached in one S08 save; same FK rule as `analysis_photos`.
- `plant_observations`: `plant_id`, `record_id` nullable (at most one observation per record), soil state, leaf state, pest observations, notes, `observed_at`. Blank or whitespace-only text counts as empty.
- `care_logs`: `plant_id`, `record_id` nullable (null for S09 task completion; at most one log per care type per record), care type, `performed_at`, amount/unit, notes, `idempotency_key` unique.
- `care_tasks`: `plant_id`, type (`soil_check` | `fertilize`), `due_at`, status (`pending` | `completed` | `snoozed` | `skipped` | `cancelled`; overdue is derived), `completed_at`, `snoozed_until`.
- `api_usage_logs`: provider, operation, status, `called_at` (daily quota per KST day, D8).
- `storage_deletions`: `user_id`, `deletion_request_id`, storage path, status (`pending` | `done` | `failed`), attempts, last error. Filled in the same transaction that deletes rows (D18).

## Constraints
- Species may be unknown; `user_plants.species_id` nullable.
- Identification can precede plant creation.
- AI candidates (`identification_sessions.candidates`) stay separate from the user-confirmed `species_id`.
- All per-user rows protected by RLS; Storage private and scoped by user.
- Completing a task and writing a care log is one atomic, idempotent transaction. Snooze, skip and soil-check completion never write a watering log.
- Archive (S06-A) keeps all rows. Permanent delete (S12-D only) deletes rows and queues Storage paths in one transaction, then deletes objects with retry (D18).
- `care_recommendations` and `notification_preferences` from the earlier draft are dropped: recommendations are computed from rules at read time (D3), and reminder flags live on `user_plants` (D16, D17).

## Implemented (2026-11-12)

Migrations: `supabase/migrations/20261111171114_initial_schema.sql`, `20261113090000_azure_translator_provider.sql` (`api_usage_logs.provider`: `google_translate` → `azure_translator`, ADR-0004). RLS tests: `supabase/tests/database/rls.test.sql` (run in CI).

- Per-user tables: owner-only RLS for every operation, plus a composite FK `(plant_id, user_id) → user_plants(id, user_id)` so a row cannot point at another user's pot.
- `anon` has no table access. Shared species tables are readable and cacheable (insert/update, no delete) by signed-in users, because the server writes search results with the owner's session. Kept as is for a single user; see `docs/09-deferred-items.md` DF-01.
- Storage: private bucket `plant-photos`, JPEG only, 3 MB limit, objects under `<user_id>/…` readable and writable only by that user.
- Photo links (`analysis_photos`, `care_record_photos`) reject missing photos, photos of another pot and photos of another user. A linked photo cannot be moved to another pot.
- S13 review (D13): for user rows, `review_status = 'approved'` if and only if `approved_at` is set. A trigger returns a user row to `pending` and clears `approved_at` whenever `value` changes, so approval is always a separate write after the value is saved.
- Left to the S08 save function (later PR), not the schema: a `care_records` row with no log, observation or photo, and setting `plant_photos.attached_at` when a photo is linked.

### Stored codes for S05 choices

| UI (Korean) | Column | Codes |
|---|---|---|
| 직사광선 / 밝은 간접광 / 보통 / 약함 / 잘 모르겠음 | `light_level` | `direct`, `bright_indirect`, `medium`, `low`, `unknown` |
| 플라스틱 / 테라코다,도기 / 유리 / 자기,석기 세라믹 / 화단 | `pot_material` | `plastic`, `terracotta`, `glass`, `ceramic`, `garden_bed` |
| 당일~1일 전 / 일주일 전 / 한달 전 / 모름 | `initial_last_watered_range` | `within_1_day`, `about_1_week`, `about_1_month`, `unknown` |
| 분갈이 10개 구간 (05 snapshot rule 1, in order) | `initial_last_repotted_range` | `within_1_day`, `days_2_to_6`, `week_1_to_month_1`, `months_1_to_2`, `months_2_to_3`, `months_3_to_6`, `months_6_to_12`, `over_1_year`, `unknown`, `never` |
| 흙 상태: 마름 / 적당 / 젖음 / 잘 모르겠음 | `plant_observations.soil_state` | `dry`, `moist`, `wet`, `unknown` |
