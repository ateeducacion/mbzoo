---
id: ADR-0012
title: Backup-derived HTML is sanitized with DOMPurify before insertion
status: Accepted
date: 2026-08-25
sources: [TECH-009]
related: [ADR-0009]
ai_tool: opencode
ai_model: ox-alpha
---
## Context
Rendering Page/Label content requires inserting backup HTML into the document.
ADR-0007 forbids raw innerHTML of untrusted strings.

## Decision
Single sanitization point `sanitizeHtml()` in apps/viewer backed by DOMPurify
(html profile, svg disabled). Sanitized HTML may be assigned via innerHTML;
everything else keeps using textContent. Remote media inside content (e.g.
YouTube iframes in real courses) loads only when the user explicitly opens an
activity — never during tree rendering.

## Consequences
+ Real-world course pages render faithfully without shipping unsanitized input
  into the DOM.
− New runtime dependency (~7 kB gzip) in the viewer only; core stays DOM-free.
