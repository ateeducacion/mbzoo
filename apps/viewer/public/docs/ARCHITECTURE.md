> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/ARCHITECTURE.md.

# Architecture

Status: bootstrap (2026-08-24). Durable decisions live in
`research/decisions/adr/`; this page summarizes the shape.

```
                 ┌──────────────────────────────┐
  .mbz file ───▶ │  apps/viewer (Vite, vanilla) │
   (File/Blob)   │   main.ts        worker.ts   │
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

Key boundaries (see ADRs for rationale):

- **Portable core** (ADR-0004): Web-platform primitives only; the normalized
  model in `packages/core/src/model/backup.ts` is the only cross-package
  contract.
- **Archive abstraction** (ADR-0005): both real `.mbz` containers supported;
  lazy/streaming access deferred behind `ArchiveReader`.
- **XML adapter** (ADR-0006): event-based parsing with input/text budgets;
  saxes is an implementation detail.
- **Security** (ADR-0009): hostile input posture; textContent-only rendering;
  no content execution in the app origin.

Performance model today: parse runs in a Worker; only metadata XML is read
eagerly; binary assets are never extracted unless requested. Large-file
strategy is tracked as TASK-003 / Q-004..Q-007.
