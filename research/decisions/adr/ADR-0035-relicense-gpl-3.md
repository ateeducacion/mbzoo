---
id: ADR-0035
title: Relicense MBZoo under GPL-3.0-or-later
status: Accepted
date: 2026-08-26
sources: [TECH-014, REPO-005]
experiments: []
related: [ADR-0018]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0035: Relicense MBZoo under GPL-3.0-or-later

## Context

MBZoo shipped under MIT (`LICENSE`, plus the `license` field of the root and
four workspace manifests). ADR-0018 accepted `h5p-standalone` (TECH-014) for
experimental H5P playback while TECH-014 recorded an unresolved caveat: the npm
package declares MIT, but it vendors the H5P core client scripts, whose upstream
repository distribution (`h5p/h5p-php-library`) is GPL-3.0. RISK-004 tracked the
ambiguity and blocked promoting playback beyond experimental.

The upstream question (tunapanda/h5p-standalone#188, opened 2026-08-25) was
answered on 2026-08-26 by a project collaborator: the npm package *should* be
distributed under GPL-3.0 because the shipped bundle includes GPL-licensed H5P
code, and no specific upstream `h5p/h5p-php-library` version corresponds to the
vendored `vendor/h5p/` tree. The npm metadata still declares MIT.

This is not a developer-tree-only concern. `apps/viewer/src/renderers.ts` imports
`h5p-standalone/dist/frame.bundle.js?raw` into a lazily loaded chunk, so every
built MBZoo site conveys that GPL-3.0 code to its visitors.

Other shipped dependencies are one-way compatible into GPL-3.0: fflate (MIT),
saxes (ISC), dompurify (MPL-2.0 OR Apache-2.0), pdfjs-dist (Apache-2.0). The
Apache-2.0 dependencies are compatible with GPL **3**, not GPL 2. Copyright is
held by ateeducacion and the history has a single human author, so relicensing
needs no contributor canvassing.

## Problem

Under which licence can MBZoo be distributed, now that the built viewer is
confirmed to convey GPL-3.0 code that MIT terms alone cannot cover?

## Decision drivers

- The distributed artifact must be legally distributable as published; a licence
  claim MBZoo cannot honour is worse than a copyleft one.
- H5P playback is a wanted capability, not a candidate for removal to preserve a
  licence label.
- Every other shipped dependency is already GPL-3.0-compatible.
- Moodle itself is GPL-3.0-or-later; MBZoo lives in that ecosystem.
- Relicensing must be within the copyright holder's rights and must not require
  rewriting accepted decisions.

## Options considered

### Option A: Relicense MBZoo under GPL-3.0-or-later — chosen

One licence for source and build. The bundled GPL-3.0 H5P core stops being an
exception to explain.

### Option B: Keep MIT, stop bundling the H5P core

Drop H5P playback, or require a user-supplied bundle at runtime. Preserves
permissive reuse but deletes a shipped feature (ADR-0018) to protect a label,
and a user-supplied-bundle path would need a new network or file-input surface
that ADR-0009/ADR-0014 do not currently allow.

### Option C: Keep MIT source, declare the built bundle GPL-3.0

Technically defensible (the MIT-licensed first-party source really is separable
from the build output) but it requires every consumer to reason about which
artifact carries which terms, and automated tooling reads the repository licence,
not the caveat.

## Decision

We will license MBZoo under **GPL-3.0-or-later**. `LICENSE` carries the verbatim
GPL-3.0 text; the root and workspace manifests declare `GPL-3.0-or-later`.

Standing rules:

1. New shipped dependencies must be GPL-3.0-or-later compatible, and their
   licence is recorded in `research/compliance/licensing/dependency-report.md`.
   An AGPL-3.0, proprietary or otherwise GPL-incompatible dependency requires its
   own ADR before installation.
2. Any distributed build ships `LICENSE` and names the bundled GPL third-party
   code with a pointer to its corresponding source (README, "Bundled third-party
   code").
3. `bun.lock` stays committed: with upstream unable to name the `vendor/h5p/`
   provenance, the locked `h5p-standalone` version plus its integrity hash is
   what identifies the corresponding source we conveyed.
4. Relicensing does **not** authorise porting Moodle PHP. The clean-room rule
   (REPO-005, AGENTS.md) stands on design grounds, not licence grounds.
5. This ADR does not promote H5P playback out of experimental status; ADR-0018
   rule 5 (cross-browser verification) is unchanged and still binding.

## Consequences

### Positive

- RISK-004 is resolved rather than monitored: a GPL-3.0-or-later project
  bundling GPL-3.0 code has nothing left to reconcile.
- One licence covers source, npm metadata and built site — no per-artifact
  explanation, no dual-licence bookkeeping.
- Removes the licence-side blocker that ADR-0018 listed as a negative consequence
  of shipping H5P playback.
- Aligns with Moodle (GPL-3.0-or-later), the ecosystem MBZoo serves.

### Negative

- One-way in practice: returning to a permissive licence would need consent from
  every future contributor.
- Proprietary reuse is excluded. If `@mbzoo/core` is ever published as a
  standalone parser library, its consumers inherit copyleft — the parser is the
  part of MBZoo most plausibly wanted inside closed products.
- Downstream deployers of a modified viewer now carry source-offer obligations
  they did not have under MIT.

### Neutral

- No behaviour change: no code path, bundle, permission or network surface moves.
- Users of the hosted viewer are unaffected; MBZoo stays fully client-side with
  no telemetry (ADR-0009).

## Risks

- **Upstream metadata mismatch.** `h5p-standalone`'s npm `license` field still
  says MIT, so automated scanners will disagree with the maintainer's statement.
  Mitigation: the README "Bundled third-party code" section and the dependency
  report record the maintainer's answer and link the issue; RISK-004 stays
  recorded (resolved for MBZoo's own licence, noted for the upstream label).
- **Unidentifiable corresponding source for the vendored H5P core.** Upstream
  states no specific `h5p/h5p-php-library` version matches `vendor/h5p/`.
  Mitigation: standing rule 3 — the exact published `h5p-standalone` version we
  bundle is identified by the committed lockfile, and that package plus its
  public repository is the corresponding source we can convey.
- **Contributor expectations.** Anyone who read the MIT badge before this date
  contributed under MIT; those contributions are MIT-licensed and remain usable
  in a GPL-3.0-or-later work (MIT is one-way compatible). No takeback is implied.

## Validation

- `bun run check` passes (lint, typecheck, unit tests, build, research validation).
- `LICENSE` is the verbatim GPL-3.0 text; the root and four workspace manifests
  declare `GPL-3.0-or-later`; no remaining prose claims MBZoo is MIT
  (`1st-prompt.md` is a historical transcript and is not amended).

## Follow-up work

- TECH-014, `dependency-report.md` and RISK-004 in `research/status.yaml` updated
  alongside this ADR.
- H5P playback leaving experimental status remains gated on ADR-0018 rule 5, now
  for verification reasons only.

## References

- TECH-014 — h5p-standalone (licence caveat and upstream answer)
- REPO-005 — Moodle GPL boundary / clean-room rule
- ADR-0018 — Experimental H5P playback
- https://github.com/tunapanda/h5p-standalone/issues/188

---

## Addendum: Investigation

### Constraints

- MBZoo has no backend; the "distribution" is a static bundle served to
  browsers, so conveying happens on every page load of a deployed instance.
- `frame.bundle.js` is imported `?raw` and passed into the sandbox as a blob
  URL (ADR-0018 rule 3); it is inlined into a build chunk, so it cannot be
  characterised as a runtime-only dependency the deployer supplies.
- Only the copyright holder (ateeducacion) can relicense; `git shortlog -sne`
  shows one human author plus dependabot/github-actions commits, which carry no
  copyrightable contribution.

### Comparative matrix

| Criterion | A: GPL-3.0-or-later | B: MIT, drop H5P | C: MIT source, GPL build |
|---|---|---|---|
| Runtime / toolchain | unchanged | removes a renderer path | unchanged |
| Footprint / dependencies | unchanged | −190 KB lazy chunk | unchanged |
| Security / privacy | unchanged | unchanged | unchanged |
| License / maintenance | one label everywhere | permissive kept, feature lost | correct but needs explaining per artifact |

### Option notes

Option B was the only option that preserves permissive reuse. It was rejected
because the licence label is not worth a shipped capability, and because the
alternative "user supplies the H5P runtime" design would require a new input or
network surface that ADR-0009/ADR-0014 deliberately do not permit.

Option C is the status quo made explicit. It survives legal scrutiny but fails
practical scrutiny: GitHub, npm and SBOM tooling report the repository licence,
so the correction lives only in prose that tooling never reads.

### Adversarial review

- *Is the maintainer's comment authoritative?* It is a statement by a repository
  collaborator on the project's own issue tracker, consistent with the upstream
  `h5p/h5p-php-library` README that TECH-014 already recorded. It is the best
  available evidence; a metadata change in the npm package would be stronger and
  has been requested in the same thread.
- *Does relicensing over-correct?* It is broader than strictly required (Option C
  is narrower), but the cost of the broader move is adoption breadth, and the
  cost of the narrower one is a permanent explanation attached to every artifact.
- *Does GPL-3.0 conflict with any current dependency?* No. MIT, ISC and
  Apache-2.0 are all compatible into a GPL-3.0 work; DOMPurify's MPL-2.0 OR
  Apache-2.0 dual licence is satisfied by taking the Apache-2.0 arm. Nothing
  shipped is AGPL, GPL-2.0-only or proprietary.
- *Is AGPL needed instead?* No. MBZoo runs entirely in the visitor's browser;
  serving the JavaScript already constitutes conveying under GPL-3.0, so the
  AGPL network clause would add obligations without closing a gap.

### Evidence

- tunapanda/h5p-standalone#188, maintainer reply 2026-08-26: "The `npm` package
  should be distributed under the GPL-3.0 license because `main.bundle.js`
  includes GPL-licensed H5P code" and "there is currently no specific upstream
  version from `h5p/h5p-php-library` that corresponds to `vendor/h5p/`".
- `apps/viewer/src/renderers.ts:3290` — `import('h5p-standalone/dist/frame.bundle.js?raw')`.
- `bun.lock` — `h5p-standalone@3.8.2` with integrity hash.
- Dependency licences as recorded in
  `research/compliance/licensing/dependency-report.md`.
