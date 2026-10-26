---
id: ADR-0023
title: Experimental SCORM playback — scorm-again in the same document as the SCO
status: Accepted
date: 2026-08-25
sources: [TECH-015, REPO-005]
experiments: []
related: [ADR-0009, ADR-0014, ADR-0017, ADR-0018, ADR-0022]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0023: Experimental SCORM playback — scorm-again in the same document as the SCO

## Context

ADR-0018 shipped experimental H5P playback and closed with "SCORM launchers
remain out of scope of this decision". Until now a `mod_scorm` activity fell
through to the metadata renderer: the reader saw the module's name and could
download the package, but not open it.

A SCORM package is a ZIP whose `imsmanifest.xml` describes organizations,
items and resources. Moodle parses that manifest **at upload time** and
stores the result as rows, so a backup already carries the flattened course
structure in `scorm.xml` — `<scoes><sco>` with `identifier`, `parent`,
`launch`, `scormtype`, `title`, `sortorder`, plus name/value pairs in
`<sco_datas>` (mod/scorm/backup/moodle2/backup_scorm_stepslib.php:39-61,
verified against a Moodle 5.3dev checkout). The extracted package tree is in
the `content` file area at itemid 0; the uploaded archive is in `package`.

## Problem

How can a stored SCORM package be opened without running its JavaScript in
the MBZoo origin, without a server, and without granting the sandbox any
capability it does not already have?

## Decision drivers

- Backup JavaScript must never run in the MBZoo origin (ADR-0009, ADR-0014).
- Nothing may be fetched from any network origin (ADR-0009).
- A SCO that cannot find its API typically fails or shows a blank screen, so
  a viewer that renders the HTML without an API is not much of a viewer.
- No new iframe permission and no CSP widening (ADR-0014, ADR-0022).

## Options

### Option A: runtime and SCO in one document — chosen

Compose the SCO's own HTML with the runtime bundle and a boot script into a
single document, and load it into the existing opaque-origin sandboxed
iframe with the existing injected CSP.

### Option B: shell document hosting the SCO in a nested iframe

The arrangement Moodle itself uses. It cannot work here. `SANDBOX_CSP` sets
`frame-src 'none'`, and even if it did not, a `blob:` URL minted inside an
opaque origin yields *another* opaque origin: the nested SCO would be
cross-origin with its own parent and could not read `window.parent.API`.
Making it work would mean widening the CSP and adopting scorm-again's
`CrossFrameAPI`/`CrossFrameLMS` postMessage bridge, which against an opaque
origin forces the wildcard `'*'` target origin its own documentation warns
about.

### Option C: table of contents only, no runtime

Honest and cheap, but a SCO that calls `LMSInitialize` on a missing API
usually renders nothing at all.

## Decision

We will ship **experimental SCORM playback** using scorm-again (TECH-015).

- The course structure is read from `scorm.xml`, never from
  `imsmanifest.xml`: Moodle has already resolved the manifest, including the
  `item` → `resource` mapping and `xml:base`. `packages/core/src/moodle/
  scorm-xml.ts` parses it and also accepts the `mod_exescorm` fork, which
  renames the module element and the type field.
- A row is launchable when its `launch` is non-empty. This is Moodle's own
  test — `scormtype === 'sco'` gates CMI tracking, not launchability, so an
  asset with an href is launchable (mod/scorm/datamodels/scormlib.php:736).
- The default target is recomputed rather than read from `scorm.launch`,
  which is a foreign key that restore may leave stale
  (restore_scorm_stepslib.php:201-227).
- Each SCO is composed as one document: the classic runtime bundle, then a
  boot script assigning `window.API` / `window.API_1484_11`, then the SCO's
  own markup, all through the unchanged `rewriteRelativeRefs` →
  `retargetExternalLinks` → `injectCsp` pipeline.
- The table of contents lives in MBZoo's chrome and reuses the validated
  navigation bridge of ADR-0022 unchanged, so links between SCOs work.

### Standing rules

1. The frame keeps `allow-scripts`, `allow-popups`,
   `allow-popups-to-escape-sandbox`, and never `allow-same-origin`. No CSP
   directive is widened for SCORM.
2. The runtime is configured with `lmsCommitUrl: false` and
   `enableOfflineSupport: false`. `connect-src 'none'` is the backstop, not
   the only defence.
