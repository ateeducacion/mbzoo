# Design: in-frame navigation for multi-page sites

Date: 2026-08-25
Status: approved, ready for planning
Scope: sub-project 1 of 5 (see Roadmap)

## Problem

A reader opens "Solución a la tarea. SOR01." — a 108-file eXeLearning
export in `SMR_SOR_01_09.mbz` — and clicks the site's own navigation, or
the "Siguiente" link at the foot of the page. Nothing happens.

That is ADR-0020 working as designed. `rewriteRelativeRefs`
(`apps/viewer/src/renderers.ts:745`) replaces the `href` of any relative
reference resolving to an HTML record with `data-mbz-page="<ref>"`, and
`renderWebsite` offers a row of page buttons instead. The links keep their
text, lose their target, and a stylesheet marks them `cursor:not-allowed`.

ADR-0020 chose this because the alternative it considered — inlining the
sibling page as a `data:` document — strands that page (its own relative
`<link rel="stylesheet">` cannot resolve against a `data:` base) and skips
the injected CSP, so the page could reach the network in violation of
ADR-0009. Recursive inlining was rejected as O(pages^depth).

Neither problem is caused by the *link*. Both are caused by rendering the
target outside the pipeline. This design keeps the pipeline and restores
the link.

## Decision

A page link inside the sandbox asks MBZoo to navigate; MBZoo decides
whether to.

1. `rewriteRelativeRefs` keeps defusing the `href` into `data-mbz-page`.
   Nothing about the document's own resolution changes.
2. When — and only when — a preview is being rendered as part of a
   multi-page site, a small script is injected into the sandboxed
   document. It listens for clicks in the capture phase, and for a click
   inside `[data-mbz-page]` it calls
   `parent.postMessage({ source: 'mbzoo', type: 'navigate', page }, '*')`.
3. The viewer holds a `message` listener for the lifetime of that render.
   It accepts a message only when every one of these holds:
   - `event.source` is identical to the live preview iframe's
     `contentWindow`;
   - `event.data` is an object whose `source` is `'mbzoo'` and whose
     `type` is `'navigate'`;
   - `page` is a string that, resolved relative to the directory of the
     page currently displayed, matches the full path of one of **this
     resource's own HTML records**.
   Anything else is ignored silently.
4. The matched record is rendered through the unchanged pipeline:
   `rewriteRelativeRefs` -> `retargetExternalLinks` -> `injectCsp`. It is
   the same code path the page row already uses.

### Why the injected script is not the security boundary

ADR-0020 rejected a bridge on the grounds that "the script we would inject
runs in the same document as the course author's scripts, so a hostile page
could forge navigation requests".

A hostile page can forge those requests whether or not we inject anything:
any script in the frame can already call `parent.postMessage`. The injected
script therefore grants an attacker nothing. It is a convenience for honest
documents, and the security of the feature rests entirely on step 3 —
parent-side validation against an allowlist the backup cannot influence.

ADR-0020's own counter-argument concedes this: it observes that MBZoo
"would have to validate every requested filename against the resource's own
record list". That is exactly what step 3 does, and it is cheap.

### Threat model

- **Forged navigation.** A hostile package switches the preview to a
  different page *of the same resource*. That is precisely what the reader
  can already do by clicking a button in the page row. No escalation.
- **`event.origin` is `"null"`.** The frame is an opaque origin, so origin
  carries no authority and is never used for authorization. Window identity
  (`event.source`) is, and it is not forgeable by the frame's content.
- **Injection through `page`.** The value is used only as a lookup key
  against the resource's records. It is never interpolated into HTML, never
  used to build a URL, and a miss is ignored rather than rendered.
- **Escape of the resource.** Resolution is confined to records already
  filtered by component and context for this activity, so a `../../`
  payload cannot address another activity's files.
- **New capability.** None. No sandbox token is added (`allow-scripts`,
  `allow-popups`, `allow-popups-to-escape-sandbox` as today, never
  `allow-same-origin`), the CSP is unchanged, `connect-src` stays `'none'`.

## Changes

### `apps/viewer/src/lib/preview-utils.ts`

- `resolveRelative` currently keeps `#fragment` and `?query` in the path it
  returns, so `page.html#section` never matches a record and the link is
  left with a broken relative `href`. Split the reference before resolving.
- New pure `parseNavigationRequest(data: unknown): string | undefined` —
  the message-shape validator, so the hostile-input cases are unit-testable
  without a browser.
- New `PAGE_NAV_SCRIPT` constant holding the injected listener.
- `DEFUSED_LINK_STYLE` stops marking page links inert; they are live again.

### `apps/viewer/src/renderers.ts`

- `filePreview(rec, opts?)` gains `{ pageNav?: boolean; hash?: string }`,
  threaded to `renderSandboxedHtml`. The script is injected only when
  `pageNav` is set, so single-file HTML previews keep exactly today's
  bytes.
- `renderSandboxedHtml` appends `#hash` to the blob URL when asked, which
  restores the anchor ADR-0020 listed as a known loss — the browser applies
  the fragment on load without anyone touching the frame's DOM.
