---
name: release-check
description: Pre-release gate checklist for MBZoo. Use before publishing a version or deploying.
---
# Skill: Release check
Run in order; stop on first failure:
1. `bun run check` (lint/format/typecheck/unit/build/research validation)
2. `bun run test:e2e` (all configured browser projects)
3. Fixture integrity: regenerate fixtures, confirm manifest checksums unchanged.
4. Licensing: re-run dependency review vs `research/compliance/licensing/dependency-report.md`; no GPL contamination in shipped deps.
5. Generated indexes fresh: `bun run research:indexes -- --check` clean.
6. Docs truth pass: README Implemented/Planned sections match reality; no advertised-but-missing features.
7. Security: threat model still accurate (`research/compliance/security/threat-model.md`); no new untrusted-content surface without ADR.
8. Deployment (only when explicitly authorized): Pages workflow green, CSP headers intact.