3. Nothing is persisted. There is no attempt tracking, no grade, no storage;
   the UI says so rather than implying a resumable attempt.
4. Only the runtime flavor the package declares is loaded.
5. Playback is labelled experimental until verified against real packages
   beyond the synthetic fixture. Compatibility claims beyond it are
   forbidden.
6. AICC packages and `scormtype` values other than `local`/`localsync` are
   out of scope; they degrade to the package download.

## Consequences

**Positive.** SCORM content in a backup becomes inspectable. The isolation
model is reused unchanged — same iframe policy, same CSP, no postMessage
bridge to the app beyond the one ADR-0022 already validates. Bundle cost is
paid only when a SCORM activity is opened, and only for the declared
standard.

**Negative.** MBZoo now injects a third-party runtime into a document that
also runs course-authored scripts. A SCO that expects the LMS in a parent
frame, rather than on its own window, will not find it — this arrangement
answers `findAPI(window)`, which is what the ADL wrapper checks first, but it
is not the frame topology Moodle uses.

**Neutral.** `imsmanifest.xml` is still shipped in the fixture and still
listed in the file list; MBZoo simply does not need to parse it.

## Risks

- **A package the synthetic fixture does not represent.** Mitigated by rule
  5 and by degrading to the package download rather than erroring.
- **Sequencing and prerequisites are ignored.** MBZoo lists every launchable
  item; a package that expects enforced ordering will let a reader jump.
  Acceptable for an inspection tool, and stated in the UI copy.
- **Dependency behaviour changing on upgrade.** The two network gates are set
  explicitly rather than relied on as defaults, and TECH-015 records the code
  paths they guard.

## Validation

- `packages/core/test/scorm-xml.test.ts` — activity fields, the flattened
  structure, `sco_data` name/value pairs (where `isvisible` lives), the
  `mod_exescorm` fork, a package with no SCOes, and the launch-target rule.
- `e2e/viewer.spec.ts` — the demo fixture's SCORM activity lists both
  launchable items; the first SCO finds the API through `findAPI(window)`,
  calls `LMSInitialize` and reads back what it set; the sandbox attribute is
  unchanged; no request leaves the page; and a link between SCOs navigates
  through the ADR-0022 bridge.
- `bun run check` plus the chromium Playwright job.

## References

- TECH-015 — scorm-again: build shapes, network gates, licence, bundle size.
- REPO-005 — Moodle format facts are studied, never ported line by line.
- ADR-0018 — the H5P precedent this reuses; it explicitly deferred SCORM.
- ADR-0022 — the validated in-frame navigation this table of contents reuses.

---

## Addendum: Investigation

### Why the manifest is not parsed

Reading `imsmanifest.xml` would mean reimplementing Moodle's resolution
rules: `item/@identifierref` → `resource/@identifier`, `launch` =
`resource/@xml:base` + `resource/@href` (Moodle applies `xml:base` only from
`<resource>`, never from `<resources>` or `<manifest>`), `adlcp:scormType`
defaulting to `asset`, a dangling `identifierref` degrading to
non-launchable, and a fallback that turns every `<resource href>` into a row
when a manifest has no organizations. All of that has already run before the
backup was written. Parsing `scorm.xml` gets the same answer with none of the
reimplementation, and cannot disagree with what Moodle would show.

One namespace note, since it would matter if MBZoo ever did read manifests:
MBZoo's saxes parser runs in plain (non-namespace) mode, so element names
arrive as raw qnames. Moodle is in the same position — its own reader
uppercases names and matches literal prefixed qnames like `ADLCP:SCORMTYPE` —
so both are case-insensitive but prefix-sensitive.

### Order of injection

`injectHead` prepends, so head injections apply in reverse document order.
The first implementation passed `[runtime, boot]` in array order and produced
a document where the boot script ran **before** the runtime it instantiates;
the guard in the boot script swallowed it and the SCO reported no API. The
array is now walked backwards so it reads in document order. The e2e test
asserts the SCO actually reaches the API rather than asserting the document
merely contains the bundle, which is what caught this.

### What "no network" rests on

Three independent things, in order of how much they are trusted: the
configured `lmsCommitUrl: false` and `enableOfflineSupport: false`; the
library's own gating of every HTTP call site on those settings (TECH-015);
and `connect-src 'none'` in the injected CSP, which holds even if both of the
former are wrong. The e2e test asserts no request leaves the page.
