---
id: TASK-016
title: e2e fixture wrapping a package zip in a mod_resource
status: open
priority: low
---
ADR-0034 classifies a `.zip` resource (SCORM by imsmanifest.xml, eXe by
content XML, or a nested `.elp`) and renders it through the existing
sandbox renderers. `parseImsManifest` and `classifyZip` are unit-tested,
and `parseImsManifest` was checked against three real packages, but the
render seam — `renderScormZip` → `renderZipPages` with injected SCORM
runtime + `SCORM_CSP` — has no end-to-end coverage. Adding a `mod_resource`
whose main file is a package zip to a fixture would exercise it, at the cost
of shifting the demo's activity counts and the hardcoded e2e nav positions.
Deferred to avoid that churn while the classification landed; do it when the
fixture counts are next revised. Assert the SCORM chip appears and a launch
page paints (not a download button), and that an eXe-in-zip routes to the
eXe renderer.
