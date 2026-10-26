---
id: ADR-0016
title: Per-activity export — module XML, rendered content HTML and a files ZIP
status: Accepted
date: 2026-08-25
sources: [TECH-005, TECH-009]
experiments: []
related: [ADR-0009, ADR-0012, ADR-0013, ADR-0014]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0016: Per-activity export — module XML, rendered content HTML and a files ZIP

## Context

MBZoo opens `.mbz` backups read-only. Until now the only way out of the
viewer was the per-file download link inside a resource preview; the
README and root `AGENTS.md` described export as planned, not
implemented.

The detail pane was rebuilt around a header toolbar plus Preview / Info
/ Raw tabs, which puts a natural home for export actions on screen. The
data an export needs is already in memory at that point: the module XML
is read once by the panel and shared across the three tabs, and the
Preview tab holds sanitized DOM (ADR-0012) with resolved `blob:` URLs
for embedded files.

ADR-0009 forbids uploading anything or fetching backup-referenced
remote content. `fflate` (TECH-005) already ships as the ZIP reader
behind `FflateZipReader` and can also write archives.

## Problem

Can MBZoo offer a useful export without either uploading data, adding a
dependency, or claiming the whole-backup re-packaging capability it
does not have?

## Decision drivers

- Nothing may leave the device (ADR-0009).
- No new runtime dependency without an evidence-backed record.
- No new trust boundary: exports must not create a second HTML path
  that bypasses ADR-0012 sanitization.
- The UI must not advertise a capability that is not real.
- Whole-backup export depends on streaming/large-file work that has not
  started.

## Options considered

### Option A: Per-activity export — chosen

Three actions scoped to the selected activity: its module XML, the
rendered content as a standalone HTML document, and its files as a ZIP.
All produced client-side from data already loaded.

### Option B: Whole-backup static site export

Re-package the entire course as a browsable static site. The originally
planned capability, and the most useful end state.

### Option C: No export

Keep the existing per-file download links and let users rely on the
browser's own "Save page as".

## Decision

We will ship **per-activity export** in the detail pane toolbar.

Standing rules for this surface:

1. An export item is offered **only when it has content behind it**.
   Activity XML requires readable module XML; Content HTML requires
   authored content in the preview; Files ZIP requires at least one
   file record in the activity's context.
2. The HTML export **serializes the rendered Preview DOM**, never a
   second resolution of the source fields. The markup was already
   sanitized on the way in, so no new sanitization path is created
   (ADR-0012).
3. Inspector chrome — fallback notes and `.advanced` disclosures — is
   removed from the exported document. The export carries what the
   course author wrote, not MBZoo's UI.
4. Live-only surfaces (sandboxed iframes, pdf.js canvases) are replaced
   by a placeholder note. They cannot travel, and ADR-0014's isolation
   must not be silently dropped into a file that opens elsewhere.
5. `blob:` URLs are re-inlined as `data:` URIs so the file stands alone,
   capped at 2 MB per asset.
6. Download names are slugged from `moduleName`, `id` and title.
   Backup-derived titles are hostile input and must never be able to
   introduce path separators or traversal segments.
7. ZIP entry names are flattened and de-duplicated. Moodle stores files
   by content hash, so distinct paths routinely share a file name.
8. This ADR covers **one activity at a time**. Whole-backup
   re-packaging remains out of scope and must not be described as
   available.

## Consequences

### Positive

- Users can get content out of a backup without uploading it anywhere.
- No new dependency: `fflate` (TECH-005) already ships as the reader.
- Preview, Info and Raw share a single module-XML read instead of three.
- The export offer is derived from real content, so the UI cannot
  advertise something empty.

### Negative

- The README and root `AGENTS.md` must stop describing export as wholly
  unimplemented, and must now distinguish per-activity export (done)
  from backup re-packaging (planned).
- An exported HTML file is content, not a Moodle course; users may
  expect more. Mitigated by a footer note inside every exported file.
- Assets over 2 MB are dropped from the inlined HTML rather than
  bloating it.

### Neutral

- Export lives in `apps/viewer/src/lib/export.ts`, not in
  `@mbzoo/core`. Nothing outside the viewer needs it yet, and ADR-0011
  forbids speculative packages.

## Risks

- **An export is mistaken for a backup.** Mitigation: rule 8, the
  in-file footer note, and the Implemented/Planned split in the README.
- **A hostile title steers a download path.** Mitigation: rule 6, with
  a unit test asserting `../../etc/passwd` cannot produce separators.
- **A ZIP entry escapes its folder.** Mitigation: rule 7, unit tested.
- **The rendered-DOM approach drifts from the source.** Accepted: the
  export matching what the user sees is the point. Raw/XML export
  remains the fidelity path.

