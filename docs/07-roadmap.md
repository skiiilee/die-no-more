# Roadmap and release gates (draft)

Indicative plan for a personal-use GitHub Pages website, **not a delivery commitment**. The owner requested **UI design and approval before implementation**; the old week numbers below are legacy estimates and are superseded by the stage gates here.

| Stage | Start condition | Deliverables |
|---|---|---|
| **UI planning and design** | Now | Sitemap, user flows, low-fi wireframes, Korean screen copy, mobile/desktop mockups and failure/empty states |
| **UI owner approval** | After reviewing mockups | Feedback incorporated, core interactions reviewed, explicit sign-off to start implementation |
| Architecture/provider validation | After UI approval | Approve ADR-0002, GitHub Pages constraints, auth redirects, API terms/privacy/cost and DB data flow |
| Foundation implementation | After approved design + architecture | Vite project, Supabase Auth/RLS/storage, protected Edge Functions, tests and CI in separate feature PR |
| Identification and plant registration | Foundation ready | Photo/manual entry, Pl@ntNet candidate selection, personal plants, empty initial species DB, optional Gemini draft |
| Ongoing care and optional health | After core flows work | Observations, tasks/logs, deterministic care rules, optional Gemini photo symptoms behind verification/feature flag |
| Test/release | After reviewed feature work | Mobile E2E, security/quotas, manual fallback, GitHub Pages deploy and owner acceptance |

## Suggested acceptance targets for personal use (proposal, not industry benchmarks)
The project is for personal use. Targets below are the owner's own checks, not market metrics.
- Plant registration completion ≥80% on the owner's own test plants.
- Identification top-3 inclusion ≥90% on a representative set of the owner's photos (indoor and outdoor).
- Manual registration after failed identification ≥90%.
- Health API technical success ≥95% (separate from clinical/agronomic quality).
- Typical registration within 2 minutes.
- Care log persistence success ≥99%.
- Owner records care at least once a week for 4 consecutive weeks (replaces the 7-day return rate).

## Development freeze until UI review
**Do not implement application code, migrations, provider integrations, GitHub Actions deployment or activate GitHub Pages before explicit owner approval of the UI.** The current PR changes documentation only.

## Release gate
Manual fallback works; user ownership enforced; no secrets exposed; API failure is recoverable; recommendations avoid definitive unsupported diagnosis; mobile flow and accessibility tested.

## Immediate priorities
1. Prepare and review the sitemap and key mobile screen wireframes.
2. Produce the visual UI mockups/prototype and receive owner approval.
3. Review ADR-0002 and validate the providers' personal noncommercial terms, real-photo accuracy, privacy and free-tier constraints.
4. Only then approve schema/API contracts and begin implementation in separate reviewed PRs.
