# AI collaboration policy

## Source of truth
- `main`: approved specifications and code.
- Draft PRs: proposals under review; never treat as approved.
- Issues: work items; ADRs: architecture decisions.
- Preserve existing files and user edits. Read before modifying.
- Never commit credentials, personal data, private plant photos or secrets.

## Responsibilities
- GPT: requirements validation, architecture and security review, acceptance criteria, PR review.
- Claude: code implementation, tests, refactoring, implementation documentation.
- User: final decisions and approval to merge.

## Workflow
1. GPT writes a proposal with assumptions, alternatives, risks, acceptance criteria.
2. Claude comments on feasibility and implementation tradeoffs.
3. Differences are recorded in `docs/reviews/` or PR discussion.
4. User approves important changes; record decisions in ADRs.
5. Claude implements in a feature branch with tests.
6. GPT reviews changed files and test evidence.
7. User approves merge. Never auto-merge.

## Review format
- Topic and linked issue/PR
- GPT position and evidence
- Claude position and evidence
- Agreements, disagreements, unresolved questions
- Decision owner, date, status
