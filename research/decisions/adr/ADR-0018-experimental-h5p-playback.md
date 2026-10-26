---
id: ADR-0018
title: Experimental H5P playback — h5p-standalone inside the opaque-origin sandbox
status: Accepted
date: 2026-08-25
sources: [TECH-014]
experiments: []
related: [ADR-0009, ADR-0012, ADR-0014, ADR-0017]
supersedes: []
ai_tool: opencode
ai_model: ox-alpha
---

# ADR-0018: Experimental H5P playback — h5p-standalone inside the opaque-origin sandbox

## Context

`.h5p` files stored in backups are ZIP packages containing `h5p.json`, the
content and the content-type libraries. Until now MBZoo showed them as
download-only cards (ADR-0014). Playback means running backup-provided
JavaScript, which ADR-0009 forbids in the application origin; the sandbox
skill additionally requires an evidence-backed record before any H5P/SCORM
launcher exists.

MBZoo is fully client-side: no backend, no telemetry, no fetching of
backup-referenced remote content (ADR-0009). Any player must therefore work
offline against bytes already read from the archive through the worker.

## Problem

How can `.h5p` content be displayed without executing its scripts with
app-origin privileges, without adding a server component, and without
claiming more compatibility than is verified?

## Decision drivers

- Backup JavaScript must never run in the MBZoo origin (ADR-0009, ADR-0014).
- No server runtime: `@lumieducation/h5p-webcomponents` and the H5P Node.js
  library target server-backed integrations (TECH-014 context); a pure
  client-side engine is required.
- New dependency needs evidence for purpose, license, maintenance and bundle
  impact.
- The feature must be honest about maturity: only self-contained content
  types verified against a synthetic fixture.

## Options considered

### Option A: h5p-standalone in a virtual-filesystem sandbox — chosen

Bundle `h5p-standalone` (TECH-014) as a lazy-loaded viewer asset. When a
preview opens, unzip the `.h5p` package in memory, generate a player page
that installs a `fetch`/DOM shim serving every path from that in-memory map,
and load it into the same opaque-origin `sandbox="allow-scripts"` iframe +
injected CSP used by HTML previews (ADR-0014).

### Option B: @lumieducation H5P Node.js library / web components

Full-featured server-side integration. Requires a Node backend or a REST
server to serve libraries and content — incompatible with the zero-backend,
zero-telemetry model (ADR-0009) — and the library distribution is GPL-3.0.

### Option C: Keep download-only

No playback. Safest, but leaves common interactive content opaque even when
it is plain text/HTML content types.

## Decision

We will ship **experimental H5P playback** using h5p-standalone (TECH-014)
inside the existing sandbox model.

Standing rules:

1. The player page runs in an iframe with `sandbox="allow-scripts"` only —
   no new tokens (`allow-same-origin`, popups, forms, downloads) are added
   for H5P (ADR-0014).
2. The injected CSP stays default-deny: script/style/media sources limited
   to `blob:`/`data:`/`'unsafe-inline'`; `connect-src 'none'`,
   `frame-src 'none'`, `form-action 'none'`. All package files reach the
   frame through blob URLs of in-memory bytes; nothing is fetched from any
   network origin, including the app's own.
3. Player assets (frame bundle, CSS, fonts) are lazy-loaded only when an
   `.h5p` preview opens, fetched once in the application origin and passed
   into the frame as blob URLs.
4. Unsupported or malformed packages fall back to the download card with a
   note; no error may take down the detail pane.
5. The UI labels H5P playback experimental until cross-browser verification
   exists; compatibility claims beyond the synthetic fixture are forbidden.
6. SCORM launchers remain out of scope of this decision.

## Consequences

### Positive

- Interactive content in backups becomes inspectable, not just downloadable.
- Reuses the ADR-0014 isolation unchanged: same iframe policy, same CSP
  shape, no postMessage bridge, no shared state with the frame.
- Bundle cost (~170 KB JS + fonts/CSS, TECH-014) is paid only when H5P
  content is opened.

### Negative

- Vendored H5P core inside h5p-standalone traces back to a GPL-3.0
  repository distribution while the npm package declares MIT (TECH-014);
  this must be resolved before H5P playback leaves experimental status.
- Content types depending on dynamic loading patterns beyond the shim may
  fail at runtime; each failure class needs a fixture before it can be
  claimed supported.
- Memory: the whole package is unzipped into memory, bounded by the existing
  whole-archive-in-memory limitation (RISK-001).

### Neutral

- Implementation lives in the viewer (`apps/viewer/src/lib/h5p-player.ts`);
  `@mbzoo/core` gains nothing (ADR-0011).

## Risks

- **Sandbox escape via a hostile package.** Mitigation: opaque origin +
  default-deny CSP; regression tests assert blocked parent-DOM access and
  blocked network for a malicious fixture (same harness as ADR-0014).
- **License contamination.** Mitigation: TECH-014 records the conflict;
  feature stays experimental; re-review before any release build ships it
  as non-experimental [PENDING: verification required].
- **Overclaiming compatibility.** Mitigation: rule 5; README distinguishes
  Implemented/Experimental/Planned.

## Validation

- Unit tests for the virtual-path resolution and MIME mapping helpers.
- E2E: the synthetic demo course contains a `mod_h5pactivity` whose package
  renders text inside `.h5p-frame`; assertions cover sandbox attribute,
  rendered content and absence of network probes.
- CI: `bun run check` plus the chromium Playwright job.

## References

- TECH-014 — h5p-standalone: API shape, bundle size, maintenance, license caveat.
- ADR-0009 — security model: no upload, no remote fetch, no app-origin execution.
- ADR-0012 — single sanitization path for backup HTML.
- ADR-0014 — static previews: opaque-origin iframe + injected CSP pattern reused here.

---

## Addendum: Investigation

### How h5p-standalone loads a package (verified in dist code, v3.8.2)

`main.bundle.js` resolves paths via options `h5pJsonPath`, `librariesPath`,
`contentJsonPath`, then `fetch(url).json()` for `h5p.json`, `content.json`
and every dependency's `library.json`. Library assets are appended as
`<script src>`/`<link href>` elements with those relative paths. In `div`
embed mode everything lives in one document, so two interception points
(`window.fetch` + element creation) suffice to redirect all loads into the
virtual filesystem. In `iframe` mode the core runs inside a nested frame;
`div` mode was therefore chosen to keep one shim surface.

### Comparative matrix

| Criterion | A: h5p-standalone sandbox | B: Lumi Node.js stack | C: download-only |
|---|---|---|---|
| Runtime | Browser-only, lazy chunk | Node server + client | — |
| Dependencies | One MIT-declared package (TECH-014) | Server framework family | None |
| Security surface | Same iframe+CSP as ADR-0014 | New server + APIs | None |
| License risk | Vendored core GPL question [PENDING] | GPL-3.0 | None |
| Honest now | Yes, as experimental | No (needs backend) | Yes |

### Adversarial review

- *Can the package reach the network?* `connect-src 'none'`; the fetch shim
  answers only from in-memory entries; subresources resolve to blob URLs.
  The e2e probe asserts no request leaves the page.
- *Can it touch the app?* Opaque origin (`allow-scripts` only): parent DOM,
  storage and cookies are inaccessible; no postMessage bridge exists.
- *What if the package is malformed?* Unzip/parse failures degrade to the
  existing download card; the renderer catches and annotates.
- *Dependency lock-in?* Player is isolated behind `h5p-player.ts`; swapping
  engines would not touch renderers.
