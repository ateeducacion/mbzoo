---
id: Q-016
title: How can eXeLearning .elp/.elpx packages inside backups be rendered?
status: open
sources: [REPO-002]
ai_tool: opencode
ai_model: ox-alpha
---
Options: (a) parse .elpx (ZIP/XML) and .elp (XML, sometimes gzipped) into the
normalized model and render structure; (b) treat as opaque files with download;
(c) launch eXeLearning HTML exports in the sandboxed preview (ADR-0014).
Needs format study against exelearning sources (REPO-002). Related: Q-011.
