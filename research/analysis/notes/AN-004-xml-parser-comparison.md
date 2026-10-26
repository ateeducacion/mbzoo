---
id: AN-004
title: XML parser comparison
date: 2026-08-24
sources: [TECH-006]
ai_tool: opencode
ai_model: ox-alpha
---
| Criterion | DOMParser | fast-xml-parser | saxes |
|---|---|---|---|
| Memory profile for large files.xml | whole tree in DOM | whole JS object | event stream |
| Runtime availability | browser only | universal | universal |
| External entity resolution | browser-controlled | configurable | never fetches |
| Malformed-input handling | throws/forgives (impl-defined) | lenient options | strict errors |

## INTERPRETATION
Moodle backup XML is element-heavy with modest text content; event-driven
parsing keeps memory proportional to output model, not document size.
saxes wrapped behind parseXmlEvents() so the implementation can be replaced
without touching parsers. Maintenance status check pending (TECH-006).
