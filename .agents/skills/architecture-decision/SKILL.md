---
name: architecture-decision
description: Decide whether an ADR is needed and write or supersede it correctly. Use for durable technical decisions in MBZoo.
---
# Skill: Architecture decisions

1. Read `research/AGENTS.md` and `research/status.yaml` before changing research records.
2. ADR threshold: durable, cross-cutting, hard to reverse, security-sensitive, or a new trust/runtime boundary. Trivial implementation details do not need an ADR.
3. Research alternatives first. Register REPO/STD/TECH sources and EXP experiments; write an `AN-NNN` when the comparison is non-trivial. Run an experiment when documentation cannot settle a measurable question.
4. Copy `research/templates/adr-template.md`; allocate the next ADR-NNNN by scanning existing files. Never reuse an ID.
5. Decision body (Context / Problem / Options / Decision / Consequences / Risks / Validation) must be readable on its own. Put the investigation — matrix, adversarial review, evidence log — in the **Addendum**, not in the decision body. Complete `research/templates/adr-checklist.md`. English only. Frontmatter includes `ai_tool` and `ai_model`.
6. To change an accepted decision, create a new ADR with `supersedes: [ADR-XXXX]` and mark the old ADR Superseded. Never rewrite accepted history to make the old decision disappear.
7. Regenerate before validating: `bun run research:indexes && bun run research:validate`.
8. Append to `research/status.yaml` only when the decision changes tracked tasks or risks; never rewrite status history.
