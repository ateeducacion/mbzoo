# AGENTS.md — MBZoo

**MBZoo** opens, inspects and previews Moodle `.mbz` backups directly in the
browser. *See what's inside your MBZ.* License: GPL-3.0-or-later (ADR-0035).
Per-activity export (module XML, rendered content HTML, files ZIP) ships
(ADR-0016); whole-backup re-packaging is planned, not implemented.

## Current maturity

Experimental but working end-to-end (2026-08-25): drag/drop `.mbz` → archive
detection (ZIP + TAR.GZ) → parsing in a Web Worker → normalized course model →
course/section/activity explorer.

Implemented content support includes sanitized Page/Label HTML, URL activities,
Resource/File/Folder previews (main file by Moodle's marker, ADR-0028),
PDF/image/text/video previews, sandboxed HTML and multi-page sites with
validated in-frame navigation (ADR-0022), EPUB chapters (ADR-0024),
eXeLearning package inspection (ADR-0025) and SCORM/eXe package zips
classified and rendered from a resource (ADR-0034), embedded and
remote-embed content named rather than dropped (in sandboxed sites too), section hierarchy for flexsections and
delegated sections (ADR-0030), and metadata fallback for unknown modules.
H5P (ADR-0018) and SCORM (ADR-0023) playback are **experimental** inside the
opaque-origin sandbox. ZIP backups are read lazily by central directory;
TAR.GZ is streamed into one buffer, so its decompressed size is the memory
ceiling (ADR-0029; OPFS staging is TASK-012). Whole-backup re-packaging
remains planned. Do not advertise planned capabilities as existing.

## Repository map

```
apps/viewer/    browser app (Vite, vanilla TS, parse worker, renderers)
apps/cli/       Bun CLI adapter over the core
packages/core/  portable parser: model/ archive/ moodle/   (@mbzoo/core)
fixtures/       deterministic synthetic .mbz fixtures + generator + manifest
e2e/            Playwright specs
research/       evidence system (sources → analysis → decisions); see research/AGENTS.md
docs/           architecture & privacy documentation
.agents/skills/ project skills for agents
.github/        CI workflows
```

## Mandatory commands

```bash
bun install                 # after changing dependencies
bun run check               # lint + format + typecheck + unit tests + build + research validation
bun run dev:viewer          # viewer dev server
bun run test:e2e            # Playwright (needs `npx playwright install`)
bun run cli -- <file.mbz>   # inspect a backup from the terminal
bun run research:indexes    # regenerate research indexes (never edit them)
```

CI runs the same commands; if `bun run check` fails locally it fails in CI.

## Architecture boundaries

- `packages/core` must stay runtime-portable: Web-platform APIs only
  (Uint8Array/Blob/TextDecoder/DecompressionStream). No Node, DOM globals,
  Bun or Vite APIs (ADR-0004).
- The normalized model (`packages/core/src/model/backup.ts`) is the only
  contract crossing package boundaries. XML library objects never escape
  `src/moodle`.
- Viewer uses `textContent` for backup-derived text by default. Backup-derived
  HTML may reach `innerHTML` only after the single `sanitizeHtml()`/DOMPurify
  path defined by ADR-0012. Do not create a second sanitization path.
- Executable HTML files run only in an opaque-origin sandboxed iframe with the
  injected CSP defined by ADR-0014; never in the MBZoo application origin.
- New packages only when a real boundary exists (ADR-0011).

## Coding conventions

- English everywhere: code, comments, docs, ADRs, commits.
- TypeScript strict plus noUncheckedIndexedAccess/exactOptionalPropertyTypes;
  do not weaken flags.
- No comments unless they explain a non-obvious "why"; cite decision/source IDs
  where relevant, e.g. `(ADR-0005)`, `(REPO-004)`.
- Biome owns formatting and linting; do not add ESLint/Prettier.
- Every behavior change ships with tests covering happy path and edges.

## Security rules (binding)

1. Every `.mbz` and every value extracted from it is hostile input. Validate at
   trust boundaries; use `unknown` and narrow explicitly; never unsafe type
   assertions to silence validation.
2. Never execute backup-provided JavaScript in the MBZoo application origin.
   Page/Label HTML is sanitized (ADR-0012); executable HTML-file previews use
   the opaque-origin sandbox + injected CSP from ADR-0014.
3. SCORM launchers are not implemented. H5P playback is experimental only
   (ADR-0018): it must stay inside the opaque-origin sandbox and must not gain
   new iframe permissions. Any new executable-content surface,
   iframe permission, postMessage bridge or network capability requires an
   evidence-backed security/architecture decision and threat-model review.
4. Nothing may upload user data anywhere. No telemetry, analytics or automatic
   fetching of backup-referenced remote content. Backup link tokens
   (`$@CODE*arg@$`) are decoded and offered as links, never requested, and an
   undecodable one must lose its href rather than resolve against our own
   origin (ADR-0019).
5. Path traversal, XML entity expansion and malformed input are regression
   classes. Extend security tests whenever archive, parser or renderer trust
   boundaries change.

## Evidence & documentation rules

- Durable claims cite registered records (REPO-NNN / STD-NNN / TECH-NNN /
  EXP-NNN / ADR-NNNN) or carry `[PENDING: verification required]`.
- Never invent sources, versions or benchmark numbers. Run the experiment.
- Durable decisions get ADRs (template in `research/templates/`). Supersede;
  never rewrite accepted ADR history.
- Update `research/status.yaml` append-only when adding/changing tracked tasks
  or risks.

## Fixtures & privacy restrictions

- Committed fixtures must be synthetic, deterministic and documented in
  `fixtures/manifest.yaml` with sha256. Regenerate via the generator script;
  unexpected checksum drift is a regression.
- NEVER commit real institution or personal Moodle backups. Real-world
  specimens (e.g. saylordotorg/course_backups, REPO-004) are downloaded ad hoc,
  recorded with provenance, and never vendored wholesale.
- Do not port Moodle PHP line-by-line; study format facts instead
  (REPO-005). GPL-3.0-or-later (ADR-0035) removes the licence bar, not the
  rule: the parsers stay clean-room TypeScript, and copied code would drag in
  Moodle's copyright notices and PHP semantics.

## Files generated automatically

- `research/indexes/*.yaml` — regenerate with `bun run research:indexes`; CI
  detects stale output. Never hand-edit.

## What agents must never do

- Claim unimplemented features as working (README distinguishes
  Implemented/Experimental/Planned).
- Execute or auto-render course JavaScript in the main origin.
- Push, merge, publish releases or deploy unless explicitly authorized.
- Edit generated files by hand; rewrite ADR history; reuse IDs.
- Add heavy frameworks or new dependencies without an evidence-backed record
  covering purpose, license, maintenance and bundle impact.
