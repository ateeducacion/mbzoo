---
id: ADR-0003
title: Browser build strategy — Vite for dev/build; Bun keeps tooling/tests/CLI
status: Accepted
date: 2026-08-24
sources: [TECH-003, TECH-002]
experiments: [EXP-001]
supersedes: []
ai_tool: opencode
ai_model: ox-alpha
---
## Context
Option A (all-Bun) vs Option B (Bun tooling + Vite browser) from prompt §16.

## Decision
Option B. Vite owns: dev server/HMR, Web Worker bundling (verified with our
worker entry), production build (477 ms, ~45 kB total assets incl. saxes),
relative-base static output deployable to GitHub Pages.

## Rejected alternatives
All-Bun: worker build story immature for this layout at Bun 1.4.0; no HMR parity.

## Consequences
+ Proven worker pipeline needed by the performance goal (prompt §8).
− Two build systems coexist; acceptable because they own disjoint surfaces.
