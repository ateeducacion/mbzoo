---
id: ADR-0029
title: Read archives lazily — ZIP by central directory, TAR.GZ streamed into one buffer
status: Superseded
date: 2026-08-25
sources: [TECH-005, STD-001, REPO-004]
experiments: [EXP-002, EXP-004]
related: [ADR-0004, ADR-0005, ADR-0009]
supersedes: []
superseded_by: [ADR-0036]
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0029: Read archives lazily — ZIP by central directory, TAR.GZ streamed into one buffer

## Context

ADR-0005 shipped two readers that both hold everything: `FflateZipReader`
inflated every entry with `unzipSync` at open; `TarGzReader` read the Blob
whole, decompressed it whole, then `slice`-copied each entry — compressed +
decompressed + a copy of every entry, all at once. The viewer added a copy
of its own by reading the File into an ArrayBuffer to post it to the worker.
RISK-001 recorded the ceiling and TASK-003 deferred the fix to a
"large-file milestone" that was to bring zip.js — which EXP-002 had shown
does not run under Bun, so any such path would have been untested in CI
(RISK-003).

Measured (EXP-004): a 400 MB backup peaked at 2.3 GB, a 1.4 GB one at
3.6 GB. The two largest files in the corpus are exactly this shape.

## Problem

How can a backup be opened without holding it in memory several times over,
with one code path that runs identically in browsers, Bun and Node
(ADR-0004), and without a dependency that CI cannot exercise?

## Decision drivers

- Portability: Web-platform APIs only in `@mbzoo/core`.
- Hostile input: every offset the archive supplies must be checked before
  use; a declared size must bound allocation, not merely describe it.
- Honesty about what gzip allows: it is one stream, so random access needs
  the decompressed bytes somewhere.

## Options

1. **zip.js for lazy ZIP** — the plan of record. Cannot run under Bun
   (EXP-002), so the shipped path would be untested. Rejected.
2. **Hand-rolled central-directory reader + fflate `inflateSync`.** The
   directory is a few dozen bytes per entry at the tail; each entry is
   sliced from the Blob and inflated on demand. Portable, no new dependency.
   Chosen.
3. **OPFS staging for TAR.GZ** — write the decompressed tar to the Origin
   Private File System and seek. Browser-only, so it cannot live in core.
   Deferred to TASK-012, not rejected.

## Decision

- **ZIP** is read by `LazyZipReader`: EOCD → (ZIP64 locator and record when
  any field is saturated) → central directory → per-entry `Blob.slice` +
  `inflateSync` for method 8, raw bytes for method 0. Directory entries,
  traversal names (`sanitizeTarName`, ADR-0009), encrypted entries and other
  methods are refused at open.
- **TAR.GZ** streams the Blob through `DecompressionStream` into one buffer
  pre-sized from the gzip trailer's ISIZE; entries are recorded as offsets
  and `readEntry` returns a view.
- **The viewer posts the File to the worker** rather than its bytes:
  structured clone shares the underlying data, so the archive is never read
  into JS memory whole.

Standing rules:

1. An entry is inflated into a buffer one byte larger than the directory
   declared; filling that byte means the stream lies about its size and the
   entry is refused. fflate never grows a supplied buffer, so a bomb cannot
   allocate past declared + 1.
2. Every offset and length from the archive is bounds-checked against the
   Blob before it is read. Entry count and directory size are capped.
3. `readEntry` on TAR.GZ returns a view into the shared buffer; callers must
   copy before retaining past `close()`. The worker already slices before
   posting.
4. No archive library beyond fflate's `inflateSync`; the format is small
   enough to own and the ownership is what keeps it testable.

## Consequences

**Positive.** ZIP: 23× less peak memory and 15× faster at the reader layer;
a 400 MB, 32,150-record backup opens fully parsed in 257 MB. TAR.GZ: 24–47 %
less peak, up to 2.3× faster. RISK-001 retired for ZIP, RISK-003 retired
outright. ZIP64 handled, verified on an Info-ZIP-produced specimen.

**Negative.** TAR.GZ still holds the decompressed tar plus transient
decompression chunks — roughly 2× the decompressed size at peak. That is the
format, not the code; TASK-012 is the answer.

**Neutral.** The `ArchiveReader` interface is unchanged, which is what
ADR-0005 built it for.

## Risks

- **A Moodle-produced ZIP differs from Info-ZIP's.** Same APPNOTE, and the
  reader takes sizes from the central directory rather than local headers
  precisely so data-descriptor archives work; but no Moodle ZIP has been
  seen. Recorded in AN-008's gaps.
- **`readEntry` views outliving `close()`.** Rule 3; the one consumer that
  retains bytes (the worker) copies.

## Validation

- `packages/core/test/lazy-zip.test.ts` — deflate and stored entries; a real
  ZIP64 archive; not-a-zip; directory offset past the file; saturated count
  without a ZIP64 record; truncated directory; inflates to more than
  declared; inflates to less; encrypted; unsupported method; traversal
  names.
- `packages/core/test/targz.test.ts` — entries are views into one buffer;
  buffer sized from the trailer; corrupt stream is a parse error.
- EXP-004 numbers above; full suite on three browsers.

## References

- TECH-005 fflate · STD-001 PKWARE APPNOTE · EXP-002 zip.js under Bun ·
  EXP-004 measurements · ADR-0005 the interface this fills in.

---

## Addendum: Investigation

**Why the +1 byte.** Probed directly: `inflateSync` with `out` smaller than
the stream returns the truncated buffer, silently; with `out` larger, it
returns a right-sized subarray. So "declared size" as the buffer gives no
signal when a stream produces more. Declared + 1 does: an honest stream
never touches the last byte.

**Why ISIZE is a hint and not a limit.** zlib verifies ISIZE against what
it produced, so a trailer that lies fails decompression outright — a test
written to "survive a lying trailer" failed for that reason and was
replaced. The growth path exists only for the ≥ 4 GiB wrap-around.

**Where the TAR.GZ memory still goes.** SMR_SEGI decompresses to 470 MB
and peaks at 1,552 MB after: the buffer, roughly the same again in
DecompressionStream chunks awaiting collection, and the parsed model (which
the ZIP path shows is ~250 MB for this backup). Nothing in that is a copy
MBZoo makes.
