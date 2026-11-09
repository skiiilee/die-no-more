# Screens and user flows (UI-first proposal)

**Design phase only.** The owner wants the UI screens reviewed **before** any app code or deployment setup. The screen inventory below is a starting point, not final visual design. See `docs/09-ui-design-plan.md` for required sitemap, wireframes, visual mockups, prototype, states and approval gate.

Mobile-first responsive web layout, Korean UI. PWA install can be considered later; the initial deployment target is GitHub Pages.

| ID | Screen | Core contents |
|---|---|---|
| S01 | Authentication | Sign in/up |
| S02 | Home | Plant count, tasks, alerts |
| S03 | Capture | Camera, gallery, photo guidance |
| S04 | Identification results | Top candidates, confidence labels, manual selection |
| S05 | Plant registration | Nickname, species, indoor/outdoor, environment |
| S06 | Plant detail | Photo, condition, recommendations, history |
| S07 | Health assessment | Symptoms, hypotheses, follow-up questions |
| S08 | Care logging | Water, fertilizer, repotting, pruning |
| S09 | Care schedule | Due, complete, snooze, skip |
| S10 | Photo timeline | Dated photo and observation history |
| S11 | Plant list | Search, filters, sort |
| S12 | Settings | Account, notifications, data management |

New user: sign in → capture → identify → confirm → optional health analysis → register → recommendations.
Returning user: home → plant detail → log or reassess → updated recommendations → tasks.

Do not require a health diagnosis to register a plant. Display data source and uncertainty. Provide loading, empty, error and offline states. Add provider quota-exhausted, AI-generated care draft (unverified), user correction and repeated species cache-reuse states. Site should explain private login even though its GitHub Pages frontend is publicly reachable.

## Approval criteria before coding
- Review mobile and desktop screen mockups and core clickable flows (new species, existing species, care logs, reminders, errors).
- Resolve interaction and visual feedback; explicitly record user approval of UI.
- Only after approval may Claude write React components, styles, database migrations or Edge Function code.
