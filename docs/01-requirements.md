# MVP requirements (draft)

| ID | Requirement | Priority |
|---|---|---|
| F01 | Sign up, sign in, sign out | P0 |
| F02 | Camera and photo upload with validation | P0 |
| F03 | Species identification, top candidate list | P0 |
| F04 | Candidate confirmation, manual search, unknown registration | P0 |
| F05 | Health assessment with symptoms, hypotheses, uncertainty | P0 |
| F06 | Register plant with nickname, species, indoor/outdoor, location | P0 |
| F07 | List, view, edit, archive personal plants | P0 |
| F08 | Watering, fertilizer, repotting, pruning logs | P0 |
| F09 | Environment and soil observations | P0 |
| F10 | Personalized recommendations using care reference, observations and history | P0 |
| F11 | Care tasks with complete/snooze/skip | P0 |
| F12 | Photo and observation timeline | P0 |
| F13 | In-app upcoming task notifications | P0 |
| F14 | Web push with device compatibility checks | P1 |
| F15 | Seasonal and location-sensitive care | P1 |
| F16 | Growth and activity reports | P1 |
| F17 | Shared care | P2 |
| F18 | IoT sensor integration | P2 |

## Project stage and hosting constraints
- This is a personal-use website planned for GitHub Pages; no app-store distribution is required.
- The project is **UI design first**. Screen mockups/flows must receive explicit user approval before code implementation.
- The canonical species-care knowledge base starts empty and grows as plant species are confirmed during real use; provider failures do not block manual entry.
- Health assessment F05 remains a proposed P0 requirement; model choice and release gate are unresolved and must not be silently approved by this PR.

## Nonfunctional requirements
- Access control: authenticated ownership, RLS, private media.
- Reliability: API timeouts, retries, idempotency, graceful fallback.
- Accessibility: mobile-first, keyboard and screen reader support.
- Data lifecycle: account deletion, media deletion, retention policy.
- Cost: per-provider usage logging, quotas, caching under licensing constraints.
- Privacy: strip EXIF location metadata by default.

## Acceptance scenarios
1. User can identify, confirm and save a plant.
2. Failed identification allows manual registration.
3. Health analysis communicates uncertainty and asks for observations.
4. A completed task creates an accurate care log without duplicates.
5. Users cannot access other users' plant data.
6. Failed provider calls do not lose uploaded data.
