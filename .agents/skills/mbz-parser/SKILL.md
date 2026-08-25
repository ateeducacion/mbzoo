---
name: mbz-parser
description: Project invariants for packages/core parsing code. Load before touching archive, XML, Moodle normalization, or model files.
---
# Skill: MBZoo parser work

Invariants; violating any of these is a bug:

- `packages/core` uses Web-platform APIs only (ADR-0004). No Node, DOM, Bun or Vite globals.
- Treat archive paths, XML values, counts, sizes and identifiers as hostile input. Validate at trust boundaries; unknown/unsupported data should produce useful warnings instead of silent loss or avoidable crashes.
- XML parsing goes through `src/moodle/xml.ts`; do not introduce direct parser-library imports elsewhere without changing ADR-0006.
- Archive access goes through `ArchiveReader`; ZIP and TAR.GZ must keep working (ADR-0005).
- The normalized model is the package boundary. Do not leak XML-parser/library objects outside `src/moodle`.
- File pool layout is `files/<2 hex>/<sha1>`; Moodle's NULL sentinel is `$@NULL@$`.
- Behavior changes require regression tests covering the happy path plus relevant malformed/security cases before the fix is considered complete.
- The deterministic synthetic fixture is the routine verification source. Use an ad-hoc real-world specimen only when the behavior depends on Moodle/version/course-format variation that the synthetic fixture cannot establish; never commit it.
- For changes that affect archive materialization, large byte buffers or worker transfers, also load the `mbz-performance` skill.

Run targeted tests while iterating, then `bun run check` before completion.
