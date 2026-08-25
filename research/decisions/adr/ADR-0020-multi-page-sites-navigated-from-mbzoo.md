---
id: ADR-0020
title: Multi-page sites are navigated from MBZoo, not by following links inside the sandbox
status: Superseded
date: 2026-08-25
sources: [REPO-004]
experiments: []
related: [ADR-0009, ADR-0013, ADR-0014, ADR-0017]
supersedes: []
superseded_by: [ADR-0022]
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0020: Multi-page sites are navigated from MBZoo, not by following links inside the sandbox

## Context

ADR-0017 renders a multi-file HTML resource by inlining every resolvable
relative `src`/`href` as a `data:` URI, because an opaque-origin iframe
cannot load a `blob:` URL minted by the app origin. That rule was written
for *assets* — stylesheets, scripts, images — and applied to every
reference, including links to **other HTML pages of the same site**.

An eXeLearning export is exactly that shape. "Solución a la tarea. SOR01."
in `SMR_SOR_01_09` (a real institutional backup, inspected locally and
never vendored) is 108 files: `index.html`, seven sibling pages, four
stylesheets, jQuery, and ninety images. Every page carries the same site
navigation, so every page links to all the others.

Following one of those links inside the frame took the reader to
`data:text/html;base64,…` holding the sibling page's **raw bytes**:

- Its own `<link rel="stylesheet" href="base.css">` is still relative, and
  a relative URL cannot resolve against a `data:` base. The page arrived
  unstyled, unscripted and imageless — the reported symptom.
- It never went through `injectCsp`, so ADR-0017's network block did not
  apply to it. A page reached this way could request remote content, which
  ADR-0009 forbids.

Inlining the sibling *processed* rather than raw does not work either: each
of the eight pages links to the other seven, so recursive inlining is
O(pages^depth) — the assets would be duplicated into every copy.

## Problem

How does a reader move between the pages of a multi-page site when the
frame is an opaque origin with no network, without duplicating the whole
site into every page and without leaking a document past the injected CSP?

## Decision drivers

- Every rendered page must go through the same pipeline: relative refs
  resolved, external links retargeted, CSP injected.
- No new sandbox capability. A `postMessage` navigation bridge would need
  its own threat model (AGENTS.md security rule 3) and would mean injecting
  a script into a document that may run hostile scripts of its own.
- Payload size must stay bounded by the site, not by its link graph.

## Options

1. **Keep inlining sibling pages raw.** The status quo: strands them and
   skips the CSP. Rejected.
2. **Recursively process and inline siblings, depth-limited.** Correct at
   depth 1, but duplicates every shared asset per page and dies at depth 2,
   which reads as "the first click works and the second does not".
3. **Defuse in-frame page links; navigate from MBZoo's own chrome.**
   Chosen.

## Decision

We will treat a relative reference that resolves to an HTML document as a
**page**, not an asset:

- `rewriteRelativeRefs` replaces its `href` with `data-mbz-page="<ref>"`.
  The link keeps its text, loses its target, and a stylesheet we inject
  marks it as inert. Assets are inlined exactly as before.
- `renderWebsite` lists every HTML record of the resource as a button row
  above the preview (entry page first) and re-renders the frame through the
  full pipeline when one is chosen, with a note saying why in-page links do
  not navigate.

Standing rules:

- Never inline an HTML document as a `data:` URI. A document that has not
  been through `rewriteRelativeRefs` + `retargetExternalLinks` +
  `injectCsp` must not be reachable from the frame.
- In-frame navigation between pages stays out of scope until, and unless,
  a bridge earns its own ADR and threat model.

## Consequences

**Positive.** Every page of a site renders with its stylesheet, scripts and
images, and under the injected CSP. Payload is one page at a time instead
of the site's link graph. Pages that the entry page never links to become
reachable for the first time.

**Negative.** Clicking the site's own navigation does nothing; the reader
has to use MBZoo's page row. Deep links into a specific anchor of another
page (`page.html#section`) lose the anchor.

**Neutral.** Single-page HTML resources are unaffected — no page row is
rendered when a resource has one HTML file.

## Risks

- **A reader clicks the site's nav and thinks MBZoo is broken.** Mitigated
  by the injected inert-link styling plus the explanatory note above the
  frame; both are the reason the page row is placed above the preview
  rather than below it.

## Validation

`e2e/viewer.spec.ts` — "a multi-page site is navigated from MBZoo, not by
breaking out of the frame": asserts the in-frame link carries no `href`,
that the page row lists both pages, and that the second page renders with
its relative stylesheet applied. Verified additionally against the real
108-file eXeLearning resource from `SMR_SOR_01_09`, grafted into the
synthetic fixture locally and not committed.

## References

- ADR-0017 — inline `data:` assets in the opaque-origin sandbox.
- ADR-0009 — no automatic fetching of backup-referenced remote content.
- REPO-004 — real backup corpus; SMR_SOR carries the eXeLearning shape.

## Addendum: Investigation

The resource that exposed this (`activities/resource_57638`, contextid
100344) holds 108 non-directory files under
`/SMR_SOR01v3/SMR_SOR01ArchivosUnidad/Moodle/SOR01__SolucionTarea/`:

| Kind | Count |
| --- | --- |
| HTML pages | 8 (`index.html`, `actividad_1..5__solucin.html`, `mquina_1..2.html`) |
| Stylesheets | 4 (`base.css`, `content.css`, `nav.css`, `exe_lightbox.css`) |
| Scripts | `exe_jquery.js`, `common.js`, `common_i18n.js`, `exe_html5.js`, `_fpd_js.js` |
| Images | ~90 JPG/PNG/GIF |

Each page's `<head>` links the same three stylesheets by relative name, and
each page's `<nav id="siteNav">` links all eight pages. That is what makes
recursive inlining unusable: with N = 8 pages fully cross-linked, inlining
to depth d costs O(N^d) copies of the shared jQuery and stylesheets.

**Pre-mortem.** The failure mode of the chosen option is a reader who never
notices the page row and concludes the site is broken. That is why the row
sits above the frame, carries a count, and is followed by a sentence naming
the constraint. The rejected `postMessage` option fails worse: the script
we would inject runs in the same document as the course author's scripts,
so a hostile page could forge navigation requests — MBZoo would have to
validate every requested filename against the resource's own record list,
which buys back the same navigation the page row already provides, at the
cost of a scripted surface inside hostile content.
