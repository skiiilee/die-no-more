# Architecture (revised hosting proposal; UI design first)

**Status: Proposed, not an implemented or approved stack.** The user requested a personal-use GitHub Pages website and **UI screen design before any application code**. First review the navigation, wireframes, visual mockups and prototype in `docs/09-ui-design-plan.md`. After owner approval of UI and architecture, implement React + TypeScript + Vite as a static frontend.

Hosting proposal: GitHub Pages for public static assets; Supabase Auth, PostgreSQL with RLS and private Storage for user data; Supabase Edge Functions for authenticated external API calls and secrets. No Next.js route handlers or Vercel runtime are deployed on GitHub Pages. Unit tests Vitest/React Testing Library; E2E Playwright; GitHub Actions CI/deploy only after UI approval. See `docs/08-development-environment.md` and `docs/decisions/ADR-0002-github-pages-static-app.md`.

## Service boundaries
- `identification`: provider adapter, normalized candidates, user confirmation.
- `health`: provider adapter, normalized symptoms and hypotheses.
- `species`: source-backed reference data, licensed cache.
- `recommendation`: deterministic safety/care rules plus grounded LLM explanation.
- `tasks`: schedule, completion, deferral, log transaction.

External provider calls must occur in authenticated Supabase Edge Functions, never in the public GitHub Pages client with embedded secrets. Long-running calls require an actual execution mechanism (worker/queue or verified bounded execution), not merely job status rows; design retry, idempotency and abandoned-job recovery before implementation. Design-only stage: no services are configured.

## Open decisions
- Owner approval of UI mockups and flows is the prerequisite for any implementation.
- Owner review of proposed GitHub Pages + Vite + Edge Functions architecture.
- URL subpath, SPA hash routing and Supabase Auth redirect handling; these require later browser testing.
- Empty initial species-care DB, first-use Gemini generated unverified care drafts and reuse strategy.
- Which identification provider meets real-photo accuracy and price constraints?
- What async job infrastructure fits deployment time limits?
- Which offline actions require synchronization in MVP?
