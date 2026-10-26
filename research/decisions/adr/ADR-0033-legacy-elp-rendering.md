---
id: ADR-0033
title: Legacy .elp projects are rendered from their contentv3.xml mirror
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: []
related: [ADR-0012, ADR-0013, ADR-0025]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0033: Legacy .elp projects are rendered from their contentv3.xml mirror

## Context

ADR-0025 classified a legacy `.elp` (eXeLearning 2.x) whose payload is
`content.data` — a binary Twisted jelly stream — as opaque, and one with a
`contentv3.xml` mirror as `elp-legacy-xml` shown "as a title and file list".
It noted rendering the mirror was possible but deferred it.

A folder of real `.elp` files (REPO-004, inspected locally) makes the case
concrete: 9 of them, every one carrying `contentv3.xml`, and users who
plainly want to read them ("los .elp deberían renderizar algo tipo legacy").
`contentv3.xml` is the eXe engine's object graph serialized as XML —
`<instance class="…">` objects, each with a `<dictionary>` of
`<string role="key">` → value, and `<reference key="N">` pointing to any
object first defined as `reference="N"`. It carries the project's title,
author, description, the node tree (`Node` instances with `_title`,
`idevices`, `children`), and each iDevice's authored HTML in a
`content_w_resourcePaths` / `content` field.

## Problem

How does MBZoo show the content of a legacy `.elp` without executing it and
without reimplementing the eXe site generator?

## Decision

Parse `contentv3.xml` (or `contentv2.xml`) into the node tree and render each
node's iDevice HTML through the single sanitize path (ADR-0012), with image
references resolved from the package by filename.

- `packages/core/src/moodle/elp-xml.ts` reads the object graph: it builds a
  small element tree, indexes every `reference` id, and walks
  Package → root Node → `idevices` + `children`, resolving references in
  either direction and terminating on cycles and depth.
- The renderer shows title/author/description, then each node's blocks as
  sanitized HTML. Scripts are stripped by the sanitizer, so an interactive
  iDevice (MathJax, a quiz) shows its text but does not run — a faithful
  read, not a re-execution. This is the ADR-0013 model for authored HTML,
  applied to the legacy format.

Standing rules:

1. Only the XML mirror is read. `content.data` stays opaque (ADR-0025);
   there is no jelly decoder in the browser.
2. Legacy content reaches the DOM only through `sanitizeHtml` (ADR-0012).
   The `.elp` format changes nothing about the trust boundary.
3. If the mirror is absent or unparseable, MBZoo degrades to the file list
   ADR-0025 already showed — never to an error.

## Consequences

**Positive.** The 9 real `.elp` render their node trees and content (El_Cid:
9 nodes, 66 KB of HTML; modelocrea: 9 nodes, 210 KB). Legacy material a
vocational teacher has kept for years becomes readable.

**Negative.** No interactivity: MathJax formulas show their LaTeX source, a
quiz shows its questions but cannot be answered. The eXe theme/CSS is not
applied — content is rendered in MBZoo's own styling.

**Neutral.** This revises ADR-0025's "file list only" stance for the
`elp-legacy-xml` case; the opaque `.elp` and the site cases are unchanged.

## Validation

- `packages/core/test/elp-xml.test.ts` — metadata; the root reference
  resolved; the node tree walked; resource-path HTML preferred and read from
  a field object; a FreeTextIdevice's direct content; a non-eXe document
  yielding empty; a reference cycle terminating.
- Verified against the real El_Cid / nebrija / latex / modelocrea `.elp`
  (node counts and content sizes).
- `e2e/viewer.spec.ts` — the fixture's legacy `.elp` shows its node titles
  and iDevice HTML, resolves its image from the package, and fetches nothing.

## References

- REPO-004 — the real `.elp` corpus.
- REPO-005 — format facts studied, not code ported.
- ADR-0012 — the single sanitize path.
- ADR-0025 — classification; this renders the class it left as a file list.
