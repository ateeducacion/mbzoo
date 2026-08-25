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
