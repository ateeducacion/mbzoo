---
id: EXP-004
title: Peak memory and time of archive access before and after lazy readers
status: completed
date: 2026-08-25
ai_tool: claude-code
ai_model: claude-opus-5
---
## Objective
Measure what opening a real backup costs in memory, before and after
ADR-0029, on the largest files available (REPO-004 corpus and two
institutional TAR.GZ backups inspected locally, never vendored).

## Hypothesis
Both readers materialised everything: TAR.GZ read the compressed Blob whole,
decompressed it whole, then copied every entry out; ZIP inflated every entry
up front. Peak should fall to roughly the decompressed size for TAR.GZ and to
"only what was read" for ZIP.

## Environment
macOS (Darwin 25.4.0, arm64), Bun 1.4.0, fflate 0.8.3, MBZoo main at
`4a2b1a6` (before) and the ADR-0029 working tree (after). Peak = max RSS
sampled every 25 ms across `openBackupSession` + parse + one entry read,
minus RSS at start. Single process per measurement.

## Method
```
bun run research/experiments/scripts/exp-004-peak-memory.ts <backup.mbz>
bun run research/experiments/scripts/exp-004-reader-layer.ts <backup.zip>
```
"Before" rows ran the same scripts against main at `4a2b1a6`; the old
ZIP reader was taken from `git show 4a2b1a6:packages/core/src/archive/fflate-zip-reader.ts`
and driven through the identical open/list/read steps.
The ZIP specimen is SMR_SEGI re-packed with Info-ZIP 3.0 (`zip -r -X`)
from its extracted tree (470 MB on disk, 2,008 file entries + 373 directory
entries, 25.4 MB `files.xml`), because the corpus contains no ZIP.

## Measurements

Full open + parse (model included):

| backup | format | size | peak before | peak after | time before | time after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| SMR_SEGI | tar.gz | 400 MB | 2,348 MB | 1,552 MB | 912 ms | 651 ms |
| ARTH101 | tar.gz | 81 MB | 518 MB | 275 MB | 123 ms | 99 ms |
| SMR_SOR_01_09 | tar.gz | 1,385 MB | 3,625 MB | 2,744 MB | 4,656 ms | 2,062 ms |
| SMR_SEGI as ZIP | zip | 400 MB | — | **257 MB** | — | **414 ms** |

Reader layer only, same ZIP (open + list + read `files.xml` + one pool file):

| reader | entries listed | peak | time |
| --- | ---: | ---: | ---: |
| FflateZipReader (before) | 2,381 | 980 MB | 2,022 ms |
| LazyZipReader (after) | 2,008 | **42 MB** | **131 ms** |

The listed-entry difference is the 373 directory entries, which the lazy
reader drops (they carry no bytes); file entries are identical.

## Result / Conclusion
- **ZIP:** the archive never enters memory. 23× less peak and 15× faster at
  the reader layer; a 400 MB, 32,150-record backup opens fully parsed in
  257 MB. Retires RISK-001 for ZIP and RISK-003 (zip.js not needed).
- **TAR.GZ:** 24–47 % less peak and up to 2.3× faster, from streaming the
  Blob instead of reading it whole, pre-sizing from ISIZE, and returning
  views. The remaining peak is roughly 2× the decompressed size: the buffer
  itself plus DecompressionStream's chunks, which are copied in and become
  garbage the runtime has not yet collected. gzip is one stream, so the
  buffer is inherent; removing it means staging to OPFS (TASK-012, Q-007).
- Feeds ADR-0029.

## Limitations
- RSS is coarse: it counts uncollected garbage, so TAR.GZ "after" overstates
  what a memory-pressured tab would hold. It understates nothing.
- Bun, not a browser. The viewer additionally stopped copying the File into
  the worker (structured clone shares bytes), which this method cannot see.
- One ZIP specimen, produced by Info-ZIP rather than Moodle's own packer.
