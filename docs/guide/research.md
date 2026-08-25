# Research & evidence system

Every durable claim in MBZoo traces to a registered record:

- `REPO-NNN` / `STD-NNN` / `TECH-NNN` — inspected sources
- `AN-NNN` — analyses (facts vs interpretation)
- `EXP-NNN` — reproducible experiments (commands, environment, measurements)
- `ADR-NNNN` — architecture decisions (supersede, never rewrite)
- `TASK-NNN` / `Q-NNN` — tracked work and open questions

The system is machine-validated: `bun run research:validate` checks IDs,
required metadata and cross-references; `bun run research:indexes` generates
the indexes (drift-checked in CI).

See [research/](https://github.com/ateeducacion/mbzoo/tree/main/research) in
the repository, and `research/AGENTS.md` for the operational rules.
