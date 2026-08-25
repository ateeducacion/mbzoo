---
id: ADR-NNNN
title: One-line decision title
status: Proposed # Proposed | Accepted | Rejected | Superseded
date: YYYY-MM-DD
sources: [TECH-NNN, REPO-NNN]   # registered source records
experiments: [EXP-NNN]          # if applicable
related: []                     # AN-NNN / ADR-NNNN this decision rests on
supersedes: []
ai_tool: opencode | claude-code | grok | antigravity | none | …
ai_model: model identifier, or "human-only"
---

# ADR-NNNN: One-line decision title

<!--
Decision body first. Investigation last.

The sections above the addendum must answer "what was decided and why"
without requiring the reader to absorb the evaluation trail. Put
matrices, red-teaming, option-by-option notes and the evidence log in
the Addendum. Complete `research/templates/adr-checklist.md` before
marking Accepted. Delete these comments before submitting.
-->

## Context

<!-- Facts that force a decision. Constraints, current state, why now.
     Cite registered IDs. No opinions here. -->

## Problem

<!-- The specific question this ADR answers. A chosen option must resolve it. -->

## Decision drivers

- Driver 1
- Driver 2

## Options considered

### Option A: …

<!-- Short description, then the decisive pros/cons. Detail belongs in
     the Addendum. -->

### Option B: …

### Option C: …

## Decision

<!-- The option chosen, stated as "We will …". Include the standing
     rules future agents must follow. -->

## Consequences

### Positive

- …

### Negative

- …

### Neutral

- …

## Risks

<!-- What could go wrong, and the mitigation. Use RISK-NNN when the
     risk is tracked in status.yaml. -->

## Validation

<!-- How we will know the decision holds: tests, CI step, experiment,
     follow-up review. -->

## Follow-up work

<!-- Concrete next steps. Link TASK/Q/ADR IDs when they exist. -->

## References

<!-- Registered sources, experiments, analysis notes, related ADRs. -->

---

## Addendum: Investigation

<!-- Durable copy of the research that informed the decision.
     When an AN-NNN exists, this addendum is that investigation
     travelling with the ADR — not a second competing analysis.

     Required when more than one realistic option was evaluated.
     Omit only for trivial single-option records (then say why). -->

### Constraints

### Comparative matrix

| Criterion | Option A | Option B | Option C |
|---|---|---|---|
| Runtime / toolchain | | | |
| Footprint / dependencies | | | |
| Security / privacy | | | |
| License / maintenance | | | |

### Option notes

### Adversarial review

<!-- Pre-mortem of the chosen option: failure modes, security,
     lock-in, assumptions challenged. -->

### Evidence
