---
id: ADR-0034
title: Classify package zips (SCORM, eXe) and render them from the resource path
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: []
related: [ADR-0023, ADR-0025, ADR-0032, ADR-0033]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0034: Classify package zips (SCORM, eXe) and render them from the resource path

## Context

A Moodle backup often stores a whole learning package as a single `.zip`
file in a `mod_resource` (or `mod_folder`): a SCORM package Moodle would
normally have unpacked, or an eXeLearning project/export. MBZoo dispatched
file previews purely by extension — `.elpx`/`.elp` reached the eXe renderer
(ADR-0025/0033), `.epub` the EPUB reader (ADR-0024), `.h5p` the H5P player —
but a `.zip` matched no branch and fell through to a bare download button.
Real specimens confirm the gap: the ADL golf sample (`imsmanifest.xml` at the
root), eXe legacy exports carrying `contentv3.xml`, and eXe projects zipped
with a `.elp` file nested inside all landed as "unknown".

## Problem

How should a `.zip` file preview decide what the archive actually is, and
which existing renderer should show it — without adding any new
executable-content surface?

## Decision drivers

- The classification is the same format fact regardless of transport, so it
  belongs in one tested function, not scattered across renderer branches.
- Every renderer needed already exists; the only missing piece for SCORM is a
  parser for the Content Packaging `imsmanifest.xml` (distinct from Moodle's
  flattened `scorm.xml`).
- No new security surface: whatever renders a package zip must reuse the
  opaque-origin sandbox and injected CSP of ADR-0023 (SCORM) / ADR-0014.

## Decision

We will peek a `.zip` file preview and classify its entries with one pure
function, `classifyZip(entries)`, returning `scorm` (has `imsmanifest.xml`),
`exe-nested-elp` (a `*.elp` entry inside), `exe` (`classifyExe` recognises it),
or `other` (fall through to the existing download path — behaviour unchanged).

- `scorm` → `parseImsManifest` (new, in `@mbzoo/core`) resolves the default
  organization's launchable items against `<resources>`, and `renderScormZip`
  shows those pages through the **same** page renderer, VFS shim, SCORM runtime
  and `SCORM_CSP` as a `mod_scorm` activity (ADR-0023/0032). Playback stays
  experimental. Version comes from `<schemaversion>` (`2004…` → SCORM 2004,
  otherwise 1.2).
- `exe-nested-elp` → extract the `.elp` and route it to the eXe renderer
  (ADR-0033), exactly as if it had been dropped directly.
- `exe` → route the zip bytes to the eXe renderer (ADR-0025).

The page renderer (`renderZipPages`) gained an optional `{ headScripts, csp }`
so the SCORM path can inject its runtime; the injection order (head scripts
walked in document order, CSP as the first head child) is the same one
`renderSandboxedHtml` already uses. eXe/EPUB callers pass neither and are
unaffected.

## Consequences

### Positive

- SCORM, eXe and nested-`.elp` zips render instead of offering only a
  download; the classification is unit-tested against the real packages'
  entry shapes and `parseImsManifest` against three real manifests.
- One classification function; renderers are reused, not duplicated.

### Negative

- Raw-SCORM playback carries ADR-0023's experimental limits: a SCO that needs
  a full LMS runtime may not fully drive. `xml:base` in a manifest is not yet
  honoured (no observed package uses it).

### Neutral

- A plain `.zip` still falls through to download; only recognised packages are
  intercepted. Detection is by `.zip` extension or ZIP magic bytes.

## Risks

- A hostile zip is hostile input like any backup file: entries are read
  through the same in-memory unzip, size-capped into the VFS, and rendered in
  the opaque sandbox. No entry name reaches a filesystem; no content reaches
  the app origin. Path/label text is escaped before it reaches the DOM.

## Validation

- `packages/core/test/scorm-xml.test.ts`: `parseImsManifest` happy path,
  SCORM 2004 detection, loose attribute spacing, unresolved item dropped,
  nested item order.
- `apps/viewer/test/exe-package.test.ts`: `classifyZip` for scorm / exe /
  exe-nested-elp / manifest-priority / plain-zip.
- Manual: `parseImsManifest` run against scorm.zip (CAM 1.3 → 1.2),
  scorm2.zip (2004 3rd) and scorm3.zip (2004 4th) resolves the launch href.

## Follow-up work

- A committed e2e fixture wrapping a package zip in a `mod_resource`, to cover
  the render seam end to end (TASK-016).
- Honour `xml:base` if a real specimen needs it.

## References

- ADR-0023 (experimental SCORM), ADR-0025 (eXe inspection), ADR-0032 (SCO
  virtual filesystem), ADR-0033 (legacy .elp rendering).
- REPO-004 (real backups), REPO-005 (Moodle format facts).

---

## Addendum: Investigation

Single realistic approach (reuse existing renderers behind one classifier), so
no comparative matrix. The only build-vs-reuse choice was the SCORM manifest
parser: Moodle's `scorm.xml` (parsed by `parseScormXml`) is a flattened SCO
tree the restore process produces, absent from a raw package, so a separate
`imsmanifest.xml` parser was required rather than an extension of the existing
one. Verified against three real ADL/vendor packages before wiring the
renderer; the render seam reuses ADR-0023's sandbox verbatim, so it introduces
no surface the SCORM threat model has not already covered.
