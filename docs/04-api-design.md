# API integration design (draft)

Candidate providers (documentation checked 2026-11-12, see "Provider check" below; no contracts):
- Pl@ntNet: photo identification candidates (`/v2/identify`) and health candidates (`/v2/diseases/identify`).
- Trefle: name search candidates.
- Perenual: species care reference and English common names, subject to its terms for personal, non-commercial use, caching limits and coverage.
- Google Cloud Translation: Korean display names, saved to the plant DB when first needed.
- Kindwise plant.health: not adopted.
- OpenAI and other LLMs: not adopted in MVP ([ADR-0003](decisions/ADR-0003-implementation-decisions.md) D3).

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

## Provider check (documentation, 2026-11-12)

Checked against each provider's public documentation on 2026-11-12 (ADR-0003 D8, D16). Items marked **live check** are not stated in the docs and need one real call with a key before the feature that depends on them is turned on.

### Pl@ntNet — photo identification and health candidates
Sources: [pricing](https://my.plantnet.org/pricing), [terms](https://my.plantnet.org/terms_of_use), [identify](https://my.plantnet.org/doc/api/identify), [diseases](https://my.plantnet.org/doc/api/diseases).

- **Quota:** 500 identifications per day, reset at midnight UTC (09:00 KST). Over quota → HTTP 429; the free plan is never billed. Species and disease identification share this quota (1 credit per request).
- **Terms:** free use allowed up to 500/day, commercial use too within that limit. One free account per person. Attribution is optional for free use. Submitted photos are kept only in memory during identification; Pl@ntNet stores date, time and image URLs of queries. Caching of results is not addressed.
- **Request:** `POST https://my-api.plantnet.org/v2/identify/{project}?api-key=…` (`project=all`). `images` 1–5 files of one plant, JPEG or PNG only, total ≤ 50 MB. `organs` one per image: `leaf` | `flower` | `fruit` | `bark` | `auto` (default). Optional `nb-results`, `lang`, `no-reject`, `include-related-images`, `detailed`.
- **Response:** `results[]` with `score` (0–1), `species.scientificNameWithoutAuthor`, `species.commonNames`, `gbif.id`, `powo.id`; plus `bestMatch`, `version` (engine), `remainingIdentificationRequests`. Non-plant photo or no prediction → **404 "Species not found"**.
- **Health:** `POST /v2/diseases/identify`, same image rules. `results[]` has `name` (EPPO code), `score`, `description` (label in the `lang` language). **Live check:** whether `lang=ko` is offered (`/v2/languages`); otherwise descriptions stay in English.
- **Fit with our decisions:** our uploads are JPEG, long side 1600 px (D4) → short side ≥ 800 px for normal photos, which Pl@ntNet recommends; it resizes the short side to 1280 px itself. The key stays server-side (query parameter in a server call only).

### Perenual — care reference
Sources: [pricing](https://perenual.com/subscription-api-pricing), [API docs](https://perenual.com/docs/api), [terms](https://perenual.com/terms-of-service).

- **Quota:** free "Personal" plan, **100 requests per day**, species data, care guides and hardiness map **only for species IDs 1–3000** (the database lists 10,000+). Commercial use only on paid plans.
- **Terms:** licence "for personal purposes"; no commercial use; must not "duplicate, distribute, publicly showcase, or publicly display Perenual Content"; no data-mining tools. Storing responses in our DB is not addressed explicitly (see decision 2 below).
- **Endpoints:** `GET /api/v2/species-list?key=&q=&page=` (items: `id`, `common_name`, `scientific_name`, `other_name`, `family`, `genus`, `default_image` with licence fields); `GET /api/v2/species/details/{id}`; `GET /api/species-care-guide-list` (sections `watering`, `sunlight`).
- **Care fields (details):** `watering` (`Frequent` | `Average` | `Minimum` | `None`), `watering_general_benchmark` `{ value, unit }` with `unit: "days"` and a range such as `5-7` (shown unquoted in the docs, so the type is unclear), `sunlight` (array of strings, inconsistent case), `pruning_month`, `pruning_count`. `x…` watering/sunlight fields are paid-only.
- **Fertilizer:** no fertilizer or feeding field exists in the docs. Per D16 the fertilizer reminder stays hidden; no new ADR is needed because D16 already expected this.
- **Live check (blocks D16 flag):** (a) what a free key returns for an ID above 3000 (error, placeholder text, or empty fields); (b) the real type and format of `watering_general_benchmark.value` (string `"5-7"`, number, or missing); (c) how many common houseplants fall within IDs 1–3000.

### Trefle — name search
Sources: [getting started](https://docs.trefle.io/docs/guides/getting-started), [searching](https://docs.trefle.io/docs/guides/searching), [plant fields](https://docs.trefle.io/docs/advanced/plants-fields), [terms](https://trefle.io/terms).

- **Quota:** 60 requests per minute per account and IP; 429 with `Retry-After`. No daily cap stated. Free with registration.
- **Terms:** credit Trefle and the sources listed in each response when reusing data. No explicit statement on commercial use.
- **Request:** `GET https://trefle.io/api/v1/plants/search?token=…&q=…` (also `v1/species/search`). Token is a query parameter; keep it server-side.
- **Response:** `data[]` with `id`, `scientific_name`, `common_name` (English, may be null), `family`, `genus`, `synonyms`, `image_url`; `meta.total`. Details have `common_names` per language. **Live check:** whether Korean names exist (`common_names.ko`); search examples are English only.
- Growth fields (`light` 1–9 etc.) are ecological indicators calibrated for European flora, not care instructions. They are not used for reminders.

### Google Cloud Translation — Korean display names
Source: [pricing](https://cloud.google.com/products/translate/pricing).

- **Quota:** first 500,000 characters per month free (Basic and Advanced combined, does not roll over), then **$20 per million characters**. Whitespace counts.
- **Billing risk (D8):** the API needs a billing account, and Google bills automatically above the free amount. D8 forbids automatic paid use, so the owner sets a per-day character quota on the API in the Cloud console (**10,000 characters/day**, owner decision 2026-11-13; ≤ 310,000/month, inside the free amount) in addition to our `api_usage_logs` limit. A species name is about 20–40 characters, so normal use is far below the free amount.

### Limits to set in server env (D8)
| Provider | Provider limit | Our daily limit (proposed) |
|---|---|---|
| Pl@ntNet | 500/day (UTC) | 450/day (KST day; margin for the UTC/KST offset) |
| Perenual | 100/day | 90/day |
| Trefle | 60/min | 300/day (personal use; also back off on 429) |
| Google Translation | 500,000 chars/month free | 200 calls/day and console quota 10,000 chars/day |

### Decisions (owner approved, 2026-11-12)
1. **Perenual free coverage (IDs 1–3000).** Approved. Species outside the range get no Perenual care data, so per D16 their water reminder is not offered and S13 '직접 입력하기' is shown. No paid plan is assumed.
2. **Storing Perenual data.** Approved. Care values are cached in `species_care` for personal, private use to stay within 100/day. They are never exposed publicly, and data is fetched per species when needed, never bulk-downloaded.
3. **Google billing cap.** Approved. The owner set the console quota to 10,000 characters per day (2026-11-13).

## Live check (2026-11-13)

One run with the owner's keys from a local machine (about 30 calls). Keys were never printed or committed.

### Perenual
- **Free range answer:** a free key asking for a species ID above 3000 gets **HTTP 429** with the plain-text body `Please Upgrade Plan - https://perenual.com/subscription-api-pricing. Sorry😬`, while `x-ratelimit-remaining` still shows quota left (85 of 100). The adapter must read this as "outside the free range" (no care data, D16 → no water reminder, show S13), **not** as a quota or rate limit, and must not retry it.
- **Benchmark format:** `watering_general_benchmark` came back as `{"value": "\"7-10\"", "unit": "days"}` for *Epipremnum aureum* (ID 2773): a string with literal quote characters around the range. The parser strips quotes and whitespace and accepts only `<min>-<max>` or `<n>` with `unit = "days"`; anything else means "no benchmark" (no reminder, no invented interval).
- **Paid-only fields:** inside the free range the `x…` fields and `other_images` hold an upgrade message instead of data. The adapter ignores them.
- **Coverage of common houseplants (`species-list` search, first exact match):**

| Plant | Perenual ID | Free care data |
|---|---|---|
| Aloe vera | 728 | Yes |
| Calathea lancifolia | 1469 | Yes |
| Chlorophytum comosum 'Vittatum' | 1847 | Yes (cultivar only) |
| Epipremnum aureum (pothos) | 2773 | Yes |
| Ficus elastica | 2961 | Yes |
| Ficus lyrata | 2963 | Yes |
| Monstera deliciosa | 5257 | **No** |
| Philodendron hederaceum | 5869 | **No** |
| Sansevieria trifasciata | 7171 | **No** |
| Spathiphyllum (peace lily) | 7463 | **No** |
| Zamioculcas zamiifolia (ZZ) | 8386 | **No** |
| Pilea peperomioides | not found | **No** |

  6 of 12 common houseplants have free care data. Under the approved rule the other half gets no water reminder and is sent to S13 '직접 입력하기'.
- `species-list` search itself works for every ID (search results are not limited to 1–3000), so name search and the confirmed species are unaffected.

### Pl@ntNet
- Key works. `/v2/languages` lists 52 languages and **no Korean (`ko`)**. Common names and disease descriptions come back in English (or another listed language). Korean display names go through Google Translation as planned; disease descriptions need a decision (see below).

### Trefle
- First run: token rejected (`401 Invalid access token`). After the owner replaced it (2026-11-13): search works.
- **Korean names exist.** `GET /api/v1/plants/{id}` → `main_species.common_names.ko` returned `["몬스테라"]` for *Monstera deliciosa* (29 languages listed). Coverage for other species is not yet measured.

### Google Cloud Translation
- First run: `403 API_KEY_HTTP_REFERRER_BLOCKED`, because the key had a website (referrer) restriction and server calls send no referrer. The owner changed the application restriction to None, keeping the API restriction to Cloud Translation only (2026-11-13). Now works.
- Quality note: "Swiss cheese plant" (Perenual's common name for *Monstera deliciosa*) translated to "스위스 치즈 식물", while Trefle gives "몬스테라". Literal translation of English common names can give names Korean users do not use.

### Decisions and open items
1. Trefle and Google keys: fixed by the owner and re-checked (2026-11-13).
2. **Health result language (owner decision, 2026-11-13):** Pl@ntNet disease descriptions are translated to Korean with Google Translation and shown **without** a "machine translation" label. The English original and EPPO code are stored next to the translation (provenance), and translations are cached so the same description is translated once.
3. Owner awareness: half of the common houseplants checked (including Monstera) get no Perenual care data on the free plan.
4. **Proposal (needs approval):** Korean display name order = Trefle `common_names.ko` first, Google Translation of the English common name only when Trefle has none. ADR-0003 named Google Translation as the source; this adds Trefle in front of it.
