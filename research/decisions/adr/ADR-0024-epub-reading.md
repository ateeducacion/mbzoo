---
id: ADR-0024
title: EPUB reading — a spine reader of our own, not a reader library
status: Accepted
date: 2026-08-25
sources: [TECH-014]
experiments: []
related: [ADR-0009, ADR-0014, ADR-0017, ADR-0018, ADR-0020]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0024: EPUB reading — a spine reader of our own, not a reader library

## Context

Courses ship `.epub` files as ordinary resources, and until now MBZoo showed
them as a download card. An EPUB is a ZIP: `META-INF/container.xml` names a
package document (OPF), whose `<manifest>` lists resources and whose
`<spine>` gives the reading order. Chapters are XHTML — the same kind of
content MBZoo already renders under ADR-0014.

The obvious move is to adopt a reader library, and that was the initial
intent.

## Problem

How can an EPUB be read chapter by chapter without running its content in
the MBZoo origin and without widening the sandbox?

## Decision drivers

- Chapter content is backup-provided and may carry scripts (ADR-0009).
- No new iframe permission, no CSP widening (ADR-0014, ADR-0017).
- Nothing fetched from any network origin.
- A new dependency needs evidence for purpose, licence, maintenance and
  bundle impact.

## Options

### Option A: parse the format ourselves — chosen

Read `container.xml` → OPF → spine, inline each chapter's relative
references from the in-memory package as `data:` URIs, and render the
chapter through the pipeline archive HTML already uses.

### Option B: adopt foliate-js or epub.js

Rejected on a hard constraint rather than on taste. Both put chapter content
in a **nested iframe** whose sandbox attribute they hard-code —
`allow-same-origin allow-scripts` in foliate-js, `allow-same-origin` in
epub.js — and both then drive their whole layout engine through that frame's
`contentDocument`. Neither exposes an option to drop `allow-same-origin`, and
neither degrades without it: a null `contentDocument` is a crash, not a
reduced-feature mode. That leaves two places to run them and both are closed:

- In the MBZoo origin, chapter XHTML becomes same-origin with the app. That
  is verbatim the option ADR-0017 says to reject loudly.
- Inside the existing preview frame, `frame-src 'none'` blocks the nested
  frame outright.

The `srcdoc` escape hatch does not exist either. A sandboxed document's
opaque origin is minted fresh for each nested browsing context, and the
sandboxing flags are inherited as a union, so a `srcdoc` child of the
preview frame is cross-origin with its own parent. Adopting either library
would therefore have meant trading MBZoo's central privacy promise — that a
backup never leaves the reader's machine — for saving a spine reader.

### Option C: keep the download card

No reading. Honest, and what shipped until now.

## Decision

We will read EPUB with our own spine reader.

Standing rules:

1. Chapters render in the same opaque-origin sandbox with the same injected
   CSP as any other archive HTML. No new sandbox token, no CSP change.
2. Every asset a chapter references is inlined from the package already in
   memory. Nothing is fetched, including from MBZoo's own origin.
3. A link to another chapter is defused, exactly as ADR-0020 requires of
   archive HTML: no document that has not been composed and had a CSP
   injected may be reachable from the frame. Chapters are opened from
   MBZoo's own chapter row and its previous/next controls.
4. A malformed package degrades to the download card with a note. No error
   may take down the detail pane.

## Consequences

**Positive.** EPUB resources become readable, with their stylesheets and
images, under the existing isolation model and with no new dependency.

**Negative.** This is a reader, not a reading system: no pagination, no
CFI, no bookmarks, and the navigation document (NCX or `nav.xhtml`) is not
parsed — chapter names come from each chapter's own `<title>`, which is
always present, rather than from an optional file in one of two incompatible
flavours. Links between chapters inside the page do not navigate; the
chapter row does.

**Neutral.** The reader lives in `apps/viewer/src/lib/epub-reader.ts`,
following the `h5p-player.ts` precedent; `@mbzoo/core` gains nothing
(ADR-0011).

## Risks

- **A package whose spine the synthetic fixture does not represent.**
  Mitigated by tolerance: an unresolvable spine entry is skipped rather than
  failing the book, and an empty spine falls back to the manifest's XHTML
  items in document order.
- **Path traversal through a manifest href.** `joinEpubPath` normalizes
  `..` by popping and clamping at the package root, and every lookup is an
  exact hit against the in-memory entry map — a reference that resolves
  outside the package simply finds nothing.

## Validation

- `apps/viewer/test/epub-reader.test.ts` — title and spine order; a spine
  entry whose idref does not resolve; an empty spine falling back to the
  manifest without turning a stylesheet into a chapter; path resolution
  including a `../../..` escape attempt; asset inlining; a cross-chapter link
  being defused; an external link left for `retargetExternalLinks`; a
  reference the package does not carry left alone; a chapter outside the
  package refused.
- `e2e/viewer.spec.ts` — the fixture's EPUB lists both chapters, renders the
  first with its relative stylesheet and image applied, defuses the
  cross-chapter link, moves through the spine with Next, and issues no
  external request.

## References

- ADR-0014, ADR-0017 — the sandbox and inlining model reused unchanged.
- ADR-0020 — the rule that no unprocessed document may be reachable.
- ADR-0009 — no fetching of backup-referenced content.
- TECH-014 — the h5p-standalone precedent for a package player in the viewer.

---

## Addendum: Investigation

### The library evaluation, in specifics

`foliate-js@1.0.1` (MIT, one small dependency) hard-codes
`sandbox="allow-same-origin allow-scripts"` in its paginator and exposes the
child document as the engine's working surface. `epubjs@0.3.93`
(BSD-2-Clause) hard-codes `sandbox="allow-same-origin"` in its iframe view
and immediately constructs its `Contents` wrapper around `contentDocument`;
its "inline" view is worse, assigning chapter markup to `innerHTML` in the
host document. epub.js is additionally stale — last published 2023-09-26 —
and pulls `jszip`, `lodash`, `core-js`, `@xmldom/xmldom` and `localforage`,
the last of which writes to IndexedDB by default.

Worth recording for a future reader: foliate-js's own EPUB *parser* module is
dependency-free and accepts an in-memory loader. Only its renderer is
unusable here. If this reader ever needs to grow, that parser is the piece
to reconsider — not the renderer.

### Why chapter titles come from the chapter

EPUB 2 ships an NCX; EPUB 3 ships a `nav.xhtml`; both are optional in
practice and disagree in structure. Every chapter, on the other hand, has a
`<title>`. Reading it costs one regex over the first few KB and gives a
name for every entry in the spine, including chapters no navigation document
mentions.
