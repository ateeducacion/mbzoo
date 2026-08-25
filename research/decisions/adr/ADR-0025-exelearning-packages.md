---
id: ADR-0025
title: eXeLearning packages are classified by what is inside them, not by their extension
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: []
related: [ADR-0009, ADR-0014, ADR-0020, ADR-0022, ADR-0024]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0025: eXeLearning packages are classified by what is inside them, not by their extension

## Context

eXeLearning is the authoring tool behind a large share of the Spanish
vocational-training courses MBZoo is meant to inspect; the backup that
motivated ADR-0020 is one. Its output reaches a backup in several shapes:

- a **published site**, unzipped into a resource — the `SMR_SOR_01_09` case;
- a **`.elpx`** package, which carries *both* the re-importable project
  (`content.xml`, ODE 2.0) *and* a rendered site;
- a legacy **`.elp`**, a ZIP holding `content.data` — a Twisted jelly
  stream, a binary Python-object serialization — usually alongside a
  parseable XML mirror `contentv3.xml`;
- the plugins `mod_exeweb` and `mod_exescorm`, which publish an eXeLearning
  export straight into an activity.

MBZoo showed all of these as an unrecognised archive or a download card.

An early reading of this format was wrong in a way worth recording: a note
in the planning documents claimed `.elpx` was "a published site, not a
source project", from reading only how `exeviewer` opens one. It is both.

## Problem

What should MBZoo show for each of these, without overclaiming and without
adopting code from GPL/AGPL projects into an MIT codebase?

## Decision drivers

- Extensions lie. Real files are mislabelled in both directions, and the
  Moodle plugins accept a `.elpx` that is really a plain `.zip`.
- Whatever is rendered is backup-provided HTML and must stay inside the
  ADR-0014 sandbox with its injected CSP.
- eXeLearning, `exeviewer` (AGPL-3.0-or-later) and the Moodle plugins (GPL)
  may be studied for **format facts** only; nothing is ported (REPO-005).

## Decision

We will classify a package by its ZIP entry names and show the most useful
honest thing for each class.

| Marker entries | Class | Shown |
| --- | --- | --- |
| `index.html` + `content/css/base.css` + `libs/exe_export.js` | modern site | the site |
| `index.html` + `base.css` + `nav.css` + `exe_jquery.js` | legacy site | the site |
| `content.xml` | `.elpx` project | the site it also carries, else its title and file list |
| `contentv3.xml` / `contentv2.xml` | legacy project with an XML mirror | title and file list |
| `content.data` only | legacy project, opaque | a statement of why, and the file list |

Standing rules:

1. Classification reads entry names, never the file extension.
2. Site markers are tested **before** source markers, because a `.elpx`
   carrying both is best shown as its render.
3. Pages render one at a time in the existing opaque-origin sandbox with the
   existing injected CSP, with every asset inlined from the package already
   in memory. Nothing is fetched.
4. A link from one page of the package to another is defused, as ADR-0020
   requires: no document that has not been composed may be reachable from
   the frame. Pages are opened from MBZoo's own list.
5. `mod_exeweb` uses the `entrypath`/`entryname` its backup records rather
   than the filename heuristic `pickWebsiteEntry` applies to a plain
   resource. `mod_exescorm` is handled by ADR-0023, whose parser accepts the
   fork's renamed elements.
6. MBZoo does not reconstruct pages from the eXeLearning project model.
   Rendering a project without its export would mean reimplementing a site
   generator whose format differs between eXe 2.x and 4.x — a sub-project of
   its own, not a preview.

## Consequences

**Positive.** The most common real-world shape — a published site, whether
loose in a resource, inside a `.elpx`, or in a `mod_exeweb` activity —
becomes readable. Legacy `.elp` files stop reading as "unknown binary" and
say what they are.

**Negative.** A `.elpx` with no export shows a title and a file list, not its
content. A `content.data`-only `.elp` shows even less; that is a statement
about the format, not a bug to fix later in the same shape.

**Neutral.** The classifier lives in `apps/viewer/src/lib/exe-package.ts` and
reuses the in-memory ZIP page renderer built for ADR-0024.

## Risks

- **Marker drift.** A future eXeLearning release could change its export
  layout and fall through to `unknown`. That degrades to the file list
  rather than to an error, and the markers are in one function.
- **Misclassifying a non-eXe archive.** The site markers are specific
  enough (`libs/exe_export.js`, `exe_jquery.js`) that a generic ZIP does not
  match; a generic site with `index.html` alone classifies as `unknown`.

## Validation

- `apps/viewer/test/exe-package.test.ts` — each class from its markers; a
  package carrying both project and site classifying as the site; extension
  ignored; the title read from whichever project XML is present; the page
  list ordered with the entry first and named from each page's own title.
- `e2e/viewer.spec.ts` — the fixture's `.elpx` is labelled as an exported
  site, lists its pages, renders the landing page with its relative
  stylesheet applied, and issues no external request.

## References

- REPO-004 — the real backup corpus; SMR_SOR carries the published-site
  shape.
- REPO-005 — format facts are studied; GPL/AGPL code is never ported.
- ADR-0024 — the in-memory ZIP page renderer reused here.
- ADR-0020 — the rule that no unprocessed document may be reachable.
- ADR-0023 — `mod_exescorm`, the SCORM-side fork.

---

## Addendum: Investigation

### Where the format facts came from

The two published-site layouts are the marker sets `exeviewer` tests
(`js/app.js:692-725`); the same file is what made the initial, wrong reading
of `.elpx` look plausible, since it opens `.elpx` and `.zip`
interchangeably as sites. The correction — that a `.elpx` carries the
project *and* the render — came from the vendor's format documentation and
from inspecting real archives, where `content.xml` sits beside `index.html`,
`html/*.html`, `theme/` and `libs/`. Across a sample of real legacy `.elp`
files, the great majority carried a parseable `contentv3.xml` beside
`content.data`, which is why the opaque case is a separate class rather than
the assumed one.

`content.data` is Twisted jelly in banana encoding, not a `pickle` stream —
a distinction worth keeping in the copy, because "pickle" would imply a
decoder exists for it in the browser and none does.

### Why the plugins are read from their backup step definitions

`mod_exeweb` emits a flat `<exeweb>` element carrying `entrypath` and
`entryname`, and annotates three file areas — `intro`, `package`, `content`
— exactly as stock `mod_resource`/`mod_scorm` do. Those names come from
`backup/moodle2/backup_exeweb_stepslib.php:37-52`, which is the generator
itself and therefore authoritative, the same way ADR-0023 reads
`backup_scorm_stepslib.php`. Nothing else from either plugin is used.
