---
name: mbz-fixture
description: Create or modify synthetic test Moodle backups safely. Use when adding fixtures, changing the generator, or documenting real-world specimens.
---
# Skill: MBZoo fixtures
1. Committed fixtures MUST be synthetic and deterministic. Edit
   `fixtures/scripts/generate-fixture.ts`, never the binary artifacts.
2. Regenerate: `bun run fixtures/scripts/generate-fixture.ts`.
3. Update `fixtures/manifest.yaml` with the new sha256/bytes; a changed
   checksum of an unchanged generator is a regression to investigate.
4. Real-world specimens (e.g. REPO-004 saylordotorg): download ad hoc to temp,
   record sha256 + provenance in manifest `external:` section, NEVER commit,
   never commit anything containing user data.
5. Extend `packages/core/test/` expectations when fixture content changes.
