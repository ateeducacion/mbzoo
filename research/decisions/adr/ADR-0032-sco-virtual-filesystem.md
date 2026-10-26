---
id: ADR-0032
title: A SCO travels with its package as a virtual filesystem, XHR included
status: Accepted
date: 2026-08-25
sources: [TECH-015, REPO-004]
experiments: []
related: [ADR-0014, ADR-0017, ADR-0018, ADR-0023]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0032: A SCO travels with its package as a virtual filesystem, XHR included

## Context

ADR-0023 composes each SCO with the scorm-again runtime into one document.
Static `src`/`href` references are inlined by `rewriteRelativeRefs`
(ADR-0017). That was verified against a synthetic SCO whose page is
self-contained.

The corpus's one real SCORM package (PRSM107, AN-008) is an Adobe Captivate
HTML5 export. Its launch page has no static `<script src>` at all: it
creates a script element at run time and sets `src = 'assets/js/CPXHRLoader.js'`,
and that loader fetches the 1.5 MB runtime and the slides by
`XMLHttpRequest`. Inside a `blob:` document a relative path resolves to
nothing, and `connect-src 'none'` refuses the XHR. Verified in the browser
sweep: the frame rendered three elements and no content, with no error
anywhere — the runtime simply never arrived.

## Problem

How can a SCO that fetches its own code at run time get it, when the
document is an opaque origin with no network and no base to resolve
against?

## Decision drivers

- No network, no new CSP source, no new sandbox token (ADR-0009, ADR-0014).
- The H5P player already solves the `src`-setter half (ADR-0018): a shim
  that answers `fetch` and rewrites subresource setters from an in-page
  virtual filesystem.
- Old runtimes use XHR, synchronous XHR included.

## Decision

The SCO's document carries its package: every `content`-area record of the
activity, as base64 in a `<script type="application/json">`, plus the
ADR-0018 shim, injected **before** the runtime and the boot script. The
shim gains `XMLHttpRequest` interception: a request whose URL resolves to a
package path is answered from the VFS — synchronously or asynchronously as
the caller asked, with `responseType` honoured — and any other request goes
to the real XHR, where the injected CSP refuses it as before.

A SCO document is injected with `SCORM_CSP`: `SANDBOX_CSP` plus
`'unsafe-eval'` in `script-src`, and nothing else. Captivate's loader
executes the code it fetched by XHR with `eval`; without it the runtime
arrives and never runs (`Evaluating a string as JavaScript violates the
following Content Security Policy directive`, observed on PRSM107 once the
VFS was in place).

Standing rules:

0. `'unsafe-eval'` is granted to SCO documents only, never to `SANDBOX_CSP`
   or `H5P_CSP`. It adds no reach: the frame already executes arbitrary
   inline script from the same package, on an opaque origin with no
   network, no storage and no parent access, so code that arrives as a
   string has exactly the privileges of code that arrived as a `<script>`.
   What it removes is one defence against string-to-code conversion, which
   in this frame defends nothing — the strings and the scripts come from the
   same package. A test locks that the two policies differ by that single
   source.
1. The shim serves package paths only. It never widens what leaves the
   frame; a URL outside the package behaves exactly as today.
2. The VFS is bounded (`MAX_SCO_VFS_BYTES`); records that do not fit are
   left out rather than truncating the whole package.
3. Head order is VFS, shim, runtime, boot, then the SCO's own markup. The
   shim must exist before any package script runs.
4. The same shim serves H5P; a change to it is a change to both players.

## Consequences

**Positive.** Runtimes that load themselves — Captivate, and by the same
mechanism Articulate-style exports — can run under the unchanged sandbox.

**Negative.** The document grows by the package's base64 size. PRSM107 is
about 2 MB; rule 2 bounds the worst case.

**Neutral.** A SCO with only static references is unaffected in behaviour;
it merely carries a VFS it never consults.

## Known limit: Cordova-wrapped exports

The corpus's one SCORM package (PRSM107) does not run under this decision,
and the reason is the package, not the sandbox. Its launch page is
`<body onload="onBodyLoad()">`, and `onBodyLoad` waits for `window.device`
(undefined in every browser) and then for the Cordova `deviceready` event,
which only an app container fires. With no timer fallback, initialization
never starts — the same in a plain browser tab or Moodle's own SCORM iframe.
The VFS, `window.API` and eval are all in place and verified (no CSP error,
no network, API present); the export simply never asks to start. A boot
script that dispatched a synthetic `deviceready` might drive it, but would
assume the rest of the Cordova surface a real container provides, so it is
left as a candidate (TASK-014) rather than done for a single specimen.

## Risks

- **A runtime that probes the network deliberately** (e.g. a "connectivity
  check") gets a refused request, as before; the shim does not fake success
  for anything outside the package.

## Validation

- `apps/viewer/test/preview-utils.test.ts` — `SCORM_CSP` differs from
  `SANDBOX_CSP` by `'unsafe-eval'` in `script-src` and by nothing else;
  `connect-src` and `frame-src` stay `'none'`.
- `e2e/viewer.spec.ts` — the fixture's second SCO creates a script element
  at run time and XHRs a JSON file, both package-relative; both are answered
  and nothing reaches the network.
- Real corpus: PRSM107, before and after, in the addendum (TASK-010).

## References

- ADR-0018 — the shim this extends; ADR-0023 — the single-document SCO.
- TECH-015 — scorm-again.
