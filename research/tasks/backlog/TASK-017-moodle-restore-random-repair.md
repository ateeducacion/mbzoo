---
id: TASK-017
title: Restore a repaired random-question backup in Moodle
status: open
priority: high
---

ADR-0037 allows one modern `<qtype>random</qtype>` shape to be rewritten as
a `question_set_reference` plus removal of that placeholder bank entry.
AN-009 read Moodle 4.5, 5.1, 5.2 and `main`, including
`public/mod/quiz/tests/backup/restore_39_test.php`, and did not execute
them. `DiagnosticReport.moodleRestoreVerified` stays false until this task
records a real restore.

Do it on a disposable Moodle 5.2 (and, if the same file is claimed for an
older target, on that version too):

1. Build the synthetic backup already covered by
   `packages/core/test/doctor.test.ts` (modern bank entry, one random
   question, a quiz slot with `usingcontextid` / `component` /
   `questionarea`).
2. Confirm Moodle 5.2 rejects the unrepaired file with
   `You cannot restore a question with qtype "random". It must be converted to a set reference instead.`
3. Apply the MBZ Doctor repair and restore the new file.
4. Check that the slot draws from the same category, that subcategory
   inclusion matches question text `0` or `1`, and that other questions in
   the bank are still present.
5. Write an EXP record with the Moodle version, the command, and the
   result. Only then may a later ADR set `moodleRestoreVerified` to true
   for that case.

A legacy 3.x backup must still be left unrewritten and restored by Moodle's
own conversion, not by this repair.

ADR-0038 adds three more shapes that this task must restore before anyone
sets `moodleRestoreVerified` for them. None of these was executed on a
disposable Moodle while the records were written (2026-10-15). Structural
checks in `packages/core/test/doctor-restore.test.ts` are not a substitute.

1. Empty `roles.xml`. The document is the Moodle 5.2 writer root
   `roles_definition` with no `role` child. Restore it only on a backup
   that names no role id. Confirm `restore_dbops::load_roles_to_tempids`
   accepts the file and that the course still has its activities.
2. Empty `questions.xml`. The document is `question_categories` with no
   category. Restore it only on a backup that does not reference the
   question bank. A backup that does reference the bank must still be
   refused by MBZ Doctor, not given a fake category.
3. One enclosing directory removed, and one payload copied to
   `files/<2 hex>/<sha1>` after its SHA-1 matched. Confirm the restored
   course shows that file. The original misplaced entry may remain in the
   archive; Moodle reads the canonical path.

Until those restores are recorded, the empty documents stay
confirmation-required and the outcome note stays unverified.
