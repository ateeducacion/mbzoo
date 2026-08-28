---
id: EXP-005
title: Where the decompressed tar lives — one ArrayBuffer versus a Blob, measured per browser process
status: completed
date: 2026-08-28
ai_tool: claude-code
ai_model: claude-opus-5
---
## Objective
A user opening a large `.mbz` on Chrome/Windows got
`Array buffer allocation failed` and no course. ADR-0029 sized one buffer
from the gzip trailer's ISIZE and allocated it before decompressing, so a
backup that unpacks to 1.46 GiB asked the renderer for 1.46 GiB in one
contiguous block. Measure what changes when those bytes are staged in a Blob
instead — in a real browser, per process, because a total alone cannot tell
an allocation that must succeed in one block from bytes the platform is free
to spill to disk.

## Hypothesis
Blob bytes are held by the browser process, not the renderer's heap, and
Chromium may page them out. Renderer peak should fall to roughly what is
actually parsed; the browser process should absorb the archive; and the
single large allocation — the thing that failed — should disappear. Bun
should show no memory win, because its Blob is memory-backed.

## Environment
macOS (Darwin 25.4.0, arm64), Bun 1.4.0, Playwright chromium 1234
(headless), MBZoo `fix/targz-blob-staging`. "Before" is `main` at `ed01e49`,
measured in the same session by stashing the change and rebuilding the
viewer. Specimens: ARTH101 from REPO-004; SMR_SEGI and SMR_SOR_01_09 are
institutional TAR.GZ backups inspected locally and never vendored (the same
two EXP-004 used). Each browser row is the peak of RSS sampled every 100 ms
across the whole process tree, split by Chrome's `--type=` role; Bun rows are
the median of three runs of the EXP-004 harness (peak above baseline).

## Method
```
bun run build:viewer
bun run research/experiments/scripts/exp-005-browser-peak.ts <file.mbz>
bun run research/experiments/scripts/exp-004-peak-memory.ts <file.mbz>
```
The browser script drives the built viewer through its own `#file-input`, so
the archive travels the production path (File → worker → ArchiveReader), and
waits on the app's own `#course` / `#error` sections rather than a timer.

## Measurements

Browser, absolute peak RSS (idle renderer ≈ 145 MB, idle browser process
85 MB — these are floors, not overhead of the open):

| backup | size | renderer before | renderer after | browser proc before | browser proc after | ms before | ms after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SMR_SOR_01_09 | 1,385 MB | 1,766 / 1,700 MB | **391 / 425 MB** | 88 MB | 921 / 1,380 MB | 2,148 / 2,151 | 2,755 / 2,746 |
| SMR_SEGI | 400 MB | 1,011 MB | **355 MB** | 88 MB | 566 MB | 735 | 936 |
| ARTH101 | 81 MB | 426 MB | **210 MB** | 86 MB | 180 MB | 141 | 228 |

Net of the idle floor, the renderer's own peak for SMR_SOR_01_09 falls from
≈1,620 MB to ≈280 MB — 5.8× — and no allocation in it is larger than the
entry being read.

Bun (CLI), same harness as EXP-004, median of three:

| backup | peak before | peak after | ms before | ms after |
| --- | ---: | ---: | ---: | ---: |
| SMR_SOR_01_09 | 2,365 MB | 2,233 MB | 2,090 | 2,524 |
| SMR_SEGI | 1,569 MB | 1,600 MB | 666 | 667 |
| ARTH101 | 284 MB | 268 MB | 111 | 110 |

## Result / Conclusion
- **The failing allocation is gone.** Opening a 1,385 MB backup no longer
  asks the renderer for one 1.46 GiB block; its peak is 5.8× lower and is
  dominated by the parse, not the archive.
- **The bytes move, they do not vanish.** The browser process absorbs them
  (+836 MB to +1,295 MB on SMR_SOR_01_09), where Chromium's blob storage may
  page them to disk. That is the trade: one allocation that can fail becomes
  storage the platform manages.
- **It costs ~28 % wall time** on the largest specimen (2,150 → 2,750 ms):
  the bytes are copied into blob storage and sliced back out per entry
  instead of being read as views into a buffer already in the heap.
- **Bun gains nothing**, as predicted: its Blob is memory-backed, so peak is
  unchanged within noise and the big file is ~20 % slower. The CLI pays a
  little for a browser fix; no separate reader is worth that.
- Feeds ADR-0036.

## Limitations
- Two browser runs for SMR_SOR_01_09, one for the other specimens. The gap
  measured (4×) is far outside the spread seen (1,700–1,766 vs 391–425).
- RSS is coarse and counts uncollected garbage; it overstates what a
  memory-pressured tab would hold and understates nothing.
- Chromium only. Firefox and WebKit run the same code path in the e2e suite
  (ADR-0027) but were not memory-profiled; their blob implementations may
  keep the bytes in a different process, or in the same one.
- macOS with free RAM, so neither build actually failed to allocate here.
  The reported failure is Chrome on Windows; this experiment measures the
  allocation that failed, not the failure.
