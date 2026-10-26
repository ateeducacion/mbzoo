---
id: ADR-0013
title: Activity content model — generic XML capture plus per-module renderers
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
ai_tool: opencode
ai_model: ox-alpha
---
## Context
Dozens of Moodle plugins exist; prompt §21 requires inspect/render/launch/export
capabilities and graceful fallbacks.

## Decision
Core provides parseActivityXml(): root attributes (contextid/modulename) plus
all depth-2 leaf fields as a string map — enough for page.content,
url.externalurl, etc., with zero per-plugin parser maintenance.
Viewer renderers dispatch by modulename: page/label (sanitized HTML +
@@PLUGINFILE@@ resolution to blob URLs), url (external link), resource/file/
folder (file cards with inline preview for images/PDF/text, download otherwise),
fallback (metadata list). Binary previews use sandboxed iframes for PDFs;
object URLs are revoked when the selection changes.

## Rejected alternatives
One parser class per plugin at bootstrap (premature); rendering raw module XML
(useless UX).

## Consequences
+ Unknown plugins never break the course view.
− Deep plugin fields beyond depth 2 need future dedicated parsers when a
  renderer requires them (tracked per-renderer).
