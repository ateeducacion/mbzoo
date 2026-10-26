---
id: TECH-002
title: Bun
kind: technology
url: https://bun.sh/docs
version: 1.4.0 (local runtime observed)
accessed: 2026-08-24
license: MIT
---
Used for: package manager + workspaces, script runner, unit test runner (bun:test),
CLI runtime. NOT used for browser bundling/dev server (ADR-0003).
Observed caveats: zip.js incompatibility (EXP-002); import.meta.dir is
Bun-specific and breaks Playwright specs (found during bootstrap, fixed).
