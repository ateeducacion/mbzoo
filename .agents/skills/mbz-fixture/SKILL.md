---
name: mbz-fixture
description: Create or modify synthetic test Moodle backups safely. Use when adding fixtures, changing the generator, or documenting real-world specimens.
---
# Skill: MBZoo fixtures

1. Committed `.mbz` fixtures MUST be synthetic, deterministic and free of real user/institution data. Edit `fixtures/scripts/generate-fixture.ts`; do not hand-edit generated binary archives.
2. Regenerate with `bun run fixtures/scripts/generate-fixture.ts`.
3. Keep `fixtures/manifest.yaml` synchronized with generated sha256, byte size, format, intended schema shape and expected parser result. Unexpected checksum drift is a regression to investigate, not something to bless automatically.
4. Real-world specimens such as REPO-004 are verification inputs only: download ad hoc to a temporary location, record provenance + sha256 under `external:`, and never commit the specimen.
5. Add the smallest synthetic case that reproduces a format/security edge rather than depending on a large real backup in routine tests.
6. Extend parser/renderer expectations when fixture semantics change, then run targeted tests followed by `bun run check`.
