---
id: REPO-002
title: "exelearning/moodle-mod_exelearning"
kind: external-repository
url: https://github.com/exelearning/moodle-mod_exelearning
commit: local clone inspected 2026-08-24 (/Users/ernesto/Downloads/git/mod_exelearning)
accessed: 2026-08-24
license: GPL-3.0-or-later
---
## Facts observed (local clone)
- `research/AGENTS.md`: 16 binding principles (evidence-before-preference,
  append-only ledger, stable IDs, no vendoring, reproducible experiments).
- ADRs at `research/decisiones/adr/DEC-<issue>-<nn>-<slug>.md` with YAML
  frontmatter (id/title/status/date/supersedes/sources/experiments) and a
  machine validator (`research/tools/architecture-records.mts`) configured by
  root `architecture-records.json`.
- `build_indexes.py` generates 8 indexes from frontmatter; outputs marked as
  generated.
- Experiment records require hypothesis + commit SHA + environment + commands +
  metrics + limitations ("without these it is an anecdote").
- status.yaml is an append-only ledger of decisions/tasks/risks (RIE-NNN).
- CI: concurrency-cancel groups, coverage ratchet, Dependabot-pinned actions.

## License caution
GPL-3.0 repository: conventions and *ideas* are reusable; **no code copying**
into MIT MBZoo (root AGENTS.md rule).

## Relevance to MBZoo
Primary template for the research/evidence system, ADR validation approach and
experiment record format. PHP-specific machinery not applicable.
