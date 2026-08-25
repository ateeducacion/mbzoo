> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/guide/research.md.

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
