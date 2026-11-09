# Claude implementation guide

Read `AGENTS.md`, `docs/00-project-overview.md`, and the relevant specification before coding.
Before starting, read the most recent file in `docs/progress/` to see where the last session stopped. Add a new `YYYY-MM-DD_claude.md` entry at the end of work; never edit past dates.

## Role
Claude is the primary implementation agent. Do not silently redefine requirements. Flag infeasible assumptions and propose alternatives in PR comments or `docs/reviews/claude/`.

## Baseline
- Proposed new implementation baseline (awaiting user approval of ADR-0002): React + TypeScript + Vite, static deployment on GitHub Pages; Supabase Auth/PostgreSQL/Storage and Edge Functions for backend-only provider calls.
- Separate external API adapters (Pl@ntNet candidate for identification; Gemini candidate for generated care guidance/optional image health assessment); evaluate exact quotas, privacy terms and model quality before enabling.
- Enforce user ownership and Supabase RLS.
- Never expose provider API keys in client bundles.
- Prefer deterministic care rules; use generative AI for grounded explanations, not unverified diagnoses.
- Persist original user-selected plant identity separately from model candidates.
- Avoid fixed automatic watering instructions without user observation.
- Add tests for new behavior and failure states.
- GitHub Pages cannot host Next.js route handlers. Do not put provider secrets in Vite environment variables or compiled client assets; keep them in Supabase Edge Function secrets.
- Build for `base: '/die-no-more/'`, verify client-side routing and Supabase auth redirects under the subpath.
- Start canonical species/care tables empty; generate care data for a newly confirmed species only if a cached record is absent, with provenance and `unverified` status.
- A provider outage or quota exhaustion must not block manual plant registration or care logging.
- Read `docs/08-development-environment.md` and `docs/decisions/ADR-0002-github-pages-static-app.md` before scaffolding the app; proposals are not approved until the owner merges the PR.

## Before PR
Include scope, changed files, migration notes, tests run, known limitations, and decisions requiring approval.
Do not merge PRs or change `main` without explicit user approval.
