# UI-first design plan — before any application code

Status: **Proposed workflow, design stage**. The owner explicitly requested to see/approve the UI before implementation.

## Scope

Design a Korean-first, mobile-first plant care website with a useful desktop layout. The design is a set of mockups and interaction specifications, not deployed screens, code or live provider integration.

## UI deliverables (must be reviewed first)

1. **Information architecture**: sitemap, navigation model, list/detail relationships and mobile navigation.
2. **Low-fidelity wireframes**: screen layout and main user actions, without binding to any framework.
3. **Visual mockups**: typography, color, spacing, icons, accessibility and responsive states.
4. **Clickable prototype or equivalent linked flow**: initial onboarding -> new plant -> identification result -> candidate confirmation/manual entry -> plant details -> care log -> tasks -> observation/health check.
5. **States and microcopy**: blank collection, loading, permissions, unsupported/non-plant photo, unknown species, quota exhausted, network offline, provider failure, unverified AI guidance and user edits.
6. **Review record**: owner feedback, changes made, open questions, explicit approval to start implementation. Unapproved designs must not be treated as final.

## Screen inventory

| ID | Screen | Questions to settle in design |
|---|---|---|
| S01 | Sign-in / first use | One-owner access, first login and recovery |
| S02 | Dashboard / today | Task list, plant count, urgency without alarmist language |
| S03 | Photo capture / upload | Camera permission, gallery, file guidance, error state |
| S04 | Species candidate selection | Top candidates, uncertainty, confirmed vs unknown |
| S05 | Plant registration | Nickname, room/outdoor placement, species, photo |
| S06 | Plant list / filters | Simple cards, location filtering, empty collection |
| S07 | Plant detail | Latest photo, care info, task and observation timeline |
| S08 | Care action recording | Soil check vs actual watering, fertilizing, pruning |
| S09 | Care schedule | Complete, postpone, skip and follow-up reason |
| S10 | Observations / photo timeline | Leaf symptoms, soil observations, image history |
| S11 | Optional health review | Visual symptoms, non-definitive possibilities, extra questions |
| S12 | Settings | Profile, data deletion, provider usage/budget warning |

Existing S01–S12 in `docs/06-ui-ux.md` remain a baseline; exact naming and layout can change only after design review.

## Main design flows

- **A — new species**: Start -> photo -> Pl@ntNet suggestion (or manual name) -> **user confirms scientific name** -> register personal plant -> check existing species-care cache -> if missing, generate optional Gemini draft -> label as *AI generated / not yet verified* -> review/edit -> start care log. Plant registration succeeds even without API output.
- **B — existing species**: register another pot of same species -> reuse canonical species-care info, but keep its personal photos, care tasks and logs separate.
- **C — ongoing care**: dashboard -> soil-check task -> record dry/wet soil -> optional actual watering action -> atomic care log only if watering really occurred.
- **D — failure/limit**: quota exhausted, provider down or no network -> manual species/plant registration and locally displayed guidance about unavailable online features; no automatic payment/upgrade.
- **E — privacy**: first sign-in/owner account; permission messages for photo camera and any third-party AI photo transfer. Clearly separate private user photos from public assets.

## Initial visual direction (to refine with owner)

Simple calm plant-care utility, uncluttered Korean labels, strong legibility, mobile-first touch targets and a restrained green accent. Do **not** lock visual style until the owner sees variants and approves a direction.

## Approval gate before implementation

- [ ] User has seen sitemap and a coherent mobile navigation model.
- [ ] User has reviewed wireframes for the core flows.
- [ ] User has reviewed final visual mockups at mobile and desktop sizes.
- [ ] Error, empty, unverified AI data and quota-limit states are represented.
- [ ] Login/private-data boundaries and the need for separate Supabase backend are understood.
- [ ] Open UI feedback is resolved, or documented as deferred.
- [ ] **Owner explicitly approves UI design and authorizes Claude to start implementation.**

Only then create application scaffold, write CSS/components, configure Supabase, register provider credentials, or activate GitHub Pages deployment.

## Suggested next design PR

A separate `gpt/docs-ui-wireframes` or `claude/docs-ui-prototype` PR should contain actual screen references, prototype URLs or mockup assets and the user feedback history. This PR only sets the design process and implementation gate.
