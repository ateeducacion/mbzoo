---
name: mbz-security
description: Security review rules for hostile MBZ input and browser trust boundaries. Use for archive/XML parsing, HTML/file previews, URLs, dependencies, workers, or any new capability that consumes backup data.
---
# Skill: MBZoo security review

1. Start from the threat model and ADR-0009. Assume the attacker controls the archive structure, file names, XML, HTML, MIME metadata, URLs and embedded files.
2. Validate before narrowing. Do not use type assertions, regex-only path checks, MIME strings, extensions or XML fields as trust signals.
3. Archive/XML changes must preserve defenses against path traversal, malformed input and entity-expansion style attacks. Add a regression case for the boundary being changed.
4. Backup-derived text uses `textContent` by default. HTML inserted into the app DOM must pass the single `sanitizeHtml()`/DOMPurify path from ADR-0012; do not inline or create a second sanitizer.
5. Never execute backup JavaScript in the application origin. For executable HTML/SCORM/H5P/iframe work, load `mbz-content-sandbox`.
6. Do not automatically fetch remote URLs referenced by a backup. User-facing external links must use an explicit safe scheme and opener isolation.
7. Treat object URLs as capabilities: scope them to the current preview and revoke them when disposed. Do not persist backup blobs longer than needed.
8. Resource-exhaustion risks are security risks too. For unbounded loops, decompression, large buffers or previews, load `mbz-performance` and establish evidence-backed limits rather than arbitrary constants.
9. New dependencies need evidence for purpose, maintenance, license and browser/bundle impact before adoption.
10. Finish with targeted security tests and `bun run check`; add E2E coverage when the trust boundary is browser-visible.
