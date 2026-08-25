---
id: AN-003
title: Archive library comparison
date: 2026-08-24
sources: [TECH-004, TECH-005, STD-001, EXP-002]
ai_tool: opencode
ai_model: ox-alpha
---
| Criterion | @zip.js/zip.js 2.8.59 | fflate 0.8.3 | hand-rolled |
|---|---|---|---|
| Browser support | excellent | good | full control |
| Lazy central-directory access | yes | no | possible |
| Web Streams / workers | yes | partial (async callbacks) | n/a |
| Works under Bun 1.4.0 | **NO (EXP-002)** | yes | yes |
| TAR.GZ | no | gzip only (tar separate) | tar implemented in-core |
| TypeScript API quality | good | good | — |
| License | BSD-3-Clause | MIT | MIT |

## DECISION INPUT
fflate selected initially because one code path runs identically in browser,
Bun tests and CLI. zip.js stays the candidate for lazy random access when the
large-file milestone starts (Q-004) — it would run only in browsers where it is
first-class, but that would leave the Bun test path without coverage unless the
ArchiveReader interface gains a second implementation covered by Playwright.

TAR.GZ: no library needed; ustar parsing implemented in core (~90 lines,
STD-001) over DecompressionStream('gzip').
