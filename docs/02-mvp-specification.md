# MVP functional specification (draft)

Status: Proposed, not approved. See `01-requirements.md` for feature IDs. **UI-first requirement:** no implementation starts before user approval of the screen designs/prototype in `docs/09-ui-design-plan.md`.

## Identification
Input: 1–5 plant photos; camera or gallery. Validate file content/type and size. Output: ranked candidate species with scientific names and provider score labels. User must confirm a candidate, search manually, or save an unknown plant. Store original candidates and final user choice separately.

## Health assessment
Input: photo(s), plant species if confirmed, optional user observations. Output: observed symptoms, possible causes, follow-up questions, caution and recommended checks. Do not claim definitive disease identification from images. Persist model/provider/version and analysis date. Failed analysis must not block plant registration.

## On-demand care reference
The reference DB starts with no species. When the user confirms a new species, reuse cached reference data if present. Otherwise, optionally request Gemini-generated information (with provenance, version and **unverified** status), let the user correct it, and keep registration functional if no provider data is available. Individual pots of the same species retain separate personal care history.

## Personal plant management
Each physical plant has an independent ID, nickname, location, indoor/outdoor environment, status and chronological photo history. Allow duplicate species across different plants, editing and archiving.

## Care logging and recommendations
Log watering, fertilizing, repotting, pruning and free-form observations with actual event timestamps. Combine source-backed species reference, observations and history through deterministic rules; use an LLM only for grounded, comprehensible explanations. For watering, prefer soil-check tasks rather than fixed automatic watering directives.

## Tasks and notifications
Support pending, due, completed, snoozed, skipped and cancelled. Completion writes an associated care log only when actual action was performed, atomically without duplicates. In-app notifications are P0; push is P1.

## Failure and security requirements
Handle non-plant photos, ambiguous results, API timeouts, quotas, offline interruptions and absent species reference data. All user data requires ownership checks/RLS; photos private; API secrets server-only.

## Definition of done
Functional tests cover success, failure, ambiguity and unauthorized access. Mobile registration and care flows pass E2E. Provider terms for personal, non-commercial use, caching limits and photo transmission/retention conditions verified before any provider is enabled.
