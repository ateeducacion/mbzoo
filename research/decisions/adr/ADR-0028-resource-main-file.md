---
id: ADR-0028
title: A resource is the file Moodle marked, not the file whose name looks right
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: []
related: [ADR-0013, ADR-0020, ADR-0022, ADR-0025]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0028: A resource is the file Moodle marked, not the file whose name looks right

## Context

`mod_resource` points at one file. But a teacher who uploads a folder gets
*every* file in it stored under the activity's file area, so the record set
for a resource is frequently not one file — it is a whole tree that happens
to contain the one the activity means.

MBZoo picked the file to show by guessing: `pickWebsiteEntry` preferred
`index.html`, then `default.html`, then any HTML, breaking ties by shallowest
path and then alphabetically.

## Problem

In `SMR_SEGI` (REPO-004, a real institutional backup inspected locally and
never vendored), six resources in one unit — Orientaciones para el Alumnado,
Orientaciones para la Tutoría, Solución a la Tarea, Mapa Conceptual, Unidad
Guiada and Tarea — each carry the same 647-file unit tree, which holds 36
HTML files across several exported sites. The heuristic resolves the same
way for all six, so all six rendered `SEGI01_Contenidos/index.html`.

A reader opening six different activities saw the same page six times, with
nothing indicating anything was wrong. Measured across that backup: of 49
resource contexts carrying a main file, the heuristic agreed with Moodle on
**7**.

## Decision

Moodle already records the answer. `sortorder = 1` on a file record marks the
main file of its area — exactly one record per area carries it
(`mod/resource` sets it when the activity's file is chosen). MBZoo will read
it rather than infer it.

`BackupFileRecord` gains `sortOrder`, and `renderFileList`:

- previews the marked file directly when it is not HTML, with the folder that
  travelled with it collapsed beneath — so a `.elp` resource reads as the
  eXeLearning package it is, not as a website;
- renders a site from the marked file when it *is* HTML, scoping the page set
  to that file's own directory so one resource cannot present another's pages
  as its own;
- falls back to the filename heuristic only when no record is marked.

With the marker, agreement across the same backup is **49 of 49**.

### Standing rule

When Moodle records which record it means — `sortorder` for a resource's main
file, `entrypath`/`entryname` for `mod_exeweb` (ADR-0025), the itemid of the
owning row for a per-row file area (ADR-0026) — read it. A heuristic over
filenames is not a fallback for a fact the backup already carries; it is a
different answer that happens to agree sometimes.

## Consequences

**Positive.** Resources sharing an uploaded folder show their own file. The
`.elp` and package cases reach their own renderers instead of being captured
by website detection.

**Negative.** A backup whose records genuinely carry no marker still relies
on the heuristic, so the failure mode survives for that case — narrowed, not
removed.

**Neutral.** The collapsed sibling list makes the size of these trees visible
where it was previously implicit in "N files".

## Risks

- **`sortorder` used for something else in an area we do not expect.** It is
  a general Moodle field, not a resource-only one, so the read is scoped to
  the resource/folder path rather than applied globally.

## Validation

- `packages/core/test/files-xml.test.ts` — the marker is parsed, and records
  that omit it default to 0.
- `e2e/viewer.spec.ts` — a fixture modelled on the SMR_SEGI shape, where the
  alphabetically-first page would win the heuristic and the marker names the
  other, asserts the marked file is what renders.
- Measured against the real backup: 7/49 before, 49/49 after.

## References

- REPO-004 — the corpus; SMR_SEGI carries the shared-folder shape.
- REPO-005 — Moodle format facts are studied, never ported.
- ADR-0025 — `mod_exeweb`'s `entrypath`/`entryname`, the same principle.
- ADR-0026 — per-row file areas and their itemid, the same principle again.

---

## Addendum: Investigation

### What the measurement was, precisely

For every `mod_resource` context in `SMR_SEGI` that carries a record with
`sortorder = 1`, compare that record's full path against what
`pickWebsiteEntry` returns for the same record set. 49 contexts qualified.
Seven agreed. Of the 42 that did not, six were benign — single-PDF resources
where the heuristic returns nothing and the file list shows the PDF anyway —
and the remaining 36 were a wrong HTML file presented as the resource.

### A difference between the synthetic fixture and real backups

Real Moodle writes `<file id="7685838">`; the generated fixture writes
`<file>`. The parser handles both, but a probe written against the fixture's
shape silently matched nothing on the real file and reported an empty
`sortorder` distribution — which briefly looked like evidence that Moodle
does not write the field at all. Worth knowing before trusting a regex
written against the fixture on real input.
