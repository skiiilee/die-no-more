# Database design (draft)

PostgreSQL + Supabase; UUID primary keys and timestamptz event times.

## Tables
- `users` (or auth.users with profile): identity/preferences.
- `plant_species`: canonical scientific name, common names, family, provider IDs.
- `species_aliases`: alternate names/languages.
- `species_care`: light, watering, soil, temperature, source provenance.
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
- All per-user rows protected by RLS; Storage private and scoped.
- Completing tasks and writing care logs should be atomic and idempotent.
- Define retention and deletion of provider raw responses.

This is a conceptual schema; migrations, indexes, FKs and RLS SQL require implementation review.
