# API integration design (draft)

Candidate providers (not yet contracted or validated):
- Pl@ntNet: identification candidates.
- Kindwise plant.health: health signals; optionally evaluate its identification API.
- Perenual: species care reference subject to its terms for personal, non-commercial use, caching limits and coverage.
- OpenAI: explanations grounded in confirmed species, observations and rules.

Never send API secrets to browser. Normalize provider responses and preserve provider/model/version provenance. Scores are not necessarily calibrated probabilities.

## Proposed internal endpoints
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

## Pending verification
Exact API payloads, personal non-commercial use terms, price (including whether free tiers apply), quotas, caching and retention limits must be checked against current provider documentation before implementation. Non-commercial use does not exempt API terms, copyright or privacy requirements. Record the check date and source URL for each provider.
