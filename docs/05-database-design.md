# Database design (draft)

PostgreSQL + Supabase; UUID primary keys and timestamptz event times.

## Tables
- `users` (or auth.users with profile): identity/preferences.
- `plant_species`: canonical scientific name, common names, family, provider IDs. **Starts empty**, grows from user-confirmed species, supports stable canonical/provider key and uniqueness.
- `species_aliases`: alternate names/languages.
- `species_care`: light, watering, soil, temperature, source provenance, AI/provider/model/version, created/updated timestamps, confidence notes and `verification_status` (`unverified`/`reviewed`/`verified`). **Chosen design:** store generated drafts here with `verification_status = 'unverified'` (not directly as verified canonical facts in `plant_species`); starts empty and preserves user corrections/provenance.
- `user_plants`: user_id, species_id nullable, nickname, indoor/outdoor, location, status.
- `plant_photos`: plant_id nullable, private storage path, photo type, captured_at.
- `identification_sessions`: user_id, status, candidates JSON, selected_species_id nullable.
- `plant_analyses`: plant_id, type, provider/model, normalized result JSON, timestamp.
- `plant_observations`: plant_id, soil state, leaf state, pest observations, notes.
- `care_logs`: plant_id, care type, performed_at, amount/unit, notes.
- `care_tasks`: plant_id, type, due_at, status, completed_at.
- `care_recommendations`: plant_id, priority, reason codes, explanation, review time.
- `notification_preferences`: user_id, channel, timezone, enabled.
- `api_usage_logs`: provider, operation, status, cost estimate.

## Constraints
- Species may be unknown; user plant species_id nullable.
- Identification can precede plant creation.
- Keep AI candidate identity separate from user-confirmed identity.
- All per-user rows protected by RLS; Storage private and scoped. Species reference tables require explicit **read vs write** policies; public web access does not imply unrestricted reference-data writes.
- Completing tasks and writing care logs should be atomic and idempotent.
- Define retention and deletion of provider raw responses.

## Additional design requirements for on-demand care knowledge
- First confirmed species registration checks canonical scientific name/provider identity before cache miss and generation.
- Prevent duplicate care drafts with a unique species identity plus idempotent upsert/locking. Treat model output as an editable, unverified draft until an appropriate source is checked.
- Maintain reference-data provenance/correction history; keep the user-confirmed species identity in `plant_species`, separate AI care drafts in `species_care` using `verification_status`, and separate personal user plant histories in `user_plants`.
- Allow user plant creation even if external AI data generation fails or its quota is exhausted.
- A task to **check soil** must not create an actual watering care log. Only a confirmed watering action creates that type of log atomically.

This is a conceptual schema; **no migrations are authorized until the UI is reviewed and approved**. Indexes, FKs and RLS SQL require later implementation review.
