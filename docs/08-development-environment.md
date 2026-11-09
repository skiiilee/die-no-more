# Development environment and hosting plan — proposal

Status: **Design stage only**. This document is a future implementation plan, not evidence of code, configured services or an active deployment.

## Priorities and sequence

1. **UI/UX design and owner review first** (`docs/09-ui-design-plan.md`).
2. Confirm architecture and provider/API constraints.
3. Only after UI approval, let Claude implement the frontend, Supabase schemas/functions and CI in separate PRs with tests.
4. Only after owner approval, merge and enable GitHub Pages deployment.

Do not create an app scaffold, GitHub Actions deployment workflow, Supabase tables/migrations or external API keys as part of this documentation PR.

## Planned environment

| Area | Proposed tool | Notes |
|---|---|---|
| Source | GitHub `skiiilee/die-no-more` | `main` approved baseline; PR review required |
| UI design | Screen definitions, wireframes, visual mockups/prototype | Validate first; tool (Figma or equivalent) not yet chosen |
| Frontend | React + Vite + TypeScript | Static build, mobile-first, Korean language |
| Styling | Tailwind CSS | Design tokens defined by approved UI |
| Client routing | Hash router initially (proposal) | Reliable navigation under GitHub Pages project subpath |
| Hosting | GitHub Pages | Public site assets; proposed path `/die-no-more/` |
| CI/CD | GitHub Actions | Planned after design approval, not configured in this PR |
| Auth | Supabase Auth | Sign-in for owner; restrict access to owner account if required |
| DB | Supabase PostgreSQL + RLS | User plants, species data, observations and care logs |
| Image storage | Supabase private Storage | Photos never committed to GitHub |
| Secret backend | Supabase Edge Functions | Authenticated proxy, quotas, validation and third-party API keys |
| Plant identification | Pl@ntNet candidate | Manual search fallback |
| AI care data / photo assessment | Gemini candidate | Quotas, privacy and accuracy require testing |
| Tests | Vitest/React Testing Library + Playwright | Tests written during implementation |
| Monitoring | Simple errors and usage counters initially | Sentry only if justified; avoid unneeded cost |

## Browser-to-backend boundaries (design)

- GitHub Pages delivers JavaScript/CSS publicly. Vite `VITE_*` values are bundled into client assets. The Supabase public project URL and publishable key may be exposed **only with RLS**; credentials for Gemini/Pl@ntNet and Supabase secret/service-role keys must be exclusively in Edge Function secrets.
- Browser can access authorized Supabase rows and private media using a scoped signed URL, subject to RLS/Storage rules.
- All paid or rate-limited provider calls are server-side. Edge Functions verify an actual logged-in user and allowed owner identity, validate inputs, enforce server-side rate/budget limits, and record API usage. CORS alone is not authentication.
- Use a single owner account if desired; even with one user, a public GitHub Pages URL must never expose plant photos, personal notes, provider keys or arbitrary data.
- Client-side image resizing is for performance, not sufficient security validation. Strip EXIF before permanent storage; verify MIME/content and size at a trusted boundary. On failure, manual plant registration remains possible.

## Static website constraints

- Vite production base: `/die-no-more/` for the project site. The final URL remains **unconfirmed until deployed**.
- Direct URLs such as `/die-no-more/plants/123` are not server-routed on default Pages hosting. Hash paths `/die-no-more/#/plants/123` avoid custom 404 handling; test browser refresh and back/forward behavior.
- Use **Supabase Auth PKCE**, not an implicit `#access_token` callback, when using hash routing. Configure redirect allowlists for `/die-no-more/`; exchange the returned `?code=` for a session in the initiating browser and then remove the query. Browser-test login/email-link callbacks, refresh and back navigation before enabling sign-in.
- GitHub Pages is publicly reachable. It does not provide a private authenticated site by itself.
- Free Supabase projects may be paused after low database activity (currently roughly a 7-day window). The later operations checklist must include project status checks, manual resume through the dashboard, downtime messaging and independent user-data export/backup guidance. Never assume GitHub Pages availability implies Supabase availability.
- GitHub Actions deployment must be created only after UI design approval. Manual release and rollback plan should be documented then.
- PWA home-screen install, offline read cache, and push are separate future enhancements; a website alone does not promise native notifications.

## Design-time quality gates

- UX: mobile widths (~360–390 px), desktop layout, keyboard and screen-reader basics, error/loading/empty/offline/quota-exceeded states.
- Data: unknown species registration, duplicate species reuse, user correction of AI-generated unverified care guidance.
- Provider: verify current official personal/noncommercial terms, free allowances, treatment of uploaded photos, retention/caching rights and cost safeguards. **Gemini unpaid-service inputs/outputs may be used for product improvement or reviewed by humans under its terms: private household photos must not be sent by default**. Document the terms with verification date, an informed opt-in decision and a privacy-safe fallback before enabling photo analysis. Do not hard-code free-tier numbers until verified.
- Security: user-only authorization in Edge Functions, tested RLS and private Storage access, no sensitive values in browser bundles or repository.
- Reliability: verify Edge runtime/timeouts for the selected plan (Supabase currently documents Free **150s wall-clock** and **150s request idle timeout**, plus **2s active CPU per request**); the wall-clock limit of a worker does not guarantee that a single AI request can run for that entire duration. Set lower application timeouts, quota fallback, retries/idempotency; if the work cannot fit, use a real worker/queue rather than a job table alone.

## Deferred until after UI sign-off

`package.json`, application sources, CI workflow, Supabase migrations, Edge Function implementation, external provider accounts/keys, enabled GitHub Pages deployment and production monitoring.

Official references: https://vite.dev/guide/static-deploy ; https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site ; https://supabase.com/docs/guides/functions/auth .