## Validation

- `apps/viewer/test/export.test.ts` — file naming, traversal refusal,
  ZIP round-trip and collision handling.
- `apps/viewer/test/xml-highlight.test.ts` — the Raw tab tokenizer
  reproduces its input exactly, so no character is dropped or invented
  on the way to the DOM.
- `e2e/viewer.spec.ts` — XML and HTML exports download with expected
  names and content; exported HTML contains no `blob:` URL; an activity
  with no authored content offers no HTML export.
- CI: `bun run check` plus the blocking chromium Playwright job.

## Follow-up work

- Whole-backup export stays open; it depends on the streaming/large-file
  milestone (Q-004 / Q-007).
- Cross-browser Playwright (firefox, webkit) currently runs only on the
  nightly schedule and is red on webkit for reasons predating this
  change — every worker `read` fails there while `parse` succeeds.
  Worth a separate investigation.

## References

- TECH-005 — fflate (ZIP reader, and the writer used here).
- TECH-009 — DOMPurify, the sanitizer whose output the HTML export
  serializes.
- ADR-0009 — no telemetry, no upload, no automatic remote fetch.
- ADR-0012 — single HTML sanitization path.
- ADR-0013 — activity rendering capability matrix.
- ADR-0014 — static content previews and the opaque-origin sandbox.

---

## Addendum: Investigation

### Constraints

Export had to be producible entirely from state the viewer already
holds. The panel reads an activity's module XML once and the Preview
tab already contains sanitized DOM with `blob:` URLs bound to bytes
fetched through the worker. Anything beyond one activity would have
required either re-reading the archive or holding the whole backup in
memory, which the large-file question (Q-004 / Q-007) has not settled.

### Comparative matrix

| Criterion | A: per-activity | B: whole-backup site | C: no export |
|---|---|---|---|
| Runtime / toolchain | Viewer only, data already loaded | Needs streaming + link rewriting across the course | — |
| Footprint / dependencies | None new; `fflate` already ships (TECH-005) | None new, but large in-memory working set | None |
| Security / privacy | No upload; serializes already-sanitized DOM | Same, but far more surface to rewrite and re-sanitize | No change |
| License / maintenance | MIT, small module | Large, ongoing | None |
| Honest to advertise now | Yes | No — depends on unstarted work | Yes |

### Option notes

**Option A.** The decisive property is that the HTML export serializes
the *rendered* DOM. A first sketch re-resolved `intro`/`content` fields
per module, which would have needed a per-module branch for page,
label, book, glossary, quiz and assign — and would have produced a
second HTML-resolution path competing with ADR-0012. Serializing the
preview is one implementation that covers every module and cannot
diverge from what the user was shown.

**Option B.** Rejected for now, not on merit. It remains the better end
state; it is blocked on streaming and lazy access.

**Option C.** Rejected. "Save page as" captures viewer chrome, keeps
`blob:` URLs that die with the session, and gives no access to the
module XML at all.

### Adversarial review

- *Does this create a second sanitization path?* No. The exported
  markup is `preview.innerHTML` after DOMPurify already processed it;
  nothing new is parsed, and the wrapper is assembled from escaped
  text.
- *Can a hostile backup write outside the download folder?* The
  filename is rebuilt from a slug of `[a-z0-9]+` runs, so separators
  and `..` cannot survive. ZIP entry names are reduced to their last
  path segment. Both are unit tested.
- *Can a sandboxed HTML resource escape by being exported?* Sandboxed
  iframes are removed and replaced by a note, so ADR-0014's isolation
  is never serialized into a file that would open without it.
- *Does inlining assets leak anything?* `data:` URIs are built from
  bytes already read from the user's own file. Nothing is fetched.
- *What breaks first at scale?* A media-heavy page: each asset under
  2 MB is base64-inlined, so a page with many images produces a large
  file. The cap bounds each asset, not the total. Acceptable for one
  activity; it would not be for Option B.

### Evidence

- `fflate` writes ZIPs via `zipSync`; verified by round-tripping through
  `unzipSync` in `apps/viewer/test/export.test.ts` rather than trusted
  from documentation (TECH-005).
- `fflate` was an undeclared import in `packages/core` (a root
  devDependency resolved by workspace hoisting). It is now declared in
  both `packages/core` and `apps/viewer`.
- The "offer only what exists" rule was found by testing, not by
  design: an early build offered a Content HTML export for an activity
  whose preview held only a *"not available"* note, and again for one
  holding only a metadata disclosure. Both are now excluded.
