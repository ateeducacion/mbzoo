---
id: TASK-015
title: H5P InteractiveVideo renders empty from mod_hvp
status: open
priority: low
---
The 7 InteractiveVideo activities in the corpus (esl001-003) compose without
error but render an empty frame, no console or page error (ADR-0031
verification, TASK-010). Each carries a ~25 MB mp4 in the content area. Two
untested hypotheses: the shim does not serve the video element's src for the
path InteractiveVideo builds, or the 3.5 s probe wait predates the video
load and interaction build. Isolate with a longer wait and a src trace on
one activity before changing the shim.

**2026-08-25 narrowing.** A real third-party package embedding
H5P.InteractiveVideo-1.22 (lumieducation problem-case 2341, a 1693-entry
CoursePresentation with 25 libraries) runs clean through `unzipH5p`,
`orderedLibraries` (InteractiveVideo included in the walk) and
`buildPlayerHtml` with no throw. So the library-resolution pipeline is not
the cause; the corpus 0/7 is isolated to the `mod_hvp` → `.h5p` composition
(`composeHvpEntries`) mapping the ~25 MB content-area video to the VFS key
InteractiveVideo's content.json expects. Canonical h5p.org IV examples were
not reachable here (JS-rendered download page; GitHub example packages source
their video from YouTube, so they carry no local mp4 to test against). Repro
needs the esl001-003 backup and a browser; drive it there.
