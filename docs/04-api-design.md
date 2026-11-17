# API integration design (draft)

Candidate providers (documentation checked 2026-11-12, see "Provider check" below; no contracts):
- Pl@ntNet: photo identification candidates (`/v2/identify`) and health candidates (`/v2/diseases/identify`).
- Trefle: name search candidates.
- Perenual: species care reference and English common names, subject to its terms for personal, non-commercial use, caching limits and coverage.
- Azure Translator (F0, free): Korean text when no provider gives Korean, saved and reused ([ADR-0004](decisions/ADR-0004-translation-and-quota.md)). Connected last; until then the app uses the ADR-0004 D3 fallbacks.
- Google Cloud Translation: not adopted (requires a visible Google attribution badge; ADR-0004 D1). Checked on 2026-11-12/13; records below are kept as history.
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

- **Quota:** 500 identifications per day, reset at midnight UTC (09:00 KST). Over quota → HTTP 429 with `Retry-After` (next 00:00 UTC); every response carries a `RateLimit` header (`r` remaining, `t` seconds to reset); `GET /v2/quota/daily` returns `count`/`total`/`remaining` per request type ([quota](https://my.plantnet.org/doc/api/quota)). The free plan is never billed. Species and disease identification share this quota (1 credit per request).
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

### Google Cloud Translation — not adopted (history)
Sources: [pricing](https://cloud.google.com/products/translate/pricing), [attribution](https://docs.cloud.google.com/translate/attribution).

- **Not adopted (ADR-0004 D1):** results shown to users must carry a Google attribution badge, which conflicts with the owner's decision to show translations without a provider label. The notes below are kept as the check history.

- **Quota:** first 500,000 characters per month free (Basic and Advanced combined, does not roll over), then **$20 per million characters**. Whitespace counts.
- **Billing risk (D8):** the API needs a billing account, and Google bills automatically above the free amount. D8 forbids automatic paid use, so the owner sets a per-day character quota on the API in the Cloud console (**10,000 characters/day**, owner decision 2026-11-13; ≤ 310,000/month, inside the free amount) in addition to our `api_usage_logs` limit. A species name is about 20–40 characters, so normal use is far below the free amount.

### Limits to set in server env (D8, ADR-0004 D5)
Provider protection counts on the provider's own day boundary and follows the provider's remaining-count and 429 answers. A KST day count is only our own cap where the provider documents no boundary.

| Provider | Provider limit | Our cap | Counted on |
|---|---|---|---|
| Pl@ntNet | 500/day | 450/day; stop when `RateLimit` `r` reaches 0, or on 429 until `Retry-After` | **UTC day** (resets 09:00 KST) |
| Perenual | 100/day (boundary not documented) | 90/day; stop on 429, except the "Please Upgrade Plan" body (outside free range, not a limit) | KST day |
| Trefle | 60/min | 300/day; back off on 429 with `Retry-After` | KST day |
| Azure Translator F0 | 2,000,000 chars/month, stops when used up | 200 calls/day | KST day (F0 stops itself at the monthly amount) |

### Decisions (owner approved, 2026-11-12)
1. **Perenual free coverage (IDs 1–3000).** Approved. Species outside the range get no Perenual care data, so per D16 their water reminder is not offered and S13 '직접 입력하기' is shown. No paid plan is assumed.
2. **Storing Perenual data.** Approved. Care values are cached in `species_care` for personal, private use to stay within 100/day. They are never exposed publicly, and data is fetched per species when needed, never bulk-downloaded.
3. **Google billing cap.** Approved. The owner set the console quota to 10,000 characters per day (2026-11-13). Superseded: Google is not adopted (ADR-0004).

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
- Key works. `/v2/languages` lists 52 languages and **no Korean (`ko`)**. Common names and disease descriptions come back in English (or another listed language). Korean text follows ADR-0004 D2 (provider Korean first, then Azure).

### Trefle
- First run: token rejected (`401 Invalid access token`). After the owner replaced it (2026-11-13): search works.
- **Korean names exist.** `GET /api/v1/plants/{id}` → `main_species.common_names.ko` returned `["몬스테라"]` for *Monstera deliciosa* (29 languages listed). Coverage for other species is not yet measured.

### Google Cloud Translation (history; not adopted)
- First run: `403 API_KEY_HTTP_REFERRER_BLOCKED`, because the key had a website (referrer) restriction and server calls send no referrer. The owner changed the application restriction to None, keeping the API restriction to Cloud Translation only (2026-11-13). Now works.
- Quality note: "Swiss cheese plant" (Perenual's common name for *Monstera deliciosa*) translated to "스위스 치즈 식물", while Trefle gives "몬스테라". Literal translation of English common names can give names Korean users do not use.

### Decisions and open items
1. Trefle and Google keys: fixed by the owner and re-checked (2026-11-13).
2. **Health result language (owner decision, 2026-11-13):** Pl@ntNet disease descriptions are translated to Korean and shown **without** a "machine translation" label. The provider changed from Google to Azure Translator F0 for this reason (ADR-0004 D1). The English original, EPPO code, translation and translation provider are stored separately, and the same text is translated once. If translation is unavailable or fails, the English original is shown with the EPPO code (ADR-0004 D3).
3. Owner awareness: half of the common houseplants checked (including Monstera) get no Perenual care data on the free plan.
4. **Korean text source (owner decision, 2026-11-13):** when provider data already has Korean (for example Trefle `common_names.ko`), use it; translate only when no provider gives Korean. This applies to display names and any other provider text (ADR-0004 D2).
5. **Azure live check:** pending. The owner has not created the Azure account yet; translation is connected last (ADR-0004 D4).

## Name search implementation (2026-11-15)

Implemented in `src/service/adapters/` (Perenual, Trefle, translator stub) and `src/service/species-search.ts` / `species-preview.ts`. S04-A and S04-B are server-rendered pages (`/plants/new/search?q=`, `/plants/new/species/{id}`) instead of the `/api/species/*` endpoints proposed above, because no client other than these screens needs them.

- **Search order (04-data-sources):** plant DB (`search_species`, pg_trgm partial match) → Perenual `species-list` and Trefle `plants/search` in parallel with the query as typed → Korean query with no result: English retry through the translator, which answers "unavailable" until Azure is connected (ADR-0004 D3/D4) → manual entry.
- **Plant DB:** every provider result is stored by scientific-name key (D10). Each species is asked for its Korean name (Trefle) and care data (Perenual) once, when S04-B first opens; the answer, including "none", is kept on the row (`korean_name_checked_at`, `care_status`). Provider failures, refused calls and **200 answers whose body is not the expected shape** (not JSON, no `data` list, no species `id`) leave the row unchecked so the next visit tries again. Only a well-formed answer without the value is stored as "none".
- **Storing results:** a result whose provider ID is already stored under another scientific name (unique violation) is left out and the list says so; any other write failure, or storing nothing at all, goes to the retry screen instead of an empty list.
- **Perenual free range:** IDs above 3000 are marked `outside_free_range` without a details call. A 429 "Please Upgrade Plan" body is read the same way and never retried.
- **Daily caps (reservation, PR #15 review):** every HTTP attempt, retries included, first calls `reserve_provider_call()`, which counts today's rows under a per-user, per-provider advisory lock and inserts a `reserved` row only while the KST-day count is below `PERENUAL_DAILY_LIMIT` / `TREFLE_DAILY_LIMIT`. Racing requests cannot share the last call, and if the reservation cannot be written nothing is sent. After the attempt the row becomes `success`, `failure` or `quota_exceeded`; a row left `reserved` still counts. A Perenual quota answer (`quota_exceeded`) stops Perenual for the rest of the day.
- **Trefle 429:** recorded as `failure` with `retry_at` from `Retry-After` (seconds or HTTP date; one minute when missing). Until then only Trefle is skipped; Perenual and manual entry keep working.
- **Time budget (D7):** one 25 s deadline per request, 10 s per attempt (less when the deadline is near), one retry on timeout/network/5xx only with ≥ 12 s left.

### Live check (2026-11-15)
One run of the adapters with the owner's keys (5 calls). Keys were never printed or committed.
- Perenual `species-list?q=ficus`: 19 results parsed. **Photo URLs are pre-signed S3 links that expire after 24 hours** (`X-Amz-Expires=86400`). They are shown on the results page that fetched them but never stored (owner decision 2026-11-15: no refresh calls, no copies, since Perenual's terms forbid duplicating its content); only non-expiring links (Trefle's `bs.plantnet.org` images) are kept in `plant_species.image_url`. A species found only through Perenual therefore shows '사진 없음' on S04-B and in later plant DB results.
- Perenual details 2961 (*Ficus elastica*): `watering: Average`, benchmark parsed as 7–10 days, sunlight `full sun`, `part sun/part shade`, `care_level: Medium`, `description` an English paragraph (stored as care field `description`, shown in English until translation is connected; owner decision 2026-11-15, ADR-0004 D2). The photo licence on this species was CC BY-SA 2.0.
- **Display rule (owner decision 2026-11-15):** care codes in our label table are shown in Korean; any other Perenual value is shown as given, in English.
- Perenual details 5257 (*Monstera deliciosa*): not requested (outside the free range), as designed.
- Trefle `plants/search?q=monstera`: 20 results; `Monstera deliciosa` → Korean name "몬스테라".

## Photo identification implementation (2026-11-17)

S03 [식물 스캔] → photo source dialog → S03-P (`/plants/new/photos`) → S04-A for the session (`/plants/new/identify/{id}`) → S04-B → S05. Route handlers: `POST /api/uploads`, `DELETE /api/uploads/{id}`, `POST /api/identifications` (ADR-0003 D7). The proposed `GET /api/identifications/:id` is a server-rendered page instead, like name search.

- **Upload (D4):** the browser checks type (JPEG, PNG, WebP; HEIC only if it can decode it) and size (≤ 15 MB), applies the EXIF orientation, shrinks the long side to 1600 px and re-encodes JPEG 0.85. The server checks size (≤ 3 MB) and file signature, then re-encodes with `sharp` from the pixels only, so EXIF (including GPS), XMP and other metadata are dropped; the server result is what is stored, in `plant-photos/<user_id>/` with a `plant_photos` row (`photo_type = 'identification'`, unattached).
- **Consent (D5):** the S03-P checkbox is sent with each request (`consent: true`); without it the server reads no photo and calls nothing. The box is cleared after every request.
- **Request:** `POST https://my-api.plantnet.org/v2/identify/all?include-related-images=true&nb-results=5&lang=en&api-key=…`, one `images` file and one `organs=auto` per photo. A session row is written as `processing` before the call and becomes `completed` (normalized candidates: rank, score, species id, scientific name, reference photo and credit, provider, fetch time; plus endpoint and engine `version`) or `failed` (`quota`, `rejected`, `unavailable`, `save_failed`). The raw answer is not stored (D6).
- **Answers:** 200 → candidates (a 200 that is not a result list is a failure); 404 "Species not found" → completed with no candidates (S04-A offers search and manual entry); 429 → quota; 400/413/415 → photos rejected; anything else → unavailable.
- **Daily cap (ADR-0004 D5):** reserved per attempt like the other providers, counted per **UTC day** (`PLANTNET_DAILY_LIMIT`, default 450). A 429 is recorded as `quota_exceeded` with `retry_at` from `Retry-After` (next 00:00 UTC when missing); a success whose `RateLimit` header says `r=0` sets `retry_at` to its reset time. S03-P then says "오전 9시 이후 다시 시도".
- **Plant DB:** every candidate is stored by scientific-name key (D10) with `source = 'plantnet'`, so S04-B works the same as for name search (Korean name from Trefle, care data from Perenual, asked once).
- **Scores:** kept in the session, not shown. S04-A shows the rank ("후보 1") and says the list is ordered by similarity and is not a confirmed result (03 §3-4).
- **Photo credit:** Pl@ntNet reference photos are CC BY-SA. The citation ("Author / Pl@ntNet, cc-by-sa") is stored with the photo (`plant_species.image_credit`, never without `image_url`) and shown under it on S04-A and S04-B.
- **Unattached photos (D6):** removed after 24 hours. Until the daily cleanup job exists, each upload first removes the user's own unattached photos older than 24 hours (at most 50 per upload).
- **Requests from other sites:** the route handlers refuse a request whose `Origin` is another site, and answer 401 JSON (not a login redirect) without a session.

### Live check (2026-11-17)
Two calls with one public photo of *Monstera deliciosa* (Wikimedia Commons, CC BY-SA 4.0). The key was never printed or committed.
- Raw call: 200 in about 5 s. `bestMatch` "Monstera deliciosa Liebm.", first result score 0.88, then *Philodendron bipinnatifidum*, *P. mayoi*, *Monstera adansonii*. Each result has `species.scientificNameWithoutAuthor`, `family`, `commonNames` (English), `gbif.id`, `powo.id` and up to 6 reference images with `url.o/m/s` on `bs.plantnet.org` and a `citation` with a CC BY-SA licence. `version` "2026-03-20 (7.5)".
- Headers: `RateLimit: "dailyQuota";r=499;t=63873` and `RateLimit-Policy: "dailyQuota";q=500;w=86400`. `t` counted down to the next 00:00 UTC, as documented.
- Through our adapter (photo cleaned by `sharp`, 237 KB): same top result (score 0.90), five candidates parsed with credits.
