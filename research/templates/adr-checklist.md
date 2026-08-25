# Checklist: Architectural Decision Record

Complete this before marking an ADR `Accepted`. The decision body must
stand alone; the investigation belongs in the Addendum.

## 1. Decision body (readable without the addendum)

- [ ] **Context** states facts and hard constraints (security, portable
      `@mbzoo/core`, zero telemetry, Bun/browser dual runtime), with
      registered IDs.
- [ ] **Problem** is a specific question a chosen option can resolve.
- [ ] **Decision drivers** name the forces that actually mattered.
- [ ] At least two realistic **options** are described briefly, each
      with a registered source when the option is a library/runtime.
- [ ] **Decision** is an imperative ("We will …") plus the standing
      rules future agents must follow.
- [ ] **Consequences** split Positive / Negative / Neutral honestly.
- [ ] **Risks** name failure modes and mitigations (`RISK-NNN` when tracked).
- [ ] **Validation** names a concrete check (test, CI step, experiment).
- [ ] **References** list the registered records the decision rests on.

## 2. Addendum: Investigation (not in the decision body)

- [ ] Comparison **matrix** lives here, not under Options.
- [ ] Adversarial / pre-mortem review of the chosen option lives here:
      failure modes, security/privacy, dependency/lock-in, runtime conflicts.
- [ ] Every technical claim cites a registered ID or carries
      `[PENDING: verification required]`.
- [ ] If an `AN-NNN` exists, the addendum is that investigation, not a
      contradictory second analysis.

Do **not** put matrices, red-teaming or evidence logs in Context,
Options or Decision. That is what made the previous template harder
to read than the reference ADRs (REPO-002, REPO-003).

## 3. Metadata and integrity

- [ ] Frontmatter has `id`, `title`, `status`, `date`, `sources`,
      `ai_tool`, `ai_model`. `id` matches the filename (`ADR-NNNN-…`).
- [ ] H1 is `# ADR-NNNN: <title>`.
- [ ] Status is `Proposed` until review; only then `Accepted`.
- [ ] `bun run research:indexes && bun run research:validate` passes.
- [ ] Changing an accepted decision is a new ADR with `supersedes`;
      the old record is marked `Superseded`. Never rewrite accepted
      history to hide the previous decision.
