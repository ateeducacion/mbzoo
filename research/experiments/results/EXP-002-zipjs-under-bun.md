---
id: EXP-002
title: "@zip.js/zip.js compatibility with Bun 1.4.0"
date: 2026-08-24
status: completed
sources: [TECH-004, TECH-002]
---
## Hypothesis
zip.js works under Bun so unit tests can exercise the same archive reader that
ships to browsers.

## Method + observations (exact)
1. Write path: `ZipWriter.add(name, new TextWriter(text))` under bun 1.4.0 →
   TypeError in zip.js `toCompatibleReadable` ("readable.getReader is not a
   function" on undefined) inside compatible-streams.js.
2. Read path: `new ZipReader(<Blob>).getEntries()` → same failure via
   streamToBlob → toCompatibleReadable during EOCDR search.

## Interpretation
zip.js assumes WHATWG stream semantics/constructors that differ under Bun 1.4.0;
both directions fail before any archive parsing happens.

## Limitations
Not tested under Node LTS or bundled-for-browser; the failure may be
Bun-specific only.

## Conclusion → AN-003, ADR-0005
fflate chosen as the single initial implementation; zip.js re-evaluation
deferred to large-file milestone (Q-004). Recorded also as RISK-003.
