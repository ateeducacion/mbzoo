---
id: TASK-010
title: Verify H5P and SCORM playback against real packages
status: mostly-done
priority: high
---
ADR-0018 rule 5 and ADR-0023 rule 5 forbid compatibility claims beyond the synthetic fixture. The corpus supplies 106 hvp activities (esl001/esl002/esl003/comm411-20200901) and one scorm (PRSM107-2017-07-21). Open each, record what renders and what fails, and either widen the claims or file the failure classes as fixtures.

## Verification log (2026-08-25)

**Method.** A throwaway Playwright driver opens each real backup in the built
viewer, clicks every activity of the module under test, waits, and records
what the preview frame holds: element count, `.h5p-content` presence,
visible images, Captivate containers, console errors, page errors and any
request leaving the page. "Rendered" is strict: a frame with content
elements, an `.h5p-content` node, and no "Unable to find constructor" error.
The driver is not committed; the fixtures and unit tests below are.

**H5P, what the corpus actually stores.** All 106 activities are `mod_hvp`;
none has a `.h5p` file. The content lives in `hvp.xml` (`machine_name`,
versions, `json_content`), the libraries in a course-wide `libraries` file
area, the media in a per-instance `content` area. The ADR-0018 player had
no input path for that shape, so the first run rendered **0 of 106** and
showed "This item stores no additional content in the backup" — untrue.
ADR-0031 composes the package from those pieces.

**Before the sub-content fix** (composition from the main library's
manifest only; esl002 and comm411 — esl001 and esl003 exceeded the driver's
50 MB in-memory limit on that run and are counted in the next table):

| main library | rendered |
| --- | ---: |
| H5P.DragText | 20 / 20 |
| H5P.SingleChoiceSet | 5 / 5 |
| H5P.Summary | 4 / 4 |
| H5P.Essay | 2 / 2 |
| H5P.Blanks | 1 / 1 |
| H5P.MultiChoice | 0 / 10 |
| H5P.Accordion | 0 / 8 |
| H5P.QuestionSet | 0 / 7 |
| H5P.CoursePresentation | 0 / 3 |
| H5P.DocumentationTool | 0 / 2 |
| H5P.InteractiveVideo | 0 / 2 |
| **total** | **34 / 67** |

Every failure was one signature: `Unable to find constructor for:
H5P.AdvancedText 1.1` (32×), `H5P.StandardPage 1.5`, `H5P.Image 1.1` — all
sub-content libraries the parameters name and the main manifest does not.
That is what ADR-0031's second root kind exists for.

**SCORM (PRSM107, Adobe Captivate HTML5, SCORM 1.2).** Under ADR-0023 alone
the frame rendered three elements and nothing else, with no error: the
launch page creates its script element at run time
(`src = 'assets/js/CPXHRLoader.js'`) and that loader fetches the runtime by
XHR, neither of which a `blob:` document with `connect-src 'none'` can
serve. ADR-0032 carries the package as a virtual filesystem with XHR
interception.

**A second defect the sweep exposed: no real activity showed its media.**
Every row of the first run had `visibleImgs: 0`. `mod_hvp` keys the media
area by the hvp *instance* id, and the viewer only had the course-module
id from the tree — the two differ in every real backup (esl001: instance
6, module 22504) — so the media filter matched nothing and the composed
package carried no images or video. The generic activity parser did not
expose the `<activity id>` root attribute despite its own doc comment
saying it did. It does now (`ParsedActivity.instanceId`), and the fixture's
`mod_hvp` activity asserts its image loads.

## Result (after ADR-0031 and ADR-0032)

H5P playback against the 106 real `mod_hvp` activities went from **0** to
**97**. Remaining failures, filed not fixed:

| main library | rendered | note |
| --- | ---: | --- |
| DragText | 30/30 | |
| SingleChoiceSet | 18/18 | |
| MultiChoice | 12/12 | fixed by the eval allowance |
| QuestionSet | 7/7 | " |
| CoursePresentation | 7/8 | one still empty |
| Accordion | 10/11 | one still empty |
| DocumentationTool | 4/4 | |
| Essay, Summary, Blanks | 9/9 | |
| InteractiveVideo | 0/7 | video-heavy; empty frame, no error (below) |
| **total** | **97/107** | 0 external requests throughout |

**InteractiveVideo (0/7)** is the one class left dark. Each carries a ~25 MB
mp4; the frame instantiates and stays empty with no error. Likely the media
element needs the shim to serve the video by a path the interception does
not cover, or 3.5 s was too short to build after the video loads — not
distinguished here. Tracked as TASK-015.

**SCORM (PRSM107).** Infrastructure verified correct — the VFS serves the
package, `window.API` is present, eval runs, no request leaves the page —
but the export never self-starts: it is Cordova-wrapped and waits for a
`deviceready` event no browser fires (ADR-0032 "Known limit", TASK-014). It
fails identically in any browser, so this is the package, not MBZoo.

**Method note kept for the next specimen.** The failure that took longest to
see was a CSP eval violation reported only as a *page error*; the sweep
recorded it but the first analysis pass read only *console* errors and so
called it a silent empty frame. Read both when scoring a frame.
