# Dependency & license report (bootstrap)

MBZoo is GPL-3.0-or-later (ADR-0035). Every shipped dependency must be
compatible with that. Runtime dependencies of shipped packages:

| package | version | license | purpose | notes |
|---|---|---|---|---|
| @mbzoo/core | workspace | GPL-3.0-or-later | core parsing | first-party |
| fflate | 0.8.3 | MIT | ZIP read/write (core dep + fixtures) | permissive; no transitive deps |
| saxes | 6.0.0 | ISC | event XML parser | permissive; no transitive deps |
| dompurify | 3.4.14 | MPL-2.0 OR Apache-2.0 | HTML sanitization (viewer) | dual-licensed; taken under Apache-2.0, GPLv3-compatible |
| pdfjs-dist | 6.2.108 | Apache-2.0 | PDF canvas rendering (viewer) | no PDF iframe (Chrome blocks); ADR-0014 |
| h5p-standalone | 3.8.2 | **GPL-3.0** (npm declares MIT) | experimental H5P playback (viewer) | bundle carries GPL H5P core, confirmed upstream (TECH-014, ADR-0018/0035) |
| scorm-again | 3.3.0 | MIT | experimental SCORM playback (viewer) | ADR-0023 |

Dev/tooling (not shipped): vite 8.2.2 (MIT), typescript 5.9.3 (Apache-2.0),
biome 2.5.10 (MIT OR Apache-2.0), playwright 1.62.1 (Apache-2.0),
@zip.js/zip.js 2.8.59 (BSD-3-Clause, devDep for fixture experiments),
@types/bun (MIT).

Apache-2.0 is compatible with GPL **3**, not GPL 2 — MBZoo must stay
GPL-3.0-or-later, never GPL-2.0. No shipped dependency is AGPL, GPL-2.0-only or
proprietary; adding one requires its own ADR (ADR-0035 rule 1).

`h5p-standalone`'s bundle is the reason MBZoo is copyleft: its maintainers
confirmed the distributed package carries GPL-3.0 H5P code even though npm
metadata still says MIT (tunapanda/h5p-standalone#188, quoted in TECH-014). The
committed `bun.lock` pins the exact version conveyed, which is what identifies
its corresponding source — upstream states no `h5p/h5p-php-library` revision
matches its vendored tree.

## Moodle GPL boundary
Moodle source/docs were studied to understand the format (REPO-005). No PHP was
ported line-by-line; parsers were written from the XML shapes observed in CC BY
Saylor backups and documented schema facts. This boundary is binding (root AGENTS.md).

## Fixture policy
Committed fixtures must be synthetic and deterministic. Real-world backups
(e.g. REPO-004) are downloaded ad hoc for manual verification with provenance +
sha256 recorded in research/, never committed wholesale; REPO-004 has no LICENSE
file, only README prose asserting CC BY over Saylor-authored material, with
embedded third-party content under varied licenses.
