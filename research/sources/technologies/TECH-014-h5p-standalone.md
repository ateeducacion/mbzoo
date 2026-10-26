---
id: TECH-014
title: h5p-standalone
kind: technology
url: https://github.com/tunapanda/h5p-standalone
version: 3.8.2 (installed, viewer only)
accessed: 2026-08-26
license: MIT declared in npm metadata; GPL-3.0 in practice (see below)
---
Client-side H5P player: displays extracted `.h5p` packages without an H5P
server. `dist/main.bundle.js` (~23 KB) fetches `h5p.json`, `content.json` and
each dependency's `library.json` via `fetch()`, then injects library
scripts/styles into the document; `dist/frame.bundle.js` (~144 KB) is the
bundled H5P core framework. Embed modes are `div` and `iframe`. Fonts and
styles add ~1.2 MB on disk, loaded lazily only when an H5P preview opens.

Maintenance (Snyk advisor + GitHub, accessed 2026-08-25): v3.8.2 published
2026-03-24, no known vulnerabilities, maintenance rated sustainable,
~9k weekly npm downloads.

Licensing: the npm package declares MIT, but it vendors the H5P core client
scripts from `h5p/h5p-php-library`, whose repository distribution is GPL-3.0
("GPL licensed due to GPL code being used for purifying HTML", per its README).
Asked upstream on 2026-08-25 (tunapanda/h5p-standalone#188), a project
collaborator answered on 2026-08-26:

> The `npm` package should be distributed under the GPL-3.0 license because
> `main.bundle.js` includes GPL-licensed H5P code.
>
> Also, there is currently no specific upstream version from
> `h5p/h5p-php-library` that corresponds to `vendor/h5p/`.

So the distributed bundle is GPL-3.0 regardless of the declared metadata, and
the vendored core has no identifiable upstream revision. The npm `license` field
still says MIT; a metadata/LICENSE update was requested in the same thread and
had not landed when this record was last accessed.

Consequence for MBZoo: the viewer inlines `dist/frame.bundle.js` into its build
(`apps/viewer/src/renderers.ts`), so MBZoo conveys GPL-3.0 code. MBZoo is
relicensed to GPL-3.0-or-later (ADR-0035); RISK-004 is resolved for MBZoo's own
licence and downgraded to the upstream metadata mismatch.
https://github.com/tunapanda/h5p-standalone/issues/188
