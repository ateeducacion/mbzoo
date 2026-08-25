---
id: AN-001
title: Conventions adopted from reference repositories
date: 2026-08-24
sources: [REPO-001, REPO-002, REPO-003]
ai_tool: opencode
ai_model: ox-alpha
---
## Interpretation
MBZoo is a browser-first TS monorepo; the three references contribute process
discipline rather than code.

Adopted:
- Evidence discipline and stable IDs (REPO-001), `[PENDING]` markers.
- Append-only status ledger with risks; experiment records requiring commands +
  measurements (REPO-002).
- Generated indexes + drift checks in CI; machine-validated ADR metadata
  (REPO-002); `architecture-records.json` at root.
- Bun+TS+Biome+Playwright toolchain pattern; axe-core in E2E; Pages previews
  (REPO-003).

Rejected for MBZoo:
- Spanish-language mandate (MBZoo is English-only by prompt §23).
- Issue-numbered ADR IDs (no issues exist yet; plain monotonic ADR-NNNN).
- Not committing generated indexes (REPO-002's stance): MBZoo commits them so
  agents/contributors can read indexes without running tools; CI detects drift.
- PHP/Moodle-plugin machinery, Docker test runners.
