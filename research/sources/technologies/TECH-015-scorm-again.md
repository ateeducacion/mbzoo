---
id: TECH-015
title: scorm-again
kind: technology
url: https://github.com/jcputney/scorm-again
version: 3.3.0 (installed, viewer only)
accessed: 2026-08-25
license: MIT
---
A SCORM 1.2 / SCORM 2004 run-time API for the browser. MBZoo uses it as the
LMS side of the RTE so a stored package can be opened offline: it supplies
the data model, error codes and CMI validation that a SCO expects to find on
`window.API` (SCORM 1.2) or `window.API_1484_11` (2004).

Distribution: MIT, Copyright (c) 2020 Jonathan Putney (LICENSE:1-3), zero
runtime dependencies. Published 2026-08-12; ~94k weekly npm downloads
(registry API, accessed 2026-08-25).

Two builds ship per standard. The **classic** bundles are what MBZoo loads —
`dist/scorm12.min.js` (152,739 B) and `dist/scorm2004.min.js` (542,521 B) —
because each is an IIFE that self-assigns `this.Scorm12API` /
`this.Scorm2004API`, and a classic script is evaluated during parsing, so the
API exists before a package's own scripts look for it. The ESM builds
(`dist/esm/*`) export a binding and define no global; as `type="module"` they
would be deferred until after the SCO had already failed to find the API.
`dist/` is not an exported subpath and the `import` condition of
`./scorm12` resolves to the ESM file, so the classic build is reached through
a Vite alias resolved from the package's own install location
(`apps/viewer/vite.config.ts`). Only the flavor a package declares is
fetched, so a SCORM 1.2 course never pays for the 2004 bundle.

Network behaviour (the reason this is usable under ADR-0009): `lmsCommitUrl`
defaults to `false`, and every commit path is gated on
`typeof this.settings.lmsCommitUrl === "string"` (dist/scorm12.js:10704,
dist/scorm2004.js:35454) upstream of the only `processHttpRequest` call site
in each bundle — with default settings there is no reachable `fetch`,
`XMLHttpRequest` or `sendBeacon`. The second gate is `enableOfflineSupport`
(default `false`), which alone constructs the component that registers
`window` listeners, touches `localStorage` and holds the other `fetch`.
MBZoo sets both explicitly anyway so the intent survives an upgrade, and the
injected CSP's `connect-src 'none'` is the backstop.

`CrossFrameAPI` / `CrossFrameLMS` are not used: they exist to bridge a SCO in
a separate browsing context via `postMessage`, and against an opaque-origin
child they would force the wildcard `'*'` target origin the library's own
documentation warns about. MBZoo composes the SCO and the runtime into one
document instead, so no bridge is needed (ADR-0023).

Type declarations ship (152 `.d.ts` files). MBZoo does not import them: the
bundle is inlined as text, the way `h5p-player.ts` treats h5p-standalone.
