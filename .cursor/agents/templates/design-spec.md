---
from: design-engineer
to: software-engineer
feature: slug
status: ready-for-se
created: YYYY-MM-DD
refs: []
---

# Design: {title}

## Goal

User-visible outcome.

## Surfaces

Each screen / state: default, empty, loading, error, denied (anon vs auth).

## Layout

Mobile first. Width tokens: `--content-sm` / `--content-md`. If map: static (no WebGL) vs interactive, and where.

## Tokens

Use existing Jeepney Gold / `--mode-*` / `--status-*`. New tokens only if listed here with `:root` and `.dark`.

## Components

Reuse first (`Button`, `Dialog`, `PostCard`, `MapView`, `LocationSearch`, badges). Do not hand-edit `src/components/ui/`. New shadcn: `npx shadcn@latest add <name>`.

## Interaction

Gestures, focus, toasts, URL changes.

## Do not

Visual ideas that fight OSM tiles, vote greens/reds, or add a second type scale besides Geist + Space Grotesk.
