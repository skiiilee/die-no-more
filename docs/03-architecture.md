# Architecture (draft)

PWA: Next.js App Router + TypeScript + responsive UI.

Server: Next.js route handlers and services. Supabase Auth, PostgreSQL with RLS, private Storage. Deploy target Vercel; monitoring Sentry. Unit tests Vitest; E2E Playwright; CI GitHub Actions.

## Service boundaries
- `identification`: provider adapter, normalized candidates, user confirmation.
- `health`: provider adapter, normalized symptoms and hypotheses.
- `species`: source-backed reference data, licensed cache.
- `recommendation`: deterministic safety/care rules plus grounded LLM explanation.
- `tasks`: schedule, completion, deferral, log transaction.

External provider calls must occur server-side. Long-running calls should use job states `queued / processing / completed / failed` and may later move to a worker queue.

## Open decisions
- Which identification provider meets real-photo accuracy and price constraints?
- What async job infrastructure fits deployment time limits?
- Which offline actions require synchronization in MVP?
