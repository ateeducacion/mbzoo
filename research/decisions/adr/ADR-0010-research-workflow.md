---
id: ADR-0010
title: Research, evidence and documentation workflow
status: Accepted
date: 2026-08-24
sources: [REPO-001, REPO-002]
related: [AN-001]
ai_tool: opencode
ai_model: ox-alpha
---
## Decision
Adopt the reference-repo methodology adapted to English/TS:
- research/ tree with sources → analysis → decisions separation; FACT /
  INTERPRETATION / DECISION layers; `[PENDING]` markers; stable monotonic IDs.
- Frontmatter-driven records validated by research/tools/validate-research.ts;
  indexes generated into research/indexes/ (committed, drift-checked in CI via
  `--check`). Root architecture-records.json points validators at decisions/adr/.
- Supersession replaces rewriting: new ADR links `supersedes`.

## Consequences
+ Claims traceable; agents get machine-checkable rules.
− Process overhead; kept proportional (single validator, regex frontmatter).
