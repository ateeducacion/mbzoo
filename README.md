# MBZoo

[![CI](https://github.com/ateeducacion/mbzoo/actions/workflows/ci.yml/badge.svg)](https://github.com/ateeducacion/mbzoo/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ateeducacion/mbzoo/graph/badge.svg)](https://codecov.io/gh/ateeducacion/mbzoo)
[![Deploy viewer to GitHub Pages](https://github.com/ateeducacion/mbzoo/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ateeducacion/mbzoo/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*See what's inside your MBZ.*

MBZoo opens **Moodle course backups** (`.mbz` files) directly in your browser —
no Moodle installation required. Drop a backup and inspect its structure
locally: your file never leaves your device.

**Status: bootstrap / experimental.** The architecture works end-to-end, but
feature coverage is deliberately small. Everything below is labeled honestly.

## What works today (Implemented)

- Drag & drop a `.mbz` onto [the web viewer](#deployment) — parsed locally in
  your browser via a Web Worker; nothing is uploaded.
- Archive format detection: both **ZIP** and **TAR.GZ** containers (real-world
  `.mbz` files are frequently tar.gz, not ZIP).
- Metadata parsing of `moodle_backup.xml`, `course/course.xml`,
  `sections/section_*/section.xml` and `files.xml`.
- Course title + section/activity tree display, including unknown third-party
  plugins (exposed safely instead of breaking the course).
- CLI inspection from the terminal (`bun run cli -- <file.mbz>`).

## Experimental

- Parser coverage is verified against synthetic fixtures plus a small set of
  real-world backups (Moodle 3.3/38-era). Course-format edge cases (e.g.
  flexsections nesting) may render incompletely — warnings are surfaced rather
  than hidden.

## Planned (not implemented)

Do not expect these yet:

- Activity content rendering (Page, Book, Folder…)
- SCORM / H5P launching in sandboxed frames
- Quiz preview or practice mode
- Static HTML export / re-packaging
- Multi-gigabyte backup support (streaming/lazy access)

## Privacy

Local-first by construction: the deployed viewer is static files with no
backend; parsing happens on your device. See `docs/PRIVACY.md`.

## Development

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
