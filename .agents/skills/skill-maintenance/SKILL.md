---
name: skill-maintenance
description: Create, review or update project Agent Skills under .agents/skills without duplicating stale repository guidance.
---
# Skill: Skill maintenance

1. A skill must have a narrow trigger and actionable project behavior. Put repo-wide canonical invariants in `AGENTS.md`; skills should specialize them for a task/domain.
2. Before writing a skill, inspect the current implementation plus relevant ADRs/docs. Never encode a capability, command, path or constraint from memory if the repo can verify it.
3. Use frontmatter with a stable `name` and a description that says when the skill should load. Keep the body concise enough to be useful during execution.
4. Prefer invariants, decision points, verification commands and failure conditions over tutorials or generic best-practice prose.
5. Cross-reference canonical ADR/source IDs when a rule comes from a durable decision. Do not duplicate long ADR text.
6. When repository reality changes, fix the canonical document and every skill whose instruction became false. Stale skills are worse than missing skills.
7. Do not vendor/copy third-party skill text unless its license and provenance have been verified and preserving it verbatim is intentional. Prefer a local project-specific skill when that is sufficient.
8. Avoid overlapping skills with indistinguishable triggers. Merge or sharpen them instead.
9. After changes, scan `.agents/skills`, `AGENTS.md` and README for contradictory claims/obsolete ADR references, then run the repository checks appropriate to the files touched.
