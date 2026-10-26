---
id: ADR-0036
title: The decompressed tar is staged in a Blob, not in one ArrayBuffer
status: Proposed
date: 2026-08-28
sources: [STD-001, REPO-004]
experiments: [EXP-004, EXP-005]
related: [ADR-0004, ADR-0005, ADR-0009, ADR-0027]
supersedes: [ADR-0029]
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0036: The decompressed tar is staged in a Blob, not in one ArrayBuffer

## Context

ADR-0029 made TAR.GZ cheaper by pre-sizing one buffer from the gzip
trailer's ISIZE and recording entries as offsets into it. That allocation
happens **before** any byte is decompressed, and it must be satisfied in one
contiguous block: a backup that unpacks to 1.46 GiB asks the renderer for
1.46 GiB up front.

A user on Chrome/Windows opening a real course backup got the error card
with `Array buffer allocation failed` — V8's message for an allocation the
browser cannot meet — and no course. The throw sat outside the
`gunzipToBuffer` try, so it was not even wrapped as an `MbzParseError`: the
raw V8 string travelled through the worker to the UI, naming neither the
size nor anything the reader could do about it.

This is the ceiling ADR-0029 recorded rather than removed ("that is the
format, not the code; TASK-012 is the answer"), reaching a real user.
Moodle ≥2.9 writes `.mbz` as tar+gz by default, so it is the common path,
not an edge case. ZIP has no such problem: it is read lazily by central
directory and nothing but the entry asked for is ever allocated.

## Problem

Where do the decompressed bytes of a tar.gz live, given that gzip is one
stream and random access needs them addressable — without demanding a single
allocation that a browser is entitled to refuse, and without a second reader
implementation for the browser (ADR-0004)?

## Decision drivers

- The failing allocation is the bug. Reducing peak memory is not enough if
  what remains is one block the platform may decline.
- Portability: `@mbzoo/core` is Web-platform APIs only, one code path for
  browsers, Bun and Node.
- Hostile input: a decompression bomb must still hit a ceiling.
- Cost honesty: a browser-shaped fix must not quietly degrade the CLI.

## Options considered

### Option A: Keep one ArrayBuffer, allocate it in chunks

Hold the tar as an array of fixed-size chunks and copy across boundaries in
`readEntry`. Removes the *contiguous* requirement but not the residency: the
renderer still holds the whole decompressed archive.

### Option B: Stage the decompressed tar in a Blob

Pipe `DecompressionStream` straight into `new Response(stream).blob()` and
slice entries back out on demand. A Blob is the platform's own byte store:
the browser holds it outside the JS heap, in the browser process, and is
free to page it to disk. Nothing is pre-sized and no single allocation
exceeds the entry being read. `Blob`, `Response` and `TransformStream` exist
in browsers, Bun and Node, so core stays portable.

### Option C: OPFS staging (TASK-012, Q-007)

Write the decompressed tar to the Origin Private File System and seek by
offset. Removes residency outright and bounds it by disk rather than RAM,
but OPFS is browser-only, so it forces a second `ArchiveReader`
implementation in the viewer and a permanently different code path from the
one CI exercises under Bun.

## Decision

We will stage the decompressed tar in a **Blob** (Option B).

- `TarGzReader.open` pipes the source through `DecompressionStream('gzip')`
  and a `TransformStream` that indexes ustar headers as the bytes pass, into
  `new Response(stream).blob()`. The archive is decompressed once and never
  re-read to be indexed.
- `readEntry` returns `new Uint8Array(await blob.slice(offset, end).arrayBuffer())`
  — its own bytes, not a view into shared storage.
- **ZIP is unchanged** and carries over from ADR-0029: `LazyZipReader` reads
  EOCD → ZIP64 locator/record when a field is saturated → central directory
  → per-entry `Blob.slice` + `inflateSync`. So does the viewer's rule of
  posting the `File` to the worker rather than its bytes.

Standing rules (1, 2 and 4 carried from ADR-0029; 3 replaced; 5 new):

1. An entry is inflated into a buffer one byte larger than the directory
   declared; filling that byte means the stream lies about its size and the
   entry is refused. fflate never grows a supplied buffer, so a bomb cannot
   allocate past declared + 1.
2. Every offset and length from the archive is bounds-checked before it is
   read. Entry count and directory size are capped, and `MAX_TAR_BYTES`
   (8 GiB) still bounds what a gzip bomb can stage — enforced while indexing
   now that no pre-sized buffer enforces it.
3. `readEntry` returns bytes the caller owns, on both readers. Nothing hands
   out a window into shared storage, so nothing outlives `close()` by
   accident.
4. No archive library beyond fflate's `inflateSync`; the format is small
   enough to own and the ownership is what keeps it testable.
5. An allocation a browser refuses is reported as `tooLargeToRead(name,
   size, cause)` — an `MbzParseError` naming the entry and the megabytes
   that could not be met. A raw `RangeError` must never reach the UI.

## Consequences

### Positive

- The allocation that failed is gone. Opening a 1,385 MB backup takes the
  renderer's peak RSS from 1,766 MB to 425 MB — 5.8× net of idle — and no
  allocation in it is larger than the entry being read (EXP-005).
- Nothing is sized from data the archive supplies before that data is
  verified; ISIZE is no longer trusted for an allocation at all.
- `readEntry` owning its bytes retires the "views outliving `close()`" risk
  ADR-0029 had to warn about, and makes both readers behave the same way.
- A browser that still cannot satisfy a single huge entry now says which
  entry and how large, in an `MbzParseError` like every other parse failure.

### Negative

- ~28 % slower on the largest specimen (2,150 → 2,750 ms): bytes are copied
  into blob storage and sliced back out per entry instead of being read as
  views into a buffer already in the heap (EXP-005).
- The bytes move rather than disappear. The browser process absorbs up to
  ~1.3 GB for a 1.4 GB backup; Chromium may page that to disk, but a machine
  under real pressure is still holding the archive somewhere.
- The CLI pays the time and gains no memory: Bun's Blob is memory-backed
  (EXP-005). A browser-only reader would avoid that and is rejected anyway —
  a code path CI cannot exercise costs more than 20 % on one command.

### Neutral

- The `ArchiveReader` interface is unchanged, again.
- TASK-012 (OPFS staging) is narrowed, not closed: it remains the answer if
  a specimen ever exceeds what blob storage will take.

## Risks

- **RISK-001** (materialising the archive) drops from "the decompressed size
  is the renderer's ceiling" to "the platform decides where the bytes live".
  Mitigated, not retired: `MAX_TAR_BYTES` still caps a bomb, and Option C
  remains available.
- **Blob storage is a quota, not infinity.** Chromium spills to disk under
  its own limits; a browser with a small quota may fail differently than
  before. Rule 5 makes such a failure legible, and e2e covers all three
  engines (ADR-0027).
- **Header indexing is now stateful.** A header straddling a decompression
  chunk boundary must be reassembled; getting it wrong misreads the whole
  archive. Covered by a test that reads 400 entries of deliberately
  non-block-aligned sizes back byte for byte.

## Validation

- `packages/core/test/targz.test.ts`: entries come back as their own bytes;
  headers that straddle chunk boundaries index correctly; an entry whose
  declared size runs past the stream is refused; `tooLargeToRead` names the
  entry and the size, passes an existing `MbzParseError` through, and does
  not blame size for unrelated faults.
- EXP-005 re-runnable via `research/experiments/scripts/exp-005-browser-peak.ts`.
- e2e on Chromium, Firefox and WebKit (198 tests) exercises the real path.

## Follow-up work

- TASK-012 / Q-007 stay open, narrowed to "if blob storage proves
  insufficient".
- The viewer shows core's error text untranslated, as it does for every
  parse error. Localising the reader's messages is a separate question.

## References

- ADR-0029 (superseded), ADR-0004, ADR-0005, ADR-0009, ADR-0027.
- EXP-004 (the measurements ADR-0029 rested on), EXP-005 (this change).
- STD-001 (ustar/PKWARE layout), REPO-004 (ARTH101 specimen).

---

## Addendum: Investigation

### Constraints

`@mbzoo/core` may use Web-platform APIs only (ADR-0004), so any staging
mechanism must exist in browsers, Bun and Node alike. The archive is hostile
input: no value read from it may size an allocation without a ceiling. The
viewer must keep parsing off the main thread, so whatever holds the bytes
must survive being reached from a worker.

### Comparative matrix

| Criterion | A: chunked ArrayBuffer | B: Blob staging | C: OPFS staging |
|---|---|---|---|
| Runtime / toolchain | portable | portable (`Blob`/`Response`) | browser-only; second reader |
| Removes the failing allocation | yes | yes | yes |
| Removes residency in the renderer | no | yes | yes |
| Footprint / dependencies | none | none | none, but a viewer-side path CI cannot run under Bun |
| Security / privacy | unchanged | unchanged; bomb cap moves to the indexer | unchanged; adds on-disk residue to clean up |
| Cost | none measured | ~28 % slower on 1.4 GB | not measured |

### Option notes

Option A was the smallest diff and the first thing tried on paper. It fails
the actual test: the reported error is an allocation failure on a Windows
machine with other tabs open, where the renderer is short of memory overall,
not merely of contiguous address space. Chunking would have made the same
1.46 GiB resident in the same process and moved the failure a little later.

Option C is stronger than B on residency and remains the recorded plan
(TASK-012). It was not chosen now because it splits the reader in two: the
browser would run OPFS while CI runs the buffer path under Bun, which is
exactly the untested-in-CI shape ADR-0029 rejected zip.js for (RISK-003). B
gets most of the benefit with one code path, and leaves C available if a
specimen ever needs it.

### Adversarial review

- **"A Blob is just an ArrayBuffer with extra steps."** Measured, not
  assumed: EXP-005 splits RSS by Chrome process role. The renderer's peak
  falls 5.8× and the browser process's rises, which is only possible if the
  bytes are not in the renderer's heap.
- **Does this hide a bomb?** No: `MAX_TAR_BYTES` is enforced while indexing,
  so a stream that keeps producing is cut off at 8 GiB as before. What
  changed is that the cap is checked against bytes actually seen rather than
  against a size the archive declared.
- **Truncation.** The old reader compared `offset + size` against the
  buffer's length. With no buffer, the indexer instead refuses a stream that
  ends before an entry's data does — while tolerating a missing final
  padding block, which the old check also tolerated and which real archives
  do omit.
- **Disk residue.** Blob storage that pages to disk writes into the
  browser's own profile, is scoped to the page's lifetime, and is not
  something MBZoo can address, name or upload. No backup content leaves the
  device; the privacy claim (ADR-0009, no telemetry) is untouched.
- **Slower is a regression.** It is, and it is on the wrong side of a
  trade-off only if the file would have opened at all. A backup that fails
  to open has infinite latency.

### Evidence

- EXP-005: browser-per-process RSS before/after, three specimens, and Bun
  numbers from the EXP-004 harness in the same session.
- The failure text is V8's `kArrayBufferAllocationFailed` message; the path
  it travelled is `TarGzReader.open` → worker `catch (e) { e.message }` →
  `main.ts` `errorMsg.textContent`, which renders it verbatim.
