# Database design

Status: Concept schema approved as implementation baseline (2026-11-12, [ADR-0003](decisions/ADR-0003-implementation-decisions.md)). Column types, indexes and RLS SQL are finalized in the migration PR.

PostgreSQL + Supabase; UUID primary keys and timestamptz event times. Date math for tasks uses Asia/Seoul.

## Plant DB (shared species data, keyed by scientific name)
- `plant_species`: `scientific_name_key` (unique, normalized per ADR-0003 D10), scientific name as returned, English common name, `korean_name` (nullable), `korean_name_translated_at`, family, provider IDs (Perenual, Trefle, Pl@ntNet), `source`, `fetched_at`.
- `species_aliases`: alternate names/languages. Never used for automatic merging.
- `species_care`: one row per species and field (light, watering, watering benchmark days min/max, fertilizer interval days, soil, temperature, toxicity, pests…), `source` (`perenual` | `user`), `user_id` (set only for `user` rows, RLS-protected), `fetched_at` or `entered_at`/`updated_at`. API and user values coexist; user values never overwrite API values and never drive reminders (D13).

## Pot DB (per user, RLS on `user_id`)
- `user_plants`: `user_id`, `species_id` nullable, `user_entered_name` nullable (manual/unknown, D12), `nickname` nullable, indoor/outdoor, location, `status` (`active` | `archived`), `light_level`, `pot_material`, `initial_last_watered_range`, `initial_last_repotted_range`, `initial_state_recorded_at`, `water_reminder_enabled`, `fertilizer_reminder_enabled`.
- `plant_photos`: `user_id`, `plant_id` nullable, private storage path, photo type, `captured_at`, `attached_at` nullable (unattached photos deleted after 24h, D6).
- `identification_sessions`: `user_id`, status (`processing` | `completed` | `failed`), normalized candidates JSON (order, score, provider, fetched_at), `selected_species_id` nullable.
- `plant_analyses`: `user_id`, `plant_id` not null (saving requires a pot), provider/endpoint, user-entered symptoms, candidate causes, uncertainty notes, photo refs, `analyzed_at`. Provider raw responses are not stored.
- `plant_observations`: `plant_id`, soil state, leaf state, pest observations, notes, `observed_at`.
- `care_logs`: `plant_id`, care type, `performed_at`, amount/unit, notes, `idempotency_key` unique.
- `care_tasks`: `plant_id`, type (`soil_check` | `fertilize`), `due_at`, status (`pending` | `completed` | `snoozed` | `skipped` | `cancelled`; overdue is derived), `completed_at`, `snoozed_until`.
- `api_usage_logs`: provider, operation, status, `called_at` (daily quota per KST day, D8).

## Constraints
- Species may be unknown; `user_plants.species_id` nullable.
- Identification can precede plant creation.
- AI candidates (`identification_sessions.candidates`) stay separate from the user-confirmed `species_id`.
- All per-user rows protected by RLS; Storage private and scoped by user.
- Completing a task and writing a care log is one atomic, idempotent transaction. Snooze, skip and soil-check completion never write a watering log.
- Archive keeps all rows; permanent delete removes the pot's rows and Storage objects (D18).
- `care_recommendations` and `notification_preferences` from the earlier draft are dropped: recommendations are computed from rules at read time (D3), and reminder flags live on `user_plants` (D16, D17).
