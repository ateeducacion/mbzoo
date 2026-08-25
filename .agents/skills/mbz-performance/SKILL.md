---
name: mbz-performance
description: Performance and memory rules for archive parsing, workers and previews. Use when changing byte-buffer ownership, archive access, large-file behavior, PDF/rendering cost, streaming or lazy loading.
---
# Skill: MBZoo performance

1. Measure before optimizing. Define the workload, browser/runtime, fixture size and metric; never infer a performance win from code shape alone.
2. Prefer deterministic synthetic/stress fixtures. Do not require real user backups for benchmarks.
3. Watch peak memory as well as elapsed time. MBZ processing can multiply memory through compressed bytes, decompressed entries, decoded strings, model objects, previews and copied `Uint8Array`/`ArrayBuffer` values.
4. Avoid unnecessary whole-file/archive copies, but do not remove an intentional copy until the consumer's ownership/transfer/detachment behavior is understood (for example worker transfer or third-party libraries).
5. Keep CPU-heavy parsing/decompression off the main thread. Do not move parser work into the viewer event loop to simplify APIs.
6. Prefer on-demand entry reads and previews. Do not eagerly materialize every file merely because metadata references it.
7. Object URLs, PDF documents/canvases and other preview resources need bounded lifetimes and cleanup when the user switches activity/course.
8. Any new size/count/time limit must be justified by security/performance evidence or a documented decision; avoid unexplained magic thresholds.
9. Multi-gigabyte streaming/lazy backup support is planned, not currently guaranteed. Do not describe the app as supporting it until measured end-to-end behavior exists.
10. Significant benchmark claims belong in an EXP record via `mbz-research`; run targeted tests, `bun run check`, and browser QA when user-visible responsiveness changes.
