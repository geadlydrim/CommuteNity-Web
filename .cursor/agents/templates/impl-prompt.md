---
from: orchestrator
to: user
feature: slug
status: ready-to-implement
created: YYYY-MM-DD
refs: []
---

# Implement: {task id} — {title}

Paste the fenced prompt below into a new coding agent. It is self-contained.

````
You are implementing one task for CommuteNity (Next.js 15, `src/` alias `@/*`).

## Task
{id} — {title}

## Read first
- .cursor/agents/STATUS.md
- {work plan packet}
- {design spec / schema note if any}
- {concrete files}

## Change only
{file list}

## Constraints
- Follow the work plan. Do not expand scope.
- Import maps from `@/components/map`.
- Do not hand-edit `src/components/ui/`.
- Do not edit applied SQL migrations.
- Verify in the browser if UI changed (not just a screenshot).

## Done when
{acceptance from the work plan}

## After
Do not update STATUS.md (Coordinator). Leave a short note of what shipped and what you could not verify.
````
