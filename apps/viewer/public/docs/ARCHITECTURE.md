> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/ARCHITECTURE.md.

# Architecture

Status: experimental but working end to end (2026-08-25). Durable decisions
live in `research/decisions/adr/`; this page summarizes the shape.

```
                 ┌──────────────────────────────┐
  .mbz file ───▶ │  apps/viewer (Vite, vanilla) │
   (File/Blob)   │   main.ts        worker.ts   │
                 │   renderers.ts   detail-panel│
                 └───────┬──────────────┬───────┘
                         │              │ postMessage(ArrayBuffer)
                         ▼              ▼
                 ┌──────────────────────────────────┐
                 │        @mbzoo/core (portable)    │
                 │  openBackup(blob)                │
                 │   ├─ detectFormat (magic bytes)  │
                 │   ├─ ArchiveReader               │
                 │   │    ├─ FflateZipReader (zip)  │
                 │   │    └─ TarGzReader (tar.gz)   │
                 │   └─ moodle/ event XML parsers   │
                 │        → normalized model        │
                 └──────────────────────────────────┘
                                  ▲
                  apps/cli (Bun) ─┘ same core, local disk
```

`packages/core/src/moodle/` holds one parser per thing the format expresses,
each reading the minimum subset it needs:

| Area          | Modules                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Structure     | `backup-xml`, `course-xml`, `activity-xml`, `files-xml`                                           |
| Activities    | `lesson-xml`, `book-xml`, `glossary-xml`, `feedback-xml`, `questions-xml`                         |
| Grading       | `grades-xml`, `grading-xml`                                                                       |
| People        | `users-xml`                                                                                       |
| Cross-cutting | `links` (`$@…@$` tokens), `php-serialized`, `legacy-modules`, `availability`, `module-xml`, `xml` |

Two rules keep that list from becoming a pile: the normalized model in
`packages/core/src/model/backup.ts` is the only contract that crosses a
package boundary, and XML library objects never escape `src/moodle`.

Key boundaries (see ADRs for rationale):

- **Portable core** (ADR-0004): Web-platform primitives only; the normalized
  model in `packages/core/src/model/backup.ts` is the only cross-package
  contract.
- **Archive abstraction** (ADR-0005): both real `.mbz` containers supported;
  lazy/streaming access deferred behind `ArchiveReader`.
- **XML adapter** (ADR-0006): event-based parsing with input/text budgets;
  saxes is an implementation detail.
- **Security** (ADR-0009): hostile input posture; textContent by default; a
  single sanitization path for backup HTML (ADR-0012); no content execution in
  the app origin.
- **Sandboxed content** (ADR-0017, ADR-0020, ADR-0022): executable HTML runs
  only in an opaque-origin iframe with an injected CSP, with assets inlined as
  `data:` URIs; multi-page sites are navigated within that contract.
- **Never guess a URL** (ADR-0019): `$@…@$` link tokens decode from rules read
  in Moodle source, or not at all — an undecodable one loses its href rather
  than resolving against MBZoo's own origin.
- **Refusing parsers** (ADR-0021): the PHP `serialize()` reader supports the
  scalar and array subset that appears and refuses objects and
  back-references outright.

Performance model today: parse runs in a Worker; only metadata XML is read
eagerly; binary assets are never extracted unless requested. Large-file
strategy is tracked as TASK-003 / Q-004..Q-007.

## How claims get verified

Parsers are written against Moodle source (REPO-005) because it is
authoritative for what a backup _can_ contain — and then checked against a
real backup, because the schema does not say what one _does_ contain. Real
specimens come from institutional and public corpora, from Moodle's own test
fixtures, and from courses generated in a real Moodle and backed up through
`backup_controller`. They are recorded in `fixtures/manifest.yaml` with
provenance and checksums, and never committed. That practice has already
caught a bug a synthetic fixture could not: a lesson jump target whose page id
collided with a Moodle constant.
