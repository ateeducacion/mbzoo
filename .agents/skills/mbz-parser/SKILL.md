---
name: mbz-parser
description: Project invariants for working on packages/core parsing code. Load before touching archive/XML/model files.
---
# Skill: MBZoo parser work
Invariants (violating any of these is a bug):
- `packages/core` uses Web-platform APIs only (ADR-0004). No Bun/DOM globals.
- All backup data is hostile: parse via events, validate before narrowing, emit warnings instead of dropping silently or crashing on unknown data.
- XML goes through `src/moodle/xml.ts` only; no new direct saxes imports elsewhere (ADR-0006).
- Archive access through `ArchiveReader`; both ZIP and TAR.GZ must keep working (ADR-0005, REPO-005 facts).
- File pool layout is `files/<2 hex>/<sha1>`; NULL sentinel is `$@NULL@$`.
- Behavior change ⇒ tests first: happy path + malformed input + security regressions (`bun test packages apps fixtures`).
- Verify against BOTH the synthetic fixture and, ad hoc, a real REPO-004 backup.
