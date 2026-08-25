---
name: web-quality-audit
description: Audit MBZoo viewer quality across performance, accessibility, privacy, resilience and browser behavior. Use for substantial UI changes or before releases.
---
# Skill: Web quality audit

Audit the current implementation, not aspirational features.

- Performance: identify main-thread work, large allocations/copies, eager previews, unnecessary object URLs and avoidable asset/network cost. Use `mbz-performance` for measured optimization work.
- Accessibility: verify keyboard operation, focus order/visibility, semantic labels, iframe titles, image alt text, readable errors/warnings and responsive layouts. Do not claim WCAG conformance without a dedicated conformance audit.
- Privacy: the viewer is local-first. No telemetry/analytics, no upload path, and no automatic network request derived from backup content.
- Security: backup content is hostile. Sanitized in-app HTML and sandboxed executable previews must follow ADR-0012/0014; load `mbz-security` for findings at trust boundaries.
- Resilience: malformed/unknown modules degrade to warnings or metadata fallback instead of breaking the course explorer.
- Cross-browser: use `browser-qa`; a passing Chromium-only flow is not enough for a release claim.
- Evidence: measure before/after for performance assertions. Durable benchmark claims belong in an EXP record via `mbz-research`.

Return concrete findings ordered by user/security impact, with the file or behavior responsible and a verification step for each proposed fix.
