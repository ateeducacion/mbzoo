# Research

Evidence-first research system for MBZoo, adapted from the methodologies of
`ateeducacion/normativa_educativa_canaria` and `exelearning/moodle-mod_exelearning`
(REPO-001, REPO-002). Everything here is in English.

## Layout

| Path | Purpose | ID series |
|---|---|---|
| `sources/repositories/` | Inspected external repositories | REPO-NNN |
| `sources/standards/` | Specifications and format standards | STD-NNN |
| `sources/technologies/` | Libraries, runtimes and tools | TECH-NNN |
| `analysis/notes/` | Interpretations built on top of sources | AN-NNN |
| `decisions/adr/` | Architecture decision records | ADR-NNNN |
| `experiments/results/` | Reproducible experiment records | EXP-NNN |
| `tasks/questions/` | Open research questions | Q-NNN |
| `tasks/backlog/` | Tracked work items | TASK-NNN |
| `compliance/` | Security, privacy, licensing analyses | — |
| `indexes/` | **Generated** — never edit by hand | — |
| `tools/` | Index generation and validation scripts | — |

## Ground rules (binding)

1. **Evidence before preference.** Every durable claim cites an official doc,
   source code (repo + tag/commit), a specification, a reproducible experiment
   or a prior ADR.
2. **Separate layers.** FACT (observed) → INTERPRETATION → DECISION. Never
   present interpretation as fact.
3. **No invented evidence.** Unverified items are marked
   `[PENDING: verification required]`.
4. **Stable IDs, never reused.** Monotonic per series. Supersede, don't rewrite:
   accepted ADRs keep their history (`supersedes:` links).
5. **Experiments must be reproducible**: objective, hypothesis, environment,
   versions, exact commands, measurements, limitations, conclusion.
6. Generated files live only under `indexes/`; regenerate with
   `bun run research:indexes`, validate with `bun run research:validate`.

See `AGENTS.md` for the operational rules agents must follow.