- `renderWebsite` registers the `message` listener and routes accepted
  requests through the existing `show()`.
- `dispose()` removes the listener, so switching activities cannot leave a
  stale frame able to drive a new render.

### `apps/viewer/src/lib/i18n.ts`

`site.pagesHint` currently tells the reader the links do not work. Replace
it in both languages with text describing the row as a table of contents,
including pages the entry page never links to.

## Testing

- Unit (`preview-utils.test.ts`): `parseNavigationRequest` rejects
  non-objects, wrong `source`, wrong `type`, non-string `page`, and
  prototype-pollution shapes; `resolveRelative` strips fragment and query.
- E2E (`e2e/viewer.spec.ts`), replacing the ADR-0020 assertion that the
  link is inert:
  - clicking `#to-page2` inside the frame renders page two **with its
    relative stylesheet applied** (the property that inlining lost);
  - a link carrying `#section` lands on the fragment;
  - a message posted from the page naming a file outside the resource
    leaves the preview untouched;
  - the sandbox attribute is unchanged — still no `allow-same-origin`.

## Consequences

The reader clicks the site's own navigation and it works. Every page still
renders through one pipeline and under the injected CSP; payload stays one
page at a time. The page row remains, now as a table of contents rather
than the only way to move.

ADR-0021 supersedes ADR-0020. Its standing rule — "never inline an HTML
document as a `data:` URI; a document that has not been through
`rewriteRelativeRefs` + `retargetExternalLinks` + `injectCsp` must not be
reachable from the frame" — is carried forward unchanged, because this
design does not weaken it.

## Roadmap (sub-projects 2-5, second PR)

Recorded so the research done for them is not lost.

**SCORM (`mod_scorm`).** Runtime: `scorm-again@3.3.0` — MIT (Jonathan
Putney), published 2026-08-12, ~94k weekly downloads, zero runtime
dependencies, `dist/scorm12.min.js` 149 KB and `dist/scorm2004.min.js`
530 KB shipped separately, so only the flavor the manifest declares is
lazy-loaded. Needs a TECH record before it enters.

Shape is forced by two facts: `SANDBOX_CSP` sets `frame-src 'none'`, and a
blob URL minted inside an opaque origin is cross-origin to its own parent,
so a SCO in a nested iframe could not reach `window.parent.API`. Therefore
each SCO is composed as a single document — SCO HTML plus the runtime
injected as a blob plus resolved refs plus CSP — with `window.API` /
`window.API_1484_11` defined in that same document, which is where the ADL
`findAPI(window)` wrapper looks first. The `imsmanifest.xml` TOC lives in
MBZoo's chrome and reuses this sub-project's bridge. `lmsCommitUrl` empty,
`autocommit: false`, with `connect-src 'none'` as the backstop.

**EPUB.** `epubjs` was requested but is a poor fit: last published
2023-09-26, 6.4 MB unpacked, and it drags `jszip`, `lodash`, `core-js`,
`@xmldom/xmldom` and `localforage` — the last persists to IndexedDB, which
fights ADR-0009. `foliate-js@1.0.1` is MIT with one small dependency and is
the recommended substitute. Either way a spike must first verify the
reader renders inside the opaque-origin sandbox: both render into nested
iframes, which `frame-src 'none'` blocks unless the view uses `srcdoc`
(a `srcdoc` child inherits the parent's opaque origin and is therefore
same-origin with it). Verify before committing to the dependency.

**eXeLearning family.** `.elpx` is not a source project: `exeviewer`
(`js/app.js:692-725`) treats it as a published site in one of two layouts —
type 1 legacy (`index.html`, `base.css`, `nav.css`, `common.js`,
`exe_jquery.js` at root, the SMR_SOR shape) and type 2 modern
(`index.html`, `content/css/base.css`, `libs/exe_export.js`,
`libs/common.js`). So `.elpx` reuses the site renderer plus a detection
badge; `.elp`, the real legacy source package, gets an "eXeLearning legacy"
treatment. `mod_exeweb` and `mod_exescorm` XML shapes are to be read from
the plugins' own `backup/moodle2/*_stepslib.php`.

Licensing constraint: `exeviewer` is AGPL-3.0-or-later and the Moodle
plugins are GPL, while MBZoo is MIT. Study format facts only; no
line-by-line porting, the REPO-005 rule.

**Embedded PDF.** `sanitizeHtml` uses DOMPurify's `html` profile
(`renderers.ts:1592`), which drops `<object>`, `<embed>` and `<iframe>`
entirely — a PDF embedded in a Page vanishes without trace. Detect the
reference *before* sanitizing and substitute a real pdf.js card. The
DOMPurify profile is not widened; ADR-0012 keeps its single path.

**Fixture.** `demo-course-zip.mbz` grows a `mod_scorm` activity, an
`.epub`, an `.elpx` and a Page with an embedded PDF, all synthetic and
deterministic, with `fixtures/manifest.yaml` checksums regenerated.
