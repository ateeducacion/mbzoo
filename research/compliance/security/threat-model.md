# Threat model (bootstrap scope)

Every .mbz is untrusted input processed client-side.

## Mitigated at bootstrap
| Threat | Mitigation | Test |
|---|---|---|
| Path traversal / Zip Slip (tar) | sanitizeTarName rejects absolute paths, `..`, control chars | archive.test.ts |
| XML entity expansion / billion laughs | decoded-text budget in parseXmlEvents | xml-security.test.ts |
| XXE external entities | saxes never fetches; no resolver configured | xml-security.test.ts |
| Malformed XML | strict parser errors → MbzParseError | xml-security.test.ts |
| Oversized documents | MAX_XML_BYTES cap | enforced in code |
| Script injection via backup strings | textContent-only DOM writes; no innerHTML | code review + e2e |

## Designed for, not yet implemented
- Sandboxed iframe launcher for SCORM/H5P/HTML (ADR-0009 rules; Q-011).
- Archive bombs via extreme ZIP compression ratios — bounded by entry-size
  checks planned with TASK-003.
- Blob URL lifecycle leaks; popup escape; SVG script execution.

## Non-goals
Server-side hardening: MBZoo ships no server. Privacy model: docs/PRIVACY.md.
