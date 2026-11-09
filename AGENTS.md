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

## Branch naming
Every branch starts with the author's prefix, so the author of a PR is visible from the branch name.
- Format: `<author>/<type>-<short-topic>`
- `<author>`: `gpt`, `claude`, or `skii` (the user)
- `<type>`: `docs`, `feat`, `fix`, `review`, `chore`
- `<short-topic>`: lowercase words separated by hyphens
- Examples: `gpt/docs-mvp-plan`, `claude/review-feasibility`, `claude/feat-plant-registration`, `skii/docs-adr-approval`
- Do not rename a branch that already has an open PR. Close the PR first, or leave the name and note the author in the PR body.

## Review format
- Topic and linked issue/PR
- GPT position and evidence
- Claude position and evidence
- Agreements, disagreements, unresolved questions
- Decision owner, date, status
