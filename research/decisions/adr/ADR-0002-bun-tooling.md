---
id: ADR-0002
title: Bun as package manager, workspaces, test runner and CLI runtime
status: Accepted
date: 2026-08-24
sources: [TECH-002, REPO-003]
experiments: [EXP-002]
---
## Context
Prompt §15 asks to evaluate Bun's roles separately.

## Decision
- Package manager + workspaces + script runner: Bun (fast installs, workspace:* protocol works).
- Unit tests: bun:test (zero-config TS, fast; Playwright covers browser reality).
- CLI runtime: Bun directly executes TS (`apps/cli`).
- NOT adopted: Bun as dev server or browser bundler (→ ADR-0003), Bun compiler
  for distributable CLI binaries (no current need).

## Evidence
Bun 1.4.0 used throughout bootstrap: install, workspaces, tests (16 passing),
CLI runs on both archive formats. Known caveat EXP-002 documented honestly.

## Consequences
+ Fewer tools, single lockfile, fast CI.
− Bun-specific behaviors can leak (import.meta.dir broke a spec during bootstrap;
  zip.js incompatible). Mitigation: Playwright proves browser behavior; core stays
  runtime-neutral (ADR-0004).
