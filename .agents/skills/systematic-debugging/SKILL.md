---
name: systematic-debugging
description: Diagnose MBZoo failures by reproducing and isolating root cause before patching. Use for parser bugs, worker failures, renderer issues, flaky tests, and cross-browser differences.
---
# Skill: Systematic debugging

1. Reproduce first with the smallest safe input. Prefer a deterministic synthetic fixture or a minimal XML/archive fragment; do not start from an opaque real backup unless the bug requires it.
2. Identify the failing layer before editing: archive reader → XML parser → normalized model → worker transport → viewer state → renderer → browser/E2E.
3. Preserve the original error/warning and inspect the data crossing the layer boundary. Do not patch the first visible symptom if the invariant was violated earlier.
4. Add a failing regression test that captures the root cause. For security bugs include the malicious/malformed shape, not only the expected error message.
5. Make the smallest fix that restores the invariant. Avoid unrelated refactors while the failure is not yet explained.
6. Run the narrowest test repeatedly during diagnosis, then the relevant package suite, then `bun run check`.
7. Browser-only bug: reproduce with Playwright, inspect console/page errors and retained trace; do not hide flakiness with sleeps or retries (project retries are intentionally zero).
8. If the claim is performance-related, measure before and after and use `mbz-performance`; do not infer speed/memory improvements from code shape alone.
9. If real-world behavior reveals a durable Moodle-format fact, route that finding through `mbz-research` instead of leaving an uncited assumption in code/comments.
