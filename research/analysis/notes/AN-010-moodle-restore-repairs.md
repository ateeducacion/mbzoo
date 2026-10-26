---

id: AN-010
title: Which Moodle restore failures can be repaired from the backup alone
date: 2026-10-15
sources: [REPO-005, TECH-005, STD-001]
experiments: []
ai_tool: grok
ai_model: Grok 4.7
---

# AN-010: Which Moodle restore failures can be repaired from the backup alone

An analysis note is INTERPRETATION, not a decision. The decision is ADR-0038.
It extends ADR-0037. It does not replace it.

No frequency claim is made. An identifier existing in Moodle's source does
not mean teachers hit it often. No disposable Moodle restored any file
written by these repairs (TASK-017). `moodleRestoreVerified` stays false.

The PHP below was read from Moodle 4.5 (`MOODLE_405_STABLE`, paths without
`public/`) and Moodle 5.2 (`MOODLE_502_STABLE`, paths under `public/`).
Where both trees were opened, the cited behaviour matches. Line numbers
are the 5.2 copies unless a 4.5 line is named.

## Problem and motivation

ADR-0037 can replace an existing XML entry. Several restore failures are
not that shape: the manifest is one directory too deep, `roles.xml` or
`questions.xml` was never packed, or the file bytes exist under the wrong
archive path. Other well-known restore strings depend on the destination
site. Those must stay diagnostic.

## Facts

### Enclosing directory

Moodle's backup FAQ tells the user to compress the contents of the
extracted folder, not the folder itself. Restore looks for
`moodle_backup.xml` at the backup root. MBZ Doctor already reports
`archive.enclosed` when the only manifest sits under a prefix. Stripping
that prefix does not change XML. It is safe only when one manifest exists,
every entry shares the prefix, no destination collides or escapes, and the
archive has no integrity blocker from ADR-0037.

### `missing_roles_xml_file`

`restore_dbops::load_roles_to_tempids` throws
`backup_helper_exception('missing_roles_xml_file')` when the file does not
exist (4.5 line 150, 5.2 line 150). Prechecks and
`restore_load_and_map_roles` both call it on `$basepath/roles.xml` unless
role information was already preloaded (5.2 `restore_stepslib.php` lines
1106–1115, `restore_prechecks_helper.class.php` lines 166–168). The users
setting does not skip this call.

`backup_final_roles_structure_step::define_structure` returns a
`roles_definition` element (5.2 `backup_stepslib.php` lines 807–833). An
empty selection still writes that root. The root is not `roles`.

An empty document is a reconstruction of "no roles were selected", not a
proof that the original file was empty. It is safe only when every scanned
XML file contains no role id. A role id with no definition cannot be
invented. A file that exists but has another root is a different document
and is not replaced.

### `missing_questions_xml_file`

`restore_dbops::load_categories_and_questions_to_tempids` throws
`missing_questions_xml_file` when `questions.xml` is absent (4.5 and 5.2,
line 457). `restore_load_categories_and_questions` always passes
`$basepath/questions.xml` unless the information was preloaded (5.2
`restore_stepslib.php` lines 1578–1586). Prechecks do the same (5.2 lines
175–178).

`backup_questions_structure_step::define_structure` roots the document at
`question_categories` (5.2 `backup_stepslib.php` line 2629). An empty bank
is that root with no category. Modern bank entries are children of a
category, so an empty document does not need them.

Any scanned tag that names a question, a question reference, a question
instance, a question category, or an `inforef` question id means the bank
was required. Deleting a quiz to make the file look empty would drop
course content. Unknown plugin XML that contains those tags blocks the
repair.

### Misplaced content hash

`backup_file_manager::get_backup_content_file_location` returns
`"$l1/$contenthash"` where `$l1` is the first two characters (4.5 and 5.2
`backup_file_manager.class.php` lines 54–57). `send_files_to_pool` joins
that to the backup's `files/` directory and, when files are included and
the record is not an external alias, reports the file missing if that path
does not exist (5.2 `restore_dbops.class.php` lines 1078–1097). A directory
record (`filename` `.`) is created as a directory and is not looked up in
the pool (lines 1042–1053). An empty `contenthash` is skipped with a
warning. An alias (`repositoryid` set) is not a pool file.

Copying bytes onto `files/<2 hex>/<40 hex>` is justified only when those
bytes hash to the `contenthash` already stored in `files.xml`. Recalculating
`contenthash` from damaged bytes would hide corruption. The original entry
stays, so the copy does not discard the misplaced payload.

Entries above the hash budget are not hashed. If the search stops because
of that, the file is not the same as a completed search that found nothing.

### `restoremultipletopcats`

`restore_dbops::prechek_precheck_qbanks_by_level` counts categories with
`parent == 0` (5.2 lines 662–663, same test at 4.5 line 743's surrounding
block). It appends `restoremultipletopcats` only when
`$after35 && $topcats > 1` (5.2 lines 789–791). `$after35` is
`backup_release_compare('3.5', '>=') && backup_version_compare(20180205, '>')`
(4.5 line 584, 5.2 line 613).

`restore_plan::backup_version_compare` takes the first N digits of
`moodle_version`, where N is the length of the argument, and compares that
integer (4.5 `restore_plan.class.php` lines 223–226, 5.2 lines 234–237).
For `20180205` that is eight digits of `moodle_version`, not
`backup_version`. `backup_release_compare` uses `backup_release`. A missing
`moodle_version` does not satisfy the eight-digit match, so the precheck
does not fire. The English string is in `question.php`: "The backup file
contains more than one top-level question categories for context {$a}."

Merging two roots changes which questions a set filter can draw. No merge
was proven.

### Legacy attempts

