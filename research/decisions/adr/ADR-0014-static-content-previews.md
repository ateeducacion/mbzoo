---
id: ADR-0014
title: Static content previews — pdf.js canvas and opaque-origin HTML sandbox
status: Accepted
date: 2026-08-25
sources: [TECH-010]
related: [ADR-0009, ADR-0013]
ai_tool: opencode
ai_model: ox-alpha
---
## Context
Chrome blocks PDFs rendered via blob URLs inside sandboxed iframes
("Chrome blocked this page"), and course HTML files carry CSS/JS that must not
run with app-origin privileges (ADR-0009).

## Decision
1. **PDF**: render with pdf.js (Apache-2.0) onto canvas, page-limited, with
   download fallback. No iframe involved.
2. **HTML**: preview in an iframe with `sandbox="allow-scripts"` only —
   an opaque origin that cannot reach parent DOM, cookies or storage — plus an
   injected CSP meta (`default-src 'none'`, blob/data sources, `connect-src 'none'`)
   and relative src/href rewritten to blob URLs of sibling archive files.
3. **CSS/JS/text**: shown as text previews; never injected into the app document.

## Consequences
+ Real course pages (incl. scripts) can be inspected safely; no network
  exfiltration channel; no same-origin access.
− Relative deep-linking inside HTML limited to same-directory matches for now;
  full SCORM-style resolution deferred to the launcher milestone (Q-011).
