---
name: mbz-research
description: Research Moodle internals or libraries for MBZoo following the evidence system. Use when investigating format facts, evaluating a library, or registering sources/experiments.
---
# Skill: MBZoo research
1. Read `research/AGENTS.md` and `research/status.yaml` before writing anything.
2. Register every external source first: create `research/sources/{repositories|standards|technologies}/<ID>-<slug>.md` with frontmatter `id/title/kind/url/accessed/license`. Allocate IDs by scanning existing files.
3. Separate FACT / INTERPRETATION / DECISION. Unverifiable claims get `[PENDING: verification required]`.
4. Experiments go to `research/experiments/results/EXP-NNN-<slug>.md` using `templates/experiment-template.md`. No commands + measurements ⇒ not an experiment.
5. Finish with `bun run research:indexes && bun run research:validate`; both must pass before commit.
6. Never edit `research/indexes/*` by hand.
