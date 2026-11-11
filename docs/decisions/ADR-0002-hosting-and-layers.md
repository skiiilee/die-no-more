# ADR-0002: Hosting, layers and documentation checks

Status: Accepted (user decision)
Date: 2026-11-11
Related: ADR-0001, `docs/03-architecture.md`, `docs/04-api-design.md`, `docs/08-functional-review.md` §1

## Context
ADR-0001 proposed a PWA on Next.js, TypeScript and Supabase. `docs/08-functional-review.md` names GitHub Pages as the access target. Provider API keys must stay on the server, and plant photos are private, so static hosting alone cannot call providers safely.

## Decision
1. **Hosting:** Next.js App Router on Vercel. Supabase provides Auth, PostgreSQL with RLS, and private Storage. Provider calls run in Route Handlers and service modules on the server. This supersedes the GitHub Pages target in `08-functional-review.md` §1.
2. **Merge approval:** Unchanged. The user approves every merge. Agents never merge PRs.
3. **Layers:** Dependencies point one way only: Types → Config → Repo → Service → Runtime → UI. Lower layers never import upper layers.
   - Types: domain types and validation schemas.
   - Config: environment variable access, server-only.
   - Repo: Supabase data access, RLS-aware.
   - Service: identification, health, species, recommendation, tasks, and provider adapters.
   - Runtime: Route Handlers and server actions with auth and ownership checks.
   - UI: React components and pages. UI code never imports Config or Repo.
   - Cross-cutting concerns (session, logging, error reporting, feature flags) enter only through one Providers module.
4. **Mechanical checks in CI:** layer dependency check, lint rules (naming, structured logging, file size limit), docs check (internal links, progress log format, ADR status), and secret scan on every PR. Error messages include remediation steps.
5. **Documentation maintenance agent:** runs on a schedule (frequency to be set). It finds stale references and superseded decisions and opens fix-up PRs. It does not merge.

Items 2–5 are adapted from OpenAI's harness engineering article (2026-02-11), which the team reviewed. Item 2 deliberately differs from the article, where agents often merge their own PRs.

## Consequences
- GitHub Pages is no longer the hosting target. `08-functional-review.md` §1, §3, §4 and §6–7 were updated in the same PR (#5) to match this decision.
- Layer rules, CI checks and the maintenance agent are implementation tasks for stage 4.
- API keys follow the rules in `03-architecture.md`: server environment only, never `NEXT_PUBLIC_`.

## Alternatives considered
- GitHub Pages static site with Supabase Edge Functions for provider calls. Kept as a fallback if GitHub Pages becomes a hard requirement. Not chosen, because it splits hosting across two services and needs a new ADR.
