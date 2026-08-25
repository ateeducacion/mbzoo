---
id: ADR-0009
title: Untrusted-content security model (bootstrap scope)
status: Accepted
date: 2026-08-24
sources: [STD-001, REPO-005]
---
## Threats in scope from day one
Path traversal / Zip Slip (tar name sanitization tested), XML entity expansion
and XXE (external entities never fetched; text budget enforced; malformed XML
rejected — tested), oversized inputs (MAX_XML_BYTES), MIME/filename metadata
treated as untrusted strings everywhere.

## Standing rules
1. Every .mbz is hostile. Parsers validate before narrowing; warnings over crashes.
2. Backup-derived strings reach the DOM only via textContent (ADR-0007).
3. Interactive content (SCORM/H5P/HTML) must NEVER execute in the app origin:
   future launchers run sandboxed iframes (opaque origin) + restrictive CSP +
   postMessage capability bridge. No launcher ships in bootstrap; the rule is
   recorded now so no renderer grows an unsafe shortcut.
4. No network requests originate from parsing; nothing leaves the browser
   (docs/PRIVACY.md).

## Open items
SVG-with-script, Blob URL lifetime management, popup escape hardening are
designed-for but not implemented; they gain ADRs when the launcher milestone
starts (Q-011).
