# API integration design (draft)

**Stage: proposal only; no provider enabled and no implementation before UI sign-off.** The preferred API candidates have evolved since PR #1:
- Pl@ntNet: proposed species-identification provider, with manual naming/unknown-species fallback.
- Gemini: proposed generator of first-use plant species care-information drafts and optional photo-based symptom explanations; do not treat symptoms as definitive diagnoses.
- Kindwise plant.health: previously considered but **not preferred for personal use** due to recurring credit costs; keep as a historical alternative only.
- Perenual: optional source for source-verified species reference data, not required for the empty-DB/on-demand MVP.
- OpenAI: optional alternative explanation model, not part of initial preferred stack.

All third-party terms, quotas, privacy, model quality and pricing remain to be verified before enabling requests.

Never send API secrets to the browser. Static GitHub Pages cannot host protected Next.js API routes. Use Supabase Edge Functions for authenticated third-party requests, server-side usage/budget limits, and safe error responses. Normalize provider responses; persist provider/model/version, data source and review state. Scores are not necessarily calibrated probabilities.

## Logical operations / endpoint contracts (design only)
The paths below are **logical API operations inherited from PR #1**, not working GitHub Pages URLs. During implementation, map provider-backed operations to authenticated Edge Functions and user-owned reads/writes to Supabase with RLS. Do not create Next.js route handlers for these paths.

| Method | Path | Purpose |
|---|---|---|
| POST | /api/uploads | Validate and store image |
| POST | /api/identifications | Request identification |
| GET | /api/identifications/:id | Identification status and candidates |
| GET | /api/species/search | Manual species search |
| GET | /api/species/:id | Species reference |
| POST | /api/plants | Register plant |
| GET | /api/plants | List own plants |
| GET/PATCH | /api/plants/:id | Read/update own plant |
| POST | /api/plants/:id/analyses | Request health analysis |
| GET | /api/plants/:id/analyses | Analysis history |
| POST | /api/plants/:id/observations | Save observation |
| POST | /api/plants/:id/care-logs | Save completed activity |
| GET | /api/plants/:id/recommendations | Recommendations |
| GET | /api/care-tasks | Due and upcoming tasks |
| PATCH | /api/care-tasks/:id | Complete, skip or snooze |
| GET | /api/plants/:id/timeline | Chronological history |

## Error handling
Reject unsupported files, excessive size, or non-plant photos with actionable feedback. Use provider timeouts, limited retries, idempotency keys and per-user rate limits. If uncertain, present multiple candidates or request additional observations; do not fabricate a diagnosis.

## On-demand species-care information
- Start `plant_species` and `species_care` without preseeded entries. Confirm species with the owner before searching/generating.
- Reuse cached care information for the same canonical species; user plants and their care histories remain separate.
- On cache miss, request an optional Gemini draft once (idempotency/unique key), store provenance and **unverified** status, and allow corrections. Do not present model text as a verified horticultural fact without a trustworthy reference.
- When the provider is unavailable, quota exhausted or privacy consent denied, manual registration and logging still work. No implicit payment or automatic upgrade.

## Pending verification
Exact API payloads, personal non-commercial use terms, price (including whether free tiers apply), quotas, caching and retention limits must be checked against current provider documentation before implementation. Non-commercial use does not exempt API terms, copyright or privacy requirements. Record the check date and source URL for each provider.
