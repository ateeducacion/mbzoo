---
id: REPO-007
title: "cloudpedagogy/cloudpedagogy-moodle-file-extractor"
kind: external-repository
url: https://github.com/cloudpedagogy/cloudpedagogy-moodle-file-extractor
accessed: 2026-08-25
license: MIT
ai_tool: opencode
ai_model: ox-alpha
---
Builds file→activity→section associations using (component,itemid) first and
contextid as fallback, with special handling for book chapter ids, question
ids and activity instance ids, keeping a confidence level per association.
MBZoo currently associates by (component, filearea, contextid) — the full
ContentAssociation graph is tracked as TASK-006.
