# Agent Protocol

Shared operating system for CommuteNity roles. Every role reads this first.

## Roster

| Role | Owns | Does not |
|---|---|---|
| **Coordinator** | STATUS, PIPELINE, BACKLOG, `docs/plan.md` checkmarks, approve/park/reject | Implement, invent features |
| **Planner** | Feature briefs, brainstorms | Architecture, prompts, code |
| **Design Engineer** | UI/UX specs, tokens, interaction | Product scope, schema, code |
| **Software Engineer** | Architecture, phased task breakdown | Implementation prompts, product yes/no |
| **Schema Engineer** | Migrations, RLS, PostGIS, Zod↔DB | UI, product scope |
| **Orchestrator** | Implementation prompts (one per task) | Inventing architecture or shipping code |
| **Verifier** | Browser/QA report vs acceptance | Changing scope, rewriting features |

Default role in this repo: **Orchestrator**. Switch only when the user names another role.

## Pipeline

```
You + Planner
  → Feature Brief
Coordinator (approve / park / reject)
  → Design Engineer (if UI)     → Design Spec
  → Schema Engineer (if persist) → Schema Note
  → Software Engineer            → Work Plan (phases + tasks)
Orchestrator                     → Implementation Prompts
Implementer (coding agent / you)
Verifier                         → Verification Report
Coordinator                      → close PIPELINE, update STATUS + docs/plan.md
```

Planner never sends work to Software Engineer until Coordinator approves.
Software Engineer never writes implementation prompts. Orchestrator never invents architecture.

## First actions (every role, every turn)

1. Read this file.
2. Read [STATUS.md](STATUS.md) and [PIPELINE.md](PIPELINE.md).
3. Scan [inbox/](inbox/) for packets `to: <your-role>` whose `status` is not `consumed`.
4. If the user named a role, read that skill under `.cursor/skills/<role>/SKILL.md`.
5. Do not implement code unless the user explicitly says to build, or you are executing an Orchestrator prompt.

## Packet

Copy [templates/_packet.md](templates/_packet.md). Filename:

```
inbox/YYYY-MM-DD-{slug}.{from}-to-{to}.md
```

Inbox `*.md` packets are **gitignored**. They sync roles in this working tree only. Commit [STATUS.md](STATUS.md), [PIPELINE.md](PIPELINE.md), and [BACKLOG.md](BACKLOG.md) — not the packet files.

`from` / `to` slugs: `coordinator` `planner` `design-engineer` `software-engineer` `schema-engineer` `orchestrator` `verifier` `user`

### `status` values

`draft` · `awaiting-approval` · `approved` · `parked` · `rejected` · `ready-for-se` · `ready-for-orchestrator` · `ready-to-implement` · `in-progress` · `verifying` · `done` · `consumed`

When you finish a stage: set your inbound packet to `consumed`, write an outbound packet, and update [PIPELINE.md](PIPELINE.md) (active stage + link).

Only **Coordinator** may set `approved`, `parked`, `rejected`, or `done` on a feature.

## Hard rules

- Treat [STATUS.md](STATUS.md) as truth when docs conflict. The product is this web app; the live foundation is the social feed. Route/stop UI is parked (schema-only is not done).
- Native Android/iOS are out of scope. Do not plan Kotlin, Room, WorkManager, `supabase-kt`, or the sibling `../CommuteNity/` scaffold.
- Schema Engineer is required when a packet touches SQL, RLS, or persisted JSON.
- Verifier does not expand scope. File gaps back to Coordinator.
- Do not edit applied migrations. Add a new file under `supabase/migrations/`.
- Do not hand-edit `src/components/ui/` (regenerate via shadcn).
- Import maps from `@/components/map`, never `react-map-gl/maplibre` directly.

## Invoke

User says the role name (`coordinator`, `planner`, `design engineer`, …) or `@` the skill. Then follow that skill + this protocol.
