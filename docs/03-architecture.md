# Architecture (draft)

PWA: Next.js App Router + TypeScript + responsive UI.

Server: Next.js route handlers and services. Supabase Auth, PostgreSQL with RLS, private Storage. Deploy target Vercel; monitoring Sentry. Unit tests Vitest; E2E Playwright; CI GitHub Actions.

## Service boundaries
- `identification`: provider adapter, normalized candidates, user confirmation.
- `health`: provider adapter, normalized symptoms and hypotheses.
- `species`: source-backed reference data, licensed cache.
- `recommendation`: deterministic safety/care rules with source display. No LLM in MVP (ADR-0003 D3).
- `tasks`: schedule, completion, deferral, log transaction.

External provider calls must occur server-side. Long-running calls should use job states `queued / processing / completed / failed` and may later move to a worker queue.

## Hosting and deployment
Decided in ADR-0002: Next.js App Router on Vercel, Supabase for Auth, PostgreSQL and Storage. The GitHub Pages target in `08-functional-review.md` is superseded.

## Layers
Dependencies point one way only: Types → Config → Repo → Service → Runtime → UI. Lower layers never import upper layers. Cross-cutting concerns (session, logging, error reporting, feature flags) enter only through one Providers module.

## Mechanical checks
- CI fails on any layer dependency that points the wrong way.
- Lint rules cover naming, structured logging and file size. Error messages include remediation steps.
- Docs check covers internal links, progress log format and ADR status.
- Secret scan runs on every PR.

## Documentation maintenance
A documentation maintenance agent runs weekly, Monday 08:40 KST (ADR-0003 D19). It finds stale references and superseded decisions and opens fix-up PRs. It never merges. The user approves every merge (AGENTS.md).

## Resolved decisions ([ADR-0003](decisions/ADR-0003-implementation-decisions.md))
- Async: synchronous Route Handler calls, no queue. 30s function limit, 25s request deadline, per-call timeout min(10s, remaining − 5s), one retry only if ≥12s remain (D7).
- Offline: app shell cache and offline banner only; no offline write sync in MVP (D9).
