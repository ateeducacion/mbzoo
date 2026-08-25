# Dependency & license report (bootstrap)

MBZoo is MIT. Runtime dependencies of shipped packages:

| package | version | license | purpose | notes |
|---|---|---|---|---|
| @mbzoo/core | workspace | MIT | core parsing | first-party |
| fflate | 0.8.3 | MIT | ZIP read/write (core dep + fixtures) | permissive; no transitive deps |
| saxes | 6.0.0 | ISC | event XML parser | permissive; no transitive deps |
| dompurify | 3.4.14 | MPL-2.0 OR Apache-2.0 | HTML sanitization (viewer) | dual-licensed; MIT-compatible |
| pdfjs-dist | 6.2.108 | Apache-2.0 | PDF canvas rendering (viewer) | no PDF iframe (Chrome blocks); ADR-0014 |

Dev/tooling (not shipped): vite 8.2.2 (MIT), typescript 5.9.3 (Apache-2.0),
biome 2.5.10 (MIT OR Apache-2.0), playwright 1.62.1 (Apache-2.0),
@zip.js/zip.js 2.8.59 (BSD-3-Clause, devDep for fixture experiments),
@types/bun (MIT).

Future candidates researched but NOT installed: scorm-again (MIT), h5p-standalone
(MIT), DOMPurify (MPL-2.0 OR Apache-2.0) — each needs its own ADR when used
(§25, §44).

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
