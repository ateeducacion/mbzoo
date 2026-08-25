# Research rules for agents

Scope: everything under `research/`. For repo-wide rules see the root `AGENTS.md`.

1. Read `status.yaml` before writing anything here; append, never rewrite history.
2. Register a source record **before** citing it. One file per source, named
   `<ID>-<slug>.md`, frontmatter first field `id:`.
3. Claims inside notes/experiments must cite registered IDs (REPO-NNN, STD-NNN,
   TECH-NNN) or carry `[PENDING: verification required]`.
4. Experiments go through `experiments/results/EXP-NNN-<slug>.md`. No command +
   environment + measurement ⇒ it is not an experiment.
5. ADRs follow `templates/adr-template.md`. The decision body (Context,
   Problem, Options, Decision, Consequences) stays readable on its own;
   matrices, adversarial review and the evidence trail live in the
   Addendum. An ADR is for durable decisions; trivial implementation
   details do not get ADRs. Complete `templates/adr-checklist.md` before
   marking Accepted.
6. Never edit `indexes/*.yaml` by hand. Run `bun run research:indexes` after
   adding or changing records, then `bun run research:validate`.
7. IDs are allocated by scanning existing files (highest number + 1) and are
   never reused, even if a file is deleted.
8. Every ADR / analysis / experiment record must declare `ai_tool` and
   `ai_model` in its frontmatter (use `none` / `human-only` when no AI was
   involved). Attribution is part of the record's evidence.
9. When a decision changes, write a new ADR with `supersedes: [ADR-XXXX]` and
   set the old one's `status: Superseded`.
