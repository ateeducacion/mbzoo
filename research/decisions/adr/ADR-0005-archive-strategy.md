---
id: ADR-0005
title: Archive abstraction; fflate now, lazy access deferred
status: Accepted
date: 2026-08-24
sources: [TECH-004, TECH-005, STD-001, REPO-005]
experiments: [EXP-002, EXP-003]
ai_tool: opencode
ai_model: ox-alpha
---
## Context
.mbz is ZIP **or** TAR.GZ (REPO-005); assuming ZIP is wrong (verified: real
43 KB backup was tgz). Prompt §8 forbids loading multi-GB backups wholesale.

## Decision
ArchiveReader interface (listEntries/readEntry/close) + detectFormat via magic
bytes. Implementations:
- FflateZipReader — ZIP, whole-buffer inflate (RISK-001 documents the memory cost).
- TarGzReader — ustar subset over DecompressionStream('gzip'), traversal-guarded.
Large-file strategy (streaming tar, lazy central-directory reads, OPFS staging)
is deliberately deferred and tracked (Q-004, Q-005, Q-007, TASK-003); the
interface exists precisely so those implementations slot in without touching
parsers.

## Consequences
+ Both real formats work from day one with one tested code path.
− Memory ceiling until TASK-003 lands; document "not yet for multi-GB" in README.
