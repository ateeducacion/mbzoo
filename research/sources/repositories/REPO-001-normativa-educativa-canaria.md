---
id: REPO-001
title: "ateeducacion/normativa_educativa_canaria"
kind: external-repository
url: https://github.com/ateeducacion/normativa_educativa_canaria
commit: local clone inspected 2026-08-24 (/Users/ernesto/Downloads/git/normativa_educativa_canaria)
accessed: 2026-08-24
license: CC0-1.0
---
## What it is
IA-friendly Spanish documentation corpus for Canary Islands education law.
Markdown narrative + YAML metadata + JSON-Schema validation + generated indexes.

## Facts observed (local clone)
- `1er-prompt.md` prescribes the golden evidence rule: no claim without norm,
  location, official source, consultation date, internal record; `[PENDIENTE]`
  markers and PREG-NNN questions otherwise.
- Stable monotonic IDs per entity type (FTE/NOR/CUR/AN/REL/PREG/TAREA/DEC),
  never reused.
- `06_indices/*.yaml`: canonical machine-readable indexes keyed by ID, updated
  with every entity; CI gates (`11_calidad/generar_inventario.py --check`)
  detect drift.
- Generated exports in `docs/datos/` produced by scripts with `--check` modes.
- `CLAUDE.md` contains exactly `@AGENTS.md`; skills live in `.agents/skills/`.
- CI workflows pin actions to commit SHAs.

## Relevance to MBZoo
Adopted: evidence discipline, stable IDs, generated indexes with drift checks,
ADR records, CLAUDE.md indirection. Not adopted: Spanish language, domain
vocabularies, Markdown/YAML-only corpus model.