`restore_stepslib.php` `process_legacy_quiz_attempt_data` throws
`questionattemptreferstomissingquestion` when `get_mappingid('question',
$questionid)` fails (4.5 line 6478, 5.2 line 6757). It throws
`questionattemptdatamissing` when the matching session or the states are
empty (4.5 line 6494, 5.2 line 6773). Question id `0` is skipped. The paths
are `states/state` and `sessions/session`. Deleting attempts would drop
student history. The records are not reconstructed from nothing.

### Answers and hints

Moodle 4.5 `restore_qtype_plugin::process_question_answer` throws
`error_question_answers_missing_in_db` in the branch where the question
was not created by this restore and the answer text is not in the
destination `question_answers` row (4.5 `restore_qtype_plugin.class.php`
lines 220–227). The same pattern exists for hints
(`error_question_hint_missing_in_db`, 4.5 `restore_stepslib.php` line 5394
and 5.2 line 5568). The throw needs the destination database. A backup that
contains answer text is not, by itself, this error. No finding is emitted
for it.

### `unknown_context_mapping`

`restore_dbops::send_files_to_pool` throws
`restore_dbops_exception('unknown_context_mapping', $oldcontextid)` when
the old context has no mapping and no forced new context was supplied
(4.5 line 955, 5.2 line 979). The mapping is built while activities and
other contexts are restored. An id that no other element in the backup
declares is an archive-side hole. An id that the backup does declare can
still fail if the destination drops that activity. Inventing a context id
would point the file at the wrong place. The diagnostic fires only when
the known set is non-empty and the scan of those XML files finished.

### `inforef.xml`

`load_inforef_to_tempids` throws `missing_inforef_xml_file` if it is asked
to open a path that does not exist (5.2 lines 122–123).
`restore_load_included_inforef_records` calls it only inside
`if (file_exists($inforefpath))` (5.2 lines 1036–1041). A component with
no references can omit the file. A dangling id inside a file that does
exist is a local inconsistency. Guessing the missing references would
attach the wrong users, roles, or files. No `inforef.xml` is synthesized.

### Newer backup, users, and server errors

`restore_prechecks_helper::execute_prechecks` appends
`noticenewerbackup` to `$warnings`, not `$errors`, when
`$CFG->version < $controller->get_info()->moodle_version` (4.5 and 5.2,
lines 98–105). The same method appends `errorminbackup20version` when
`backup_version < 2010072300`, and `errorrestorefrontpagebackup` when the
target course is the site front page (lines 90–96 and 114–118). Changing
the declared version would select a different restore path.

User conflicts are raised from `precheck_included_users` as
`restoreuserconflict`, `restorecannotcreateuser`, and
`restoremnethostidmismatch` (5.2 `restore_dbops.class.php` lines 1732–1752,
4.5 lines 1708–1728). They compare the backup with destination accounts.

`errorcopyingbackupfile` (`backup.php`) and `restorechecksumfailed`
(`error.php`) describe copying into the server temp directory and session
state. They are not properties of the `.mbz`.

## Constraints

- `@mbzoo/core` stays on Web APIs (ADR-0004). The writer stays fflate for
  ZIP and ustar plus gzip for TAR.GZ (TECH-005, STD-001, ADR-0037).
- Nothing is uploaded.
- Questions, attempts, activities, sections, users, and plugin XML are not
  deleted to clear a finding.
- A repair that adds XML the Moodle writer would emit still needs a live
  restore before it is called verified (TASK-017).

## Options and comparative matrix

| Criterion         | Replace-only writer     | Typed add/rename plan               | General backup editor        |
| ----------------- | ----------------------- | ----------------------------------- | ---------------------------- |
| Runtime           | fflate, already shipped | same writer, more plan fields       | new serializer               |
| Unrelated bytes   | copied                  | copied, plus named adds and renames | easy to drop                 |
| Empty `roles.xml` | impossible              | one added document                  | could invent roles           |
| Wrapped root      | reported only           | prefix rename when the proof holds  | could flatten the wrong tree |
| Misplaced file    | reported missing        | copy after SHA-1 match              | could rewrite the hash       |

## Adversarial review

- **Replace-only:** cannot fix the three cases above without pretending an
  entry already exists.
- **Typed plan:** an add or a rename can still drop a file if verification
  assumes the entry set is unchanged. Verification has to name every
  expected output path. An omitted path must be empty.
- **General editor:** would invent the records Moodle is missing and hide
  the original error. Rejected.
- **Empty documents:** a plugin file that was not scanned can still name a
  role or a question. The repair stays off unless the XML scan finished.
  Even then, Moodle has not restored the bytes we write.
- **File recovery:** hashing every small entry until the first match can
  miss a later identical copy. The first match is enough because the hash
  is exact. An oversized candidate with no match must not be called missing.
- **Top-level categories:** an empty-looking root can still be the parent
  a filter uses. No automatic merge.
- **False positive on `restoremultipletopcats`:** comparing `backup_version`
  instead of `moodle_version` would not match
  `backup_version_compare`. The gate uses `backup_release` and the first
  eight digits of `moodle_version`.

## Synthesis (decision input)

ADR-0038 should allow add, rename, and omit-empty on the existing writer,
and should offer:
- unwrap of one proven enclosing directory (automatic),
- empty `roles_definition` and empty `question_categories` only when no
  scanned reference needs them (confirmation required until TASK-017),
- copy of a payload to its content-hash path when the SHA-1 matches
  (automatic).

It should diagnose, and not repair, multiple top-level categories, legacy
attempt holes, unknown context ids, and dangling or duplicate `inforef`
ids. It should not emit a finding for answer or hint text merely because
the backup contains it. It should describe `noticenewerbackup` as a
warning. It should not rewrite versions, users, hashes, or educational
records.
