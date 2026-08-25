---
id: EXP-003
title: Core parser against real-world and synthetic backups
date: 2026-08-24
status: completed
sources: [REPO-004]
ai_tool: opencode
ai_model: ox-alpha
---
## Objective
Prove openBackup() handles both container formats and real Moodle XML shapes.

## Fixtures
1. Real: PRDV103-2017-07-21-mbz.mbz (REPO-004), sha256
   77df2b34…f12cc, Moodle 3.3, TAR.GZ, flexsections format. Downloaded to temp
   only — never committed (privacy/licensing policy).
2. Synthetic: fixtures/files/demo-course-zip.mbz, deterministic fflate ZIP,
   sha256 ba998f3e…385f, committed.

## Measurements (bun 1.4.0, macOS arm64, 2026-08-24)
- prdv103.mbz (42 KB tgz): full parse (moodle_backup.xml + 15 section.xml +
  course.xml + files.xml) ≈ 7–9 ms; course "PRDV103: Interviewing Skills",
  15 sections, 25 activities, 7 file records.
- demo-course-zip.mbz: 9 ms; all assertions in unit tests pass.
- Playwright Chromium e2e (worker parse + render): passed, 202 ms test time.

## Limitations
Single real fixture; no multi-hundred-MB file tested yet (Q-006/Q-007).
flexsections showed sections without sequence coverage — warnings emitted,
no failures (RISK-002).

## Conclusion
Vertical slice architecture validated across formats; see final bootstrap report.
