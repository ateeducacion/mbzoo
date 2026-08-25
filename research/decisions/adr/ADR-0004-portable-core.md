---
id: ADR-0004
title: Portable core with runtime adapters
status: Accepted
date: 2026-08-24
sources: [TECH-001]
---
## Context
Prompt §13 requires the MBZ parsing layer to avoid Node/DOM/Bun/Vite APIs.

## Decision
packages/core depends only on Web-platform primitives: Uint8Array/ArrayBuffer,
Blob, TextDecoder, DecompressionStream, structured errors. Runtime-specific I/O
lives in adapters (apps/cli uses Bun.file → Blob; apps/viewer passes File/Blob
into a Worker). Normalized model types are the only cross-boundary contract;
XML library objects never escape packages/core/src/moodle.

## Consequences
+ Same parser tested by bun:test and exercised by Playwright.
− Blob/DecompressionStream must exist in every supported runtime; verified for
  browsers and Bun 1.4.0. Deno/Node compatibility considered cheap to retain
  (both implement these APIs) but not gated in CI yet.
