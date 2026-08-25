---
id: TECH-014
title: h5p-standalone
kind: technology
url: https://github.com/tunapanda/h5p-standalone
version: 3.8.2 (installed, viewer only)
accessed: 2026-08-25
license: MIT
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

Licensing caveat: the npm package declares MIT, but it vendors the H5P core
client scripts from `h5p/h5p-php-library`, whose repository distribution is
GPL-3.0 ("GPL licensed due to GPL code being used for purifying HTML",
per its README); h5p.org/licensing states MIT is used "wherever possible"
and that making the GPL code optional was intended but no relicensing of
this repository has been verified [PENDING: verification required]. Recorded
as a risk in ADR-0018; blocks promoting H5P playback beyond experimental.
