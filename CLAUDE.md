# Claude implementation guide

Read `AGENTS.md`, `docs/00-project-overview.md`, and the relevant specification before coding.

## Role
Claude is the primary implementation agent. Do not silently redefine requirements. Flag infeasible assumptions and propose alternatives in PR comments or `docs/reviews/claude/`.

## Baseline
- Mobile-first PWA; Next.js App Router, TypeScript, Supabase PostgreSQL/Auth/Storage.
- Separate external API adapters (plant identification, plant health, species care, LLM).
- Enforce user ownership and Supabase RLS.
- Never expose provider API keys in client bundles.
- Prefer deterministic care rules; use generative AI for grounded explanations, not unverified diagnoses.
- Persist original user-selected plant identity separately from model candidates.
- Avoid fixed automatic watering instructions without user observation.
- Add tests for new behavior and failure states.

## Before PR
Include scope, changed files, migration notes, tests run, known limitations, and decisions requiring approval.
Do not merge PRs or change `main` without explicit user approval.
