# Open research questions
# Each entry: id, question, status, related records.
Q-001:
  What exact archive formats do supported Moodle versions emit today (4.x/5.x)?
  tgz default since 2.9 verified; ZIP option availability per version [PENDING].
  sources: [REPO-005]
  status: partially-answered
Q-002:
  What is the true minimum XML subset for a faithful navigation tree across
  course formats (topics, weekly, flexsections, social…)? flexsections showed
  empty-sequence edge cases.
  status: answered — ADR-0030 (flexsections parents by section number; delegated sections; other formats keep raw options)
Q-003:
  Efficient files.xml indexing strategy for huge courses (lazy vs eager, keying).
  status: open
Q-004:
  Can ZIP be inspected lazily in browsers via zip.js while keeping CI coverage?
  (EXP-002 blocks Bun-side testing.)
  status: answered — no, and not needed: ADR-0029 reads the central directory over Blob.slice with fflate inflateSync, portable to Bun
Q-005:
  Streaming strategy for multi-GB TAR.GZ (DecompressionStream + incremental ustar)?
  status: answered — ADR-0036 streams DecompressionStream into a Blob and indexes ustar headers as the bytes pass, so nothing is pre-sized from ISIZE (ADR-0029 did, and that allocation is what failed); staging to OPFS instead stays Q-007 (TASK-012)
Q-006:
  Which browser memory limits materially affect MBZoo (per-tab heaps, Blob limits)?
  status: partly answered — a renderer refuses a single multi-hundred-MB ArrayBuffer under pressure (the reported Chrome/Windows failure); Blob storage took a 1.46 GiB tar with the renderer flat (EXP-005). Where blob storage itself stops is still open.
Q-007:
  Temporary large-file storage: memory vs OPFS vs IndexedDB hybrid?
  status: narrowed — ADR-0036 stages the decompressed tar in a Blob, which is portable and removed the failing allocation (EXP-005). OPFS (TASK-012) stays open for the case where blob storage proves insufficient.
Q-008:
  Long-term XML parser choice as files.xml sizes grow (saxes vs alternatives)?
  status: open
Q-010:
  At what renderer count does the vanilla-DOM UI need a component model?
  status: open
Q-011:
  Concrete sandbox architecture for embedded HTML/SVG/SCORM/H5P launchers
  (iframe sandbox tokens, CSP, postMessage capabilities).
  status: open
Q-012:
  Is scorm-again suitable as the SCORM runtime foundation (1.2 vs 2004 scope)?
  status: not-started
Q-013:
  Can Moodle H5P activities be reconstructed into h5p-standalone packages?
  status: not-started
Q-014:
  Which quiz question types can MBZoo practice-mode support without Moodle's
  Question Engine?
  status: not-started
Q-015:
  Static export model preserving navigation and assets.
  status: not-started
