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
- Species-care database initially empty. On first confirmed registration of a new species, retrieve existing data or propose a Gemini-generated **unverified** care draft, preserving provenance; reuse on later registrations.
- Pl@ntNet is an identification candidate; Gemini is a draft-care/optional photo symptom analysis candidate. Final API selection depends on current free-tier terms, data handling and hands-on accuracy testing.
- Keep every previous unapproved proposal marked as a proposal; do not imply user approval for any implementation-specific technology solely from this document.

## Why

GitHub Pages cannot execute Next.js request handlers. Vite creates static build assets that can be served under a repository subpath. Supabase provides the separately hosted backend necessary for secure credentials, user data and photo storage.

## Tradeoffs

- Public site assets do not imply public user records. GitHub Pages is publicly reachable; Auth, RLS, private buckets, signed URLs and backend verification are mandatory for private information.
- This is not a fully serverless-without-backend app: Supabase Edge Functions are a separately deployed runtime with quotas/limits. GitHub Pages cannot safely store Gemini or Pl@ntNet API keys.
- Static SPA navigation must account for the `/die-no-more/` base path; initial hash routing is an acceptable simplification. Auth redirect/return flows need browser testing.
- API-generated care data is not automatically scientifically validated. Store review status and permit user corrections.
- Offline writes, push notifications, native distribution and complex async workers are not prerequisites for UI-first design.
- Hosting/runtime/provider costs and terms must be verified before actual deployment.

## Implementation gate

**Do not scaffold, build, connect live APIs, write migrations or deploy the application until the owner approves the UI design**: sitemap, screen wireframes, key interaction states, Korean UI copy, mobile/desktop layouts and navigable prototype. See `docs/09-ui-design-plan.md`.

After UI approval: technical architecture review -> thin vertical slice and security tests -> owner review -> deployment.

## Status / review checklist

- [x] User requested personal-use web hosting on GitHub Pages.
- [x] User requested UI screens first, implementation later.
- [ ] Owner approves the UI mockups and user flows.
- [ ] Owner approves this architecture and tradeoffs.
- [ ] Claude reviews feasibility, authentication redirect and Edge Function limits.
- [ ] Provider terms, privacy and quotas checked with source/date before enablement.

## Official references

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Vite static deploy: https://vite.dev/guide/static-deploy
- Supabase Edge Function authentication: https://supabase.com/docs/guides/functions/auth
- Supabase secrets: https://supabase.com/docs/guides/functions/secrets
