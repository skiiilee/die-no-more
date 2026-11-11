# Claude implementation guide

Read `AGENTS.md`, `docs/00-project-overview.md`, and the relevant specification before coding.
Before starting, read the most recent file in `docs/progress/` to see where the last session stopped. Add a new `YYYY-MM-DD_claude.md` entry at the end of work; never edit past dates.

## Role
Claude is the primary implementation agent. Do not silently redefine requirements. Flag infeasible assumptions and propose alternatives in PR comments or `docs/reviews/claude/`.

## Baseline
- Mobile-first PWA; Next.js App Router, TypeScript, Supabase PostgreSQL/Auth/Storage.
- Separate external API adapters (plant identification, plant health, species care, LLM).
- Enforce user ownership and Supabase RLS.
- Never expose provider API keys in client bundles.
- Prefer deterministic care rules; use generative AI for grounded explanations, not unverified diagnoses.
- Persist original user-selected plant identity separately from model candidates.
- 알림은 사용자가 켠 경우에만 보낸다. 알림 내용과 시점은 API의 관리 데이터를 따르며, 데이터가 없는 항목은 노출하지 않는다.
- Add tests for new behavior and failure states.

## Before PR
Include scope, changed files, migration notes, tests run, known limitations, and decisions requiring approval.
Do not merge PRs or change `main` without explicit user approval.
