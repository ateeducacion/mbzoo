# Research & evidence system

Every durable claim in MBZoo traces to a registered record:

- `REPO-NNN` / `STD-NNN` / `TECH-NNN` — inspected sources
- `AN-NNN` — analyses (facts vs interpretation)
- `EXP-NNN` — reproducible experiments (commands, environment, measurements)
- `ADR-NNNN` — architecture decisions (readable decision body; investigation
  in the Addendum; supersede, never rewrite)
- `TASK-NNN` / `Q-NNN` — tracked work and open questions

The system is machine-validated: `bun run research:validate` checks IDs,
required metadata and cross-references; `bun run research:indexes` generates
the indexes (drift-checked in CI).

See [research/](https://github.com/ateeducacion/mbzoo/tree/main/research) in
the repository, and `research/AGENTS.md` for the operational rules.

Machine-readable copies of this site (for agents):
[llms.txt](https://ateeducacion.github.io/mbzoo/docs/llms.txt) (index) and
[llms-full.txt](https://ateeducacion.github.io/mbzoo/docs/llms-full.txt)
(every page). Each HTML page also has a sibling `.md` file and a **Copy
Markdown** control.
