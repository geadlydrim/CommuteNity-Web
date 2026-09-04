---
from: schema-engineer
to: software-engineer
feature: slug
status: ready-for-se
created: YYYY-MM-DD
refs: []
---

# Schema: {title}

## Decision

New table / alter / JSONB only / reuse existing (`routes`, `stops`, `votes`, …).

## Migration

Filename + what it does. Never edit an applied migration.

## RLS

Who reads, inserts, updates, deletes. Anon vs auth. Pending vs approved.

## App contract

Zod schema path. DB CHECK vs app `safeParse`.

## Triggers

Vote thresholds, username cooldown, `handle_new_user` — touch or leave.

## Rollback / risk

What breaks if this ships wrong.
