# CommuteNity agent board

How to run the roster. Protocol: [PROTOCOL.md](PROTOCOL.md).

## Say this

| You want | Say |
|---|---|
| Check progress, approve a feature, update the board | `coordinator` |
| Brainstorm or shape a feature | `planner` |
| UI / tokens / map interaction | `design engineer` |
| Architecture + task breakdown | `software engineer` |
| Migrations, RLS, PostGIS, Zod↔DB | `schema engineer` |
| Prompts a coding agent can execute | `orchestrator` (default) |
| Check shipped work in the browser | `verifier` |

## Sync

Roles do not share chat memory. They sync through this folder:

- [STATUS.md](STATUS.md) — what is true in the repo
- [PIPELINE.md](PIPELINE.md) — the feature in flight
- [BACKLOG.md](BACKLOG.md) — approved / parked / later
- [inbox/](inbox/) — dated handoff packets (gitignored; local only)

## Current default

This chat’s default job is **Orchestrator**: turn a Software Engineer work plan into implementation prompts. Do not skip Coordinator approval on new features.
