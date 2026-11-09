# ADR-0002: GitHub Pages static web app and UI-first implementation

Status: **Proposed — user approval required**
Date: 2026-11-09
Supersedes (if accepted): ADR-0001's proposed Next.js/Vercel deployment details, not the product's mobile-first intent.

## User-requested change

The product is a **personal-use website**, not an app-store release. The owner wants to publish the frontend with GitHub Pages. **The project is still in the design phase: no application implementation may begin before the UI screens and user flow are designed, reviewed, and approved by the owner.**

## Proposed decision

- UI/design first, then implementation: `docs/09-ui-design-plan.md` defines the design approval gate.
- Static frontend: React + TypeScript + Vite; responsive mobile-first layouts. Optional PWA install is a later decision, not a requirement for the initial website.
- Hosting: GitHub Pages for the frontend. Proposed URL after deployment: `https://skiiilee.github.io/die-no-more/`.
- Backend: Supabase Auth + PostgreSQL (RLS) + private Storage; Supabase Edge Functions for authenticated Gemini/Pl@ntNet provider access and server-side secrets.
- Species-care database initially empty. On first confirmed registration of a new species, retrieve existing data or propose a Gemini-generated **unverified** care draft in `species_care.verification_status = 'unverified'`, preserving provenance; reuse on later registrations. `plant_species` keeps confirmed identity separate from AI care drafts.
- Pl@ntNet is an identification candidate; Gemini is a draft-care/optional photo symptom analysis candidate. Final API selection depends on current free-tier terms, data handling and hands-on accuracy testing.
- Keep every previous unapproved proposal marked as a proposal; do not imply user approval for any implementation-specific technology solely from this document.

## Why

GitHub Pages cannot execute Next.js request handlers. Vite creates static build assets that can be served under a repository subpath. Supabase provides the separately hosted backend necessary for secure credentials, user data and photo storage.

## Tradeoffs

- Public site assets do not imply public user records. GitHub Pages is publicly reachable; Auth, RLS, private buckets, signed URLs and backend verification are mandatory for private information.
- This is not a fully serverless-without-backend app: Supabase Edge Functions are a separately deployed runtime with quotas/limits. GitHub Pages cannot safely store Gemini or Pl@ntNet API keys.
- Static SPA navigation must account for the `/die-no-more/` base path. If using hash routing, select **Supabase Auth PKCE** (`?code=...` callback) rather than implicit token-in-fragment flow (`#access_token=...`), which conflicts with hash routing. Exchange the code on the same browser, clear the query, and test refresh/callbacks with GitHub Pages URLs before implementation sign-off.
- API-generated care data is not automatically scientifically validated. Store `species_care.verification_status` (`unverified`/`reviewed`/`verified`) and provenance; permit user corrections without mixing AI drafts with canonical species identity.
- Offline writes, push notifications, native distribution and complex async workers are not prerequisites for UI-first design.
- **Gemini image privacy gate:** before enabling the free tier, verify the current unpaid-service data-use terms (including product improvement/human review), image retention, and whether photos could reveal private home details. Do not send private photos by default; require an informed choice and a privacy-safe fallback or disable photo analysis.
- **Edge Function limits:** before enabling image analysis, verify plan-specific wall-clock, request idle/timeout and CPU limits; choose bounded calls and defined timeout/retry/fallback, or a real job executor if required.
- **Supabase Free pausing:** infrequent database activity may pause a free project (currently a 7-day low-activity window). Include dashboard restoration, interruption messaging and user-data export/backup guidance in the later operations plan.
- Hosting/runtime/provider costs and terms must be verified before actual deployment.

## Implementation gate

**Do not scaffold, build, connect live APIs, write migrations or deploy the application until the owner approves the UI design**: sitemap, screen wireframes, key interaction states, Korean UI copy, mobile/desktop layouts and navigable prototype. See `docs/09-ui-design-plan.md`.

After UI approval: technical architecture review -> thin vertical slice and security tests -> owner review -> deployment.

## Status / review checklist

- [x] User requested personal-use web hosting on GitHub Pages.
- [x] User requested UI screens first, implementation later.
- [ ] Owner approves the UI mockups and user flows.
- [ ] Owner approves this architecture and tradeoffs.
- [x] Claude reviewed the proposed direction and identified the PKCE, data-use, timeout, pausing and draft-status risks (PR #3 comment; implementation untested).
- [ ] PKCE redirect tested in a browser after UI approval.
- [ ] Edge Function runtime limits and recovery path checked against the chosen plan before integration.
- [ ] Provider terms, privacy and quotas checked with source/date before enablement.

## Official references

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Vite static deploy: https://vite.dev/guide/static-deploy
- Supabase Edge Function authentication: https://supabase.com/docs/guides/functions/auth
- Supabase secrets: https://supabase.com/docs/guides/functions/secrets
