---

id: AN-009
title: How Moodle restores qtype random, and what a repair may change
date: 2026-10-14
sources: [REPO-005, TECH-004, TECH-005, TECH-006, STD-001]
experiments: []
ai_tool: grok
ai_model: Grok 4.7
---

# AN-009: How Moodle restores qtype random, and what a repair may change

An analysis note is INTERPRETATION, not a decision. The decision is ADR-0037.

## Problem and motivation

Moodle 5.2 raises this while restoring some backups:

```text
Coding error detected, it must be fixed by a programmer:
You cannot restore a question with qtype "random".
It must be converted to a set reference instead.
```

The throw lives in `restore_create_categories_and_questions::process_question`
(`public/backup/moodle2/restore_stepslib.php` on the 5.2 and `main` trees).
Moodle 4.5 and 5.1 do not throw it. A repair that rewrites every
`<qtype>random</qtype>` would bypass the compatibility path Moodle already
runs for legitimate pre-4.0 backups.

## Facts

- REPO-005, tag `v4.5.0`: the tree has `backup/` at the repository root.
  `process_question` does not throw for `qtype` `random`.
- REPO-005, tag `v5.1.0`: `public/backup/moodle2/restore_stepslib.php` does
  not contain that coding exception.
- REPO-005, tag `v5.2.0` and branch `main`: `process_question` throws the
  text above when it is about to insert a question whose type is `random`.
- On the legacy path, the same step stashes `qtype` `random` and does not
  insert it. The quiz step converts an old `question_instance` when the
  module version is below `2022020300` (`restore_quiz_activity_structure_step`
  in `public/mod/quiz/backup/moodle2/restore_quiz_stepslib.php`).
- `backup_version_compare` uses the first eight digits of `backup_version`
  as a date stamp. `20220202` is the 4.0 question-bank gate. PHP
  `version_compare('', '4.0', '<')` is true, so a missing release with a
  version stamp still follows the version.
- A modern question bank entry wraps one or more questions as
  `question_bank_entry` / `question_version` / `question_versions` /
  `questions` / `question`. A legacy 3.x category stores
  `question_category/questions/question` with no bank entry.
- Quiz slots in a 4.x backup point at a bank entry through
  `question_reference` (`usingcontextid`, `component`, `questionarea`,
  `questionbankentryid`, `version`). A set reference uses
  `question_set_reference` (`usingcontextid`, `component`, `questionarea`,
  `questionscontextid`, `filtercondition`). Those child names are the ones
  written by `backup_quiz_activity_structure_step`.
- Moodle 4.3 through 5.2 convert a legacy filter JSON object
  `{"questioncategoryid":N,"includingsubcategories":0|1}` plus optional
  `tags: ["0,name"]` in `convert_legacy_set_reference_filter_condition`.
  Tag names are split on the first comma. A name that itself contains a
  comma is ambiguous.
- qtype_random in 3.11 stores the subcategory flag in `questiontext`:
  exactly `1` includes subcategories, exactly `0` does not.
- fflate `ZipPassThrough` (TECH-005) is stored content: compression method 0.
  It computes the CRC itself. It does not accept already-compressed DEFLATE
  payloads. fflate `Zip` does not emit ZIP64. Moodle rejects ZIP64.
- zip.js (TECH-004) can copy a precompressed entry when `passThrough` is
  set, but only if the caller supplies the compressed sizes, CRC and method.
  A wrong field silently corrupts the entry. MBZoo's reader is fflate
  (EXP-002); the writer stays on fflate so the two do not diverge.
- saxes (TECH-006) is a strict non-validating parser. MBZoo already caps
  entity expansion and does not resolve external entities (ADR-0006).
  Forbidden XML 1.0 control characters are detected by MBZoo's own scan.
- ustar checksums are specified by STD-001. A rewritten TAR header must
  pass the same check the reader records, or the next rebuild is refused.

## Interpretation

A `<qtype>random</qtype>` is not automatically corrupt.
1. Release older than 4.0, or a backup version stamp before `20220202`,
   is the legacy path. Moodle converts it. MBZoo must not rewrite it.
2. Release 4.0 or newer, with the random question as the only question
   inside one bank entry, a category `contextid`, a question text of `0`
   or `1`, and every referencing quiz slot already carrying
   `usingcontextid`, `component` and `questionarea`, can be expressed as
   the legacy filter JSON Moodle 4.3–5.2 already converts. The placeholder
   bank entry can then be removed. No bank-entry id, context id or question
   pool is invented.
3. Anything else (mixed versions in the same entry, a legacy slot that
   only has a question id, a comma inside a tag name, a question text that
   is not `0` or `1`, a missing category context) is diagnostic only.
4. An empty category is a separate warning. It is not filled in.
5. An orphan placeholder (no quiz slot points at it) is a deletion of that
   entry alone, and only after confirmation, because the record itself is
   lost even though no authored question is.

Lowering `moodle_release` or `backup_version` to force the legacy path
would select the wrong restore code for the rest of the backup. That is
not a repair.

## What was not run

No Moodle process restored a repaired file. Static reopen in MBZoo is not
that test. `DiagnosticReport.moodleRestoreVerified` stays false, and the
outcome note says restoration in Moodle has not been verified.

Docker and PHP were not available in the session that wrote this note, so
`public/mod/quiz/tests/backup/restore_39_test.php` was read as evidence of
Moodle's own legacy behaviour and was not executed here.

## Archive writer

A repaired ZIP stores every entry uncompressed, with a fixed timestamp
(`2023-11-14T00:00:00.000Z`) so the bytes do not depend on the clock.
Unchanged entries are copied from the source bytes, not recompressed from
a normalised model. A CRC mismatch blocks the rebuild: `ZipPassThrough`
would recompute the CRC and hide the mismatch. TAR.GZ is rewritten as
ustar plus gzip and refused above 512 MiB rather than truncated. The
original Blob is never written.
