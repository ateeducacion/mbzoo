---
name: architecture-decision
description: Decide whether an ADR is needed and write/supersede it properly. Use for durable technical decisions in MBZoo.
---
# Skill: Architecture decisions
1. ADR threshold: durable, cross-cutting, hard to reverse ⇒ ADR. Trivial details ⇒ none.
2. Research alternatives first; cite registered sources (REPO/STD/TECH) and experiments (EXP). Run an experiment if docs don't settle it.
3. Copy `research/templates/adr-template.md`; allocate the next ADR-NNNN (scan dir; never reuse).
4. Fill Status/Date/Context/Options/Decision/Consequences/Risks. English only.
5. Changing a decision: new ADR with `supersedes: [ADR-XXXX]`; set old status to Superseded. Never rewrite accepted ADR history.
6. Run `bun run research:validate && bun run research:indexes` and update `research/status.yaml`.
