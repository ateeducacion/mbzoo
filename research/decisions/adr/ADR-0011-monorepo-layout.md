---
id: ADR-0011
title: Monorepo layout — three packages, boundaries proven before splitting
status: Accepted
date: 2026-08-24
sources: [REPO-003]
ai_tool: opencode
ai_model: ox-alpha
---
## Decision
```
apps/viewer    Vite vanilla-TS web app (+ parse worker)
apps/cli       Bun CLI adapter
packages/core  portable model + archive + moodle parsers (@mbzoo/core)
fixtures/      deterministic synthetic fixtures + generator + manifest
research/, docs/, e2e/, .agents/, .github/
```
The prompt §12 sketch lists archive/moodle/activities/exporter/runtime as
candidate packages. Splitting NOW would be premature fragmentation (§12's own
rule): no second implementation of any boundary exists yet. New packages appear
only when a real boundary demands it (first candidates: activities renderers,
exporter).

## Consequences
+ Minimal dependency graph (viewer→core, cli→core).
− core will grow until the activities milestone; watch import coupling.
