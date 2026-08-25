<p align="center">
  <img src="docs/media/mbzoo-logo.png" alt="MBZoo logo — See what's inside your MBZ." width="420" />
</p>

# MBZoo

[![CI](https://github.com/ateeducacion/mbzoo/actions/workflows/ci.yml/badge.svg)](https://github.com/ateeducacion/mbzoo/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ateeducacion/mbzoo/graph/badge.svg)](https://codecov.io/gh/ateeducacion/mbzoo)
[![Docs](https://img.shields.io/badge/docs-ateeducacion.github.io%2Fmbzoo%2Fdocs-blue)](https://ateeducacion.github.io/mbzoo/docs/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*See what's inside your MBZ.*

MBZoo opens **Moodle course backups** (`.mbz`) directly in your browser — no
Moodle installation, no upload. Drop a backup and inspect its structure,
content and files locally.

**Status: bootstrap / experimental.** Works today: ZIP + TAR.GZ detection,
metadata parsing, course tree, and content previews for pages, labels, URLs,
resources (PDF via pdf.js, images, text, sandboxed HTML websites), quizzes
(read-only question navigation), glossaries, books, assignment summaries and
unknown-plugin fallbacks. Experimental H5P playback runs inside the same
opaque-origin sandbox (ADR-0018). Each activity can also be exported on its own —
its module XML, its rendered content as a standalone HTML file, or its
attached files as a ZIP. Whole-backup re-packaging and everything else is
planned — see the
[activity support guide](https://ateeducacion.github.io/mbzoo/docs/guide/activity-support.html).

## Try it

- **Viewer**: https://ateeducacion.github.io/mbzoo/ (example backups included)
- **Documentation**: https://ateeducacion.github.io/mbzoo/docs/
- **For AI agents**: [llms.txt](https://ateeducacion.github.io/mbzoo/llms.txt) · [full markdown](https://ateeducacion.github.io/mbzoo/llms-full.txt)
- **CLI**: `bun run cli -- <file.mbz>`

## Privacy

Local-first by construction: the viewer is a static site with no backend;
parsing happens on your device. See `docs/PRIVACY.md`.

## Development

```bash
bun install
bun run dev:viewer      # viewer at http://localhost:5173
bun run docs:dev        # documentation site
bun run check           # lint + typecheck + tests + coverage + build + research validation
```

More: the [documentation site](https://ateeducacion.github.io/mbzoo/docs/),
`DEVELOPMENT.md`, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`. Decision records
and the evidence system live under `research/`.

## License

MIT — see `LICENSE`. Moodle compatibility was achieved by studying documented
format facts, not by porting GPL code.
