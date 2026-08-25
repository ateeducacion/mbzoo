---
id: ADR-0001
title: Primary implementation language is TypeScript (strict)
status: Accepted
date: 2026-08-24
sources: [TECH-001]
experiments: []
ai_tool: opencode
ai_model: ox-alpha
---
## Context
MBZoo must parse untrusted archives in the browser and share code with a CLI.
Candidates per prompt §14: TypeScript, Rust/WASM, others.

## Options considered
1. TypeScript everywhere — shared browser/CLI code, huge ecosystem, fast iteration.
2. Rust compiled to WASM for parsing/archive — top raw speed, but WASM boundary costs (copying, startup), toolchain friction, small contributor pool.
3. Other languages — no browser-native story without transpilation layers.

## Decision
TypeScript everywhere initially. Rust/WASM only if profiling shows a real
bottleneck (large-file milestone is the first candidate).

## Consequences
+ One language across viewer/core/CLI; contributor accessibility.
− Performance ceiling in hot loops; mitigated by worker offloading and later
  targeted WASM if measured.

## Risks
Multi-GB parsing may demand streaming designs awkward in JS (tracked Q-005..Q-007).
