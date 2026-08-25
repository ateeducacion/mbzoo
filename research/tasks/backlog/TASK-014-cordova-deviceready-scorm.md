---
id: TASK-014
title: Drive Cordova-wrapped SCORM exports by simulating deviceready
status: open
priority: low
---
The one SCORM package in the corpus (PRSM107, Adobe Captivate) is packaged
for a Cordova app container: its <body onload> waits for window.device and
the `deviceready` event, which no browser fires, and has no timer fallback,
so it never initializes — anywhere, not only in MBZoo (ADR-0032). A boot
script that dispatches a synthetic `deviceready` after load might start it,
but Captivate's Cordova path may then call cordova/window.device APIs that
are absent. Needs more than one such specimen before it is worth the risk;
until then MBZoo runs the infrastructure correctly and this export stays
dark. Verify against additional Cordova-wrapped exports before implementing.
