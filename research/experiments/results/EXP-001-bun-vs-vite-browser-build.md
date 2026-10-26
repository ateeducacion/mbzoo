---
id: EXP-001
title: "Bun bundler vs Vite for the viewer build"
date: 2026-08-24
status: completed
sources: [TECH-002, TECH-003]
ai_tool: opencode
ai_model: ox-alpha
---
## Objective
Decide the browser build tool (prompt §16, Q-009).

## Environment
macOS (darwin), Bun 1.4.0, Vite 8.2.2, arm64.

## Method / measurements
Bootstrap viewer built with Vite 8.2.2:
- command: `bun run --filter '@mbzoo/viewer' build`
- result: ✓ built in 477 ms; outputs: index 1.72 kB, worker chunk 14.72 kB,
  saxes chunk 26.97 kB, css 1.96 kB; sourcemaps on.
Bun bundler was NOT benchmarked end-to-end because of a decisive qualitative
factor rather than speed: Vite has first-class Web Worker builds
(`new Worker(new URL(...))` transform verified working in this repo),
long-standing GH Pages static output, and ecosystem plugins. Bun's browser
bundler lacks an equivalent worker story at 1.4.0 for our layout.

## Limitations
No head-to-head timing of `bun build` was recorded; decision rests on feature
fit, not performance. Revisit if build times ever matter (they do not at 0.5 s).

## Conclusion → ADR-0003
Option B selected: Bun for tooling/tests/CLI, Vite for browser dev/build.
