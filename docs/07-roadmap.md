# Roadmap and release gates (draft)

Indicative schedule for a small team using third-party AI APIs, not a delivery commitment.

| Phase | Weeks | Deliverables |
|---|---|---|
| Foundation | 1–2 | Auth, DB, storage, CI |
| Identification | 3–4 | Capture, identification, confirmation, plant CRUD |
| Health/history | 5–6 | Health analysis, observations, photo timeline |
| Care | 7–9 | Rules, grounded recommendations, tasks/logs |
| Beta | 10–12 | E2E, security, provider quality, usability |

## Suggested beta targets (not industry benchmarks)
- Plant registration completion ≥80%.
- Identification top-3 inclusion ≥90% on representative test set.
- Manual registration after failed identification ≥90%.
- Health API technical success ≥95% (separate from clinical/agronomic quality).
- Typical registration within 2 minutes.
- Care log persistence success ≥99%.
- Seven-day return rate ≥30%.

## Release gate
Manual fallback works; user ownership enforced; no secrets exposed; API failure is recoverable; recommendations avoid definitive unsupported diagnosis; mobile flow and accessibility tested.

## Immediate priorities
1. Validate providers with real indoor/outdoor plant photos and licensing.
2. Approve schema and RLS design.
3. Approve API contracts and error states.
4. Implement in reviewed feature PRs.
