<p align="center">
  <img src="docs/media/mbzoo-logo.png" alt="MBZoo logo — See what's inside your MBZ." width="480" />
</p>

# MBZoo

[![CI](https://github.com/ateeducacion/mbzoo/actions/workflows/ci.yml/badge.svg)](https://github.com/ateeducacion/mbzoo/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ateeducacion/mbzoo/graph/badge.svg)](https://codecov.io/gh/ateeducacion/mbzoo)
[![Deploy viewer to GitHub Pages](https://github.com/ateeducacion/mbzoo/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ateeducacion/mbzoo/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*See what's inside your MBZ.*

MBZoo opens **Moodle course backups** (`.mbz` files) directly in your browser —
no Moodle installation required. Drop a backup and inspect its structure
locally: your file never leaves your device.

**Status: experimental.** The architecture works end-to-end, but feature
coverage is deliberately small. Everything below is labeled honestly.

## What works today (Implemented)

- Drag & drop a `.mbz` onto [the web viewer](https://ateeducacion.github.io/mbzoo/) —
  parsed locally in your browser via a Web Worker; nothing is uploaded. Also via
  `?url=…` (server must allow CORS).
- Archive format detection: both **ZIP** and **TAR.GZ** containers (real-world
  `.mbz` files are frequently tar.gz, not ZIP).
- Metadata parsing of `moodle_backup.xml`, `course/course.xml`,
  `sections/section_*/section.xml` and `files.xml`.
- Course title + section/activity tree in a two-column explorer.
- CLI inspection from the terminal (`bun run cli -- <file.mbz>`).

## Activity & content support

| Moodle module | Inspect | Render / preview | Notes |
|---|---|---|---|
| Page | ✅ | ✅ sanitized HTML | ADR-0012/0013 |
| Label | ✅ | ✅ sanitized HTML | |
| URL | ✅ | ✅ external link | never fetched automatically |
| Resource / File | ✅ | ✅ inline preview | PDF via pdf.js canvas, images, text, sandboxed HTML (ADR-0014) |
| Folder | ✅ | ✅ file cards | |
| HTML page w/ CSS+JS | ✅ | ✅ sandboxed iframe | opaque origin + CSP; scripts isolated from the app (ADR-0014) |
| Book | ✅ metadata | 🔜 planned | chapters renderable from activity XML |
| Forum | ✅ metadata | 🔜 planned (read-only) | discussions only exist if backup included user data |
| Glossary | ✅ metadata | 🔜 planned (read-only) | |
| Assignment | ✅ metadata | 🔜 planned | submissions only present with user data |
| Quiz | ✅ metadata + question bank | 🔜 inspection-first | faithful execution requires Moodle's Question Engine — not a goal; practice mode is a separate idea (prompt §6) |
| SCORM | ✅ metadata + package file | ⏳ research | launch needs a runtime (scorm-again candidate, Q-012) in the sandbox |
| H5P | ✅ metadata + package file | ⏳ research | h5p-standalone candidate (Q-013) |
| eXeLearning .elp/.elpx | ✅ as files | ⏳ research | format study tracked in Q-016 |
| Unknown third-party plugins | ✅ | ✅ metadata fallback | never break the course view |

Legend: ✅ implemented · 🔜 planned next · ⏳ research (Q-012/Q-013/Q-016).

## Experimental

- Parser coverage is verified against synthetic fixtures plus a small set of
  real-world backups (Moodle 3.3/38-era). Course-format edge cases (e.g.
  flexsections nesting) may render incompletely — warnings are surfaced rather
  than hidden.

## Planned (not implemented)

Do not expect these yet:

- Dedicated renderers for Book, Forum, Glossary, Assignment and other modules
- SCORM / H5P launching in sandboxed frames
- Quiz preview or practice mode
- Static HTML export / re-packaging
- Multi-gigabyte backup support (streaming/lazy access)

## Privacy

Local-first by construction: the deployed viewer is static files with no
backend; parsing happens on your device. See `docs/PRIVACY.md`.

## Development

Bun 1.4.0 is pinned through the root `packageManager` field so local and CI
execution use the same runtime family.

```bash
bun install
bun run dev:viewer      # open http://localhost:5173
bun run check           # lint + typecheck + tests + build + research validation
```

More: `DEVELOPMENT.md`, `docs/ARCHITECTURE.md`,
`CONTRIBUTING.md`. Research and decision records live under `research/`.

## License

MIT — see `LICENSE`. Moodle compatibility was achieved by studying documented
format facts, not by porting GPL code.
