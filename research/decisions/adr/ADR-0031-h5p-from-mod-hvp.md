---
id: ADR-0031
title: H5P content stored by mod_hvp is composed into a package, not looked for as one
status: Accepted
date: 2026-08-25
sources: [TECH-014, REPO-004]
experiments: []
related: [ADR-0009, ADR-0014, ADR-0018]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0031: H5P content stored by mod_hvp is composed into a package, not looked for as one

## Context

ADR-0018 plays `.h5p` packages: unzip, hand the path → bytes map to
h5p-standalone inside the opaque-origin sandbox. It was verified against a
synthetic `mod_h5pactivity` fixture that stores the uploaded package in its
`package` file area.

TASK-010 asked for verification against real content. The corpus (AN-008)
carries 106 H5P activities across four backups — every one of them
`mod_hvp`, the H5P plugin that predates Moodle's core one — and **not one
of them contains a `.h5p` file**. `mod_hvp` does not keep the package. It
keeps the main library's name and version and the content parameters as
leaves of `hvp.xml` (`machine_name`, `major_version`, `minor_version`,
`json_content`), the course's whole library tree in a course-wide
`libraries` file area (one folder per library version, ~100 folders, 2,305
files), and each activity's media in a `content` file area keyed by the hvp
instance id.

Result of the first verification run: **0 of 106 played**, and each showed
"This item stores no additional content in the backup" — which is false;
the backup stores everything, in a shape the renderer did not recognise.

## Problem

How does MBZoo play H5P content that was never packaged, without a second
player and without pretending the input is something it is not?

## Decision drivers

- One player, one sandbox, one CSP (ADR-0018 rule 1 and 2 stand).
- Hostile input: `machine_name` and versions come from the backup and are
  used to build paths.
- Bounded work: a course ships around a hundred libraries; a piece of
  content needs five to ten.

## Options

1. **Treat `mod_hvp` as unsupported.** Honest, and leaves the corpus's entire
   H5P population dark. Rejected.
2. **A second player reading mod_hvp's layout directly.** Two playback
   paths to secure and maintain. Rejected.
3. **Compose the package the player already understands.** Chosen.

## Decision

`composeHvpEntries` builds the same path → bytes map `unzipH5p` would have
produced: `h5p.json` (title, main library, one preloaded dependency), 
`content/content.json` (= `json_content`), `content/<media>` (this instance's
`content` records), and every file of every library reachable — through
`preloadedDependencies` — from two kinds of root: the main library, and
every library the parameters name as sub-content in H5P's canonical
`"library": "H5P.Name 1.2"` form. The second kind is what a server learns
from its content-libraries table, which `mod_hvp` does not back up; the
parameters are the only record the backup carries of them. The player is
then invoked exactly as for a `.h5p`.

Standing rules:

1. `machine_name` must match `^[A-Za-z][\w.]*$` and versions must be
   integers, or the activity is not composed. They become folder names.
2. Only libraries reachable from the main library or from a sub-content
   name in the parameters are included; a missing one is an error that
   degrades to the fallback note, never a silent gap.
3. Composition is bounded by `MAX_HVP_PACKAGE_BYTES` and a library count
   cap; a backup cannot make the frame hold the course's whole tree.
4. Media is selected by the hvp *instance* id, read from the `<activity id>`
   root attribute (`ParsedActivity.instanceId`), never by the course-module
   id the tree carries. The two differ in every real backup, and using the
   wrong one silently yields a package with no media at all.
5. The sandbox is unchanged (opaque origin, `allow-scripts` only). The
   player CSP allows `'unsafe-eval'` in `script-src`: several real content
   types (MultiChoice, QuestionSet, InteractiveVideo) evaluate strings while
   attaching, and without it they instantiate and then render an empty
   container with the violation reported only as a page error — the silent
   failure this verification exposed. Eval grants no reach here for the same
   reason ADR-0032 gives: the frame is an opaque origin with no network
   (`connect-src 'none'`), no storage and no parent access, so code that
   arrives as a string has exactly the privileges of the inline script the
   package already runs. `H5P_CSP` may exceed `SANDBOX_CSP` by this one
   source and nothing else, locked by `preview-utils.test.ts`.

## Consequences

**Positive.** The corpus's H5P population becomes reachable by the existing
player, so ADR-0018's compatibility claims can finally be tested against
real content types (see Validation).

**Negative.** Composition reads each needed library file through the worker;
a content type with a deep dependency tree costs more than opening a
package did. Bounded by rule 3.

**Neutral.** `mod_h5pactivity` keeps its `.h5p` path untouched.

## Risks

- **A library the content needs is not in the `libraries` area.** Moodle
  only backs up libraries the course uses, so this should not happen for a
  consistent backup; if it does, rule 2 reports it.

## Validation

- `apps/viewer/test/hvp-package.test.ts` — the composed map contains
  exactly the needed libraries and this instance's media, excludes another
  instance's media and unused libraries; a missing library, a malformed
  `library.json` and a hostile machine name are refused; the size budget
  holds.
- `e2e/viewer.spec.ts` — the fixture's `mod_hvp` activity (hvp.xml +
  libraries area, no `.h5p`) plays: text, dependency marker and image
  render; sandbox unchanged; no external request.
- Real corpus: see the addendum table, filled from the browser sweep of all
  106 activities (TASK-010).

## References

- ADR-0018 — the player and its sandbox, reused unchanged.
- TECH-014 — h5p-standalone.
- AN-008 — where the 106 activities and their shape were found.
- REPO-004 — the corpus.
