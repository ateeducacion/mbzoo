# MBZ Doctor

MBZ Doctor inspects a Moodle `.mbz` on this device and, for a few verified
problems, downloads a new backup. The original file is never modified.

A file that reopens in MBZoo is not a file Moodle has restored. After a
repair the tool says:

> Archive and structural validation passed. Successful restoration in Moodle has not been verified.

That sentence is intentional. Static checks do not prove a restore.

## Analyze a backup

Open a backup as usual. **MBZ Doctor** appears in the course toolbar. The
tooltip is "Analyze this Moodle backup for errors and possible repairs."

If the course cannot be opened but the container can still be listed, the
error screen offers **Analyze archive**. Archive-level failures do not need
a full course model.

The target Moodle version is optional. Leave it blank and a
version-dependent issue stays conditional. It is not reported as an
unconditional error. Filling it in (for example `5.2`) compares the backup
with that release. An older target is a warning. The declared backup
version is not rewritten to slip past that check: Moodle would then run the
wrong restore code.

**Analyze Backup** runs in the existing parse worker. The page stays
usable. Cancel stops the scan. Findings can be filtered by severity,
category, repairability and activity. **Show activity** appears only when
that activity is in the open course.

Severity is a word plus a mark, not a color alone: critical (●), warning
(▲), info (○).

| Repairability | Meaning |
|---|---|
| Automatic | Safe to apply with **Repair All Safe Issues**. No authored record is removed. |
| Confirmation required | The preview must be read. If the change can discard or alter records, a checkbox is required. |
| Manual | Diagnosis only. MBZoo will not edit it. |
| Not repairable | The backup cannot supply the missing bytes, or editing it would hide a worse problem. |

## Repair and download

1. Select one or more repairs, or choose **Repair All Safe Issues** (automatic repairs only).
2. **Preview Changes** lists the files, the planned edits, and a before/after excerpt of those XML spans. The excerpt stays on the page.
3. Apply. Confirmation-required repairs wait for **Apply confirmed repairs**.
4. **Download Repaired MBZ** saves a new file. `course.mbz` becomes `course-repaired.mbz`. The name strips `.mbz`, `.zip`, `.tar.gz`, `.tgz` and `.gz` before adding `-repaired.mbz`.
5. **Reanalyze** scans that new file. The course explorer keeps the original until you open the download yourself.

If a repair fails, no download is offered and the original file is unchanged.

The download is a Moodle backup in the same container type (ZIP or TAR.GZ).
It is not the per-activity XML / HTML / ZIP export.

### Supported repairs

| Repair | When it runs | What changes | Safety |
|---|---|---|---|
| Declared file size | The SHA-1 of the stored bytes equals `contenthash`, and `<filesize>` does not equal that length. Files the backup excluded, directory records (filename `.`), and entries above the 8 MiB hash budget are not rewritten. | The `<filesize>` text only. The bytes stay. Running it again changes nothing. | Automatic. No content loss. |
| Illegal XML control characters | The entry contains a code point XML 1.0 forbids (U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE, U+FFFF). Tab, LF and CR stay. | Those code points are removed. Surrounding markup, unknown elements and comments stay. | Confirmation required. This can alter authored text. |
| Modern random question | See below. Every precondition has to hold, or nothing is edited. | Quiz `question_reference` elements that point at that bank entry become `question_set_reference` elements. The placeholder bank entry is removed. Other questions stay. | Confirmation required. Content loss is flagged only when no quiz slot references the placeholder, because that path deletes the record. |

A repair that does not change any bytes does not produce a download.

### Archive writer

Unchanged entries are copied. ZIP output is stored (compression method 0),
so a repaired ZIP can be much larger than the original. fflate
`ZipPassThrough` carries stored bytes; it does not copy an existing deflate
stream. Timestamps in the new ZIP are fixed
(`2023-11-14T00:00:00.000Z`) so the bytes do not depend on the clock.
TAR.GZ output is a new ustar archive plus gzip. A TAR.GZ whose
uncompressed payload would exceed 512 MiB is refused rather than
truncated. There is no ZIP64 writer. Do not treat this as support for
arbitrarily large backups.

These containers refuse a rebuild: unreadable archive, unsafe path,
duplicate path, TAR checksum failure, ZIP CRC mismatch, missing
`moodle_backup.xml`, more than one backup root. A CRC mismatch is refused
because a rewrite would store the same bytes under a newly computed CRC and
hide the mismatch. An extra directory around `moodle_backup.xml` is a
warning and is not stripped.

## `qtype "random"`

Moodle 5.2 can stop a restore with:

```text
Coding error detected, it must be fixed by a programmer:
You cannot restore a question with qtype "random".
It must be converted to a set reference instead.
```

The throw is in `restore_create_categories_and_questions::process_question`
on Moodle 5.2 and `main`. Moodle 4.5 and 5.1 do not throw it. The same
restore code already stashes a legacy random question and lets the quiz
step turn an old `question_instance` into a set reference. A backup that
takes that path is healthy. MBZ Doctor reports it as **Legacy random
question (Moodle restores this)** and does not rewrite it.

Do not "fix" the error by:

- lowering `moodle_release` or `backup_version`,
- deleting every random question,
- renaming `<qtype>random</qtype>` to another type.

Any of those can select the wrong restore code or drop the draw the quiz
was built around.

### When a repair is offered

All of the following have to be true:

- The backup release is 4.0 or newer, and the `backup_version` stamp is
  missing or at least `20220202`. A missing release with no version is
  unknown, and no repair is offered. A missing release with a version stamp
  follows the stamp. A target older than 4.0 is a compatibility warning,
  not a repair.
- The random question is the only question in its `question_bank_entry`.
- Its question text is exactly `0` or `1` (`1` includes subcategories, as
  `qtype_random` stored the flag). Any other text, including a sentence, is
  **Random question cannot be converted safely**.
- The category element has a `contextid`. That value is copied into
  `questionscontextid`. No context id is invented.
- Tag names contain no comma. Moodle splits a legacy tag on the first comma.
- Every quiz slot that references the bank entry already has
  `usingcontextid`, `component` and `questionarea`, and does not already
  contain a `question_set_reference`. A slot that only has a question id is
  not converted, and then the whole repair is skipped. `usingcontextid` is
  not invented.

The filter written is the legacy JSON Moodle 4.3 through 5.2 already
converts:

```json
{"questioncategoryid": 5, "includingsubcategories": 0}
```

Tags, when present, are copied as `"0,name"`. The category id is a JSON
number when it is a safe integer.

Whether Moodle 4.0–4.2 stores that JSON unchanged was not executed against
a live site. No Moodle process has restored a file this tool wrote
(TASK-017). Until that restore is recorded, treat the repair as a
structural edit with a documented target shape, and restore it on a
disposable course before using it with students.

An empty draw pool is a separate warning. The tool does not invent
questions to fill it. A slot that points at a bank this backup did not
include is not the same as a broken id: the bank may live on the original
site.

## What stays diagnostic

Missing activities, sections, question categories, file bytes and plugin
XML are reported and kept. A missing third-party module is not "missing
from the destination": the backup cannot see which plugins that site has
installed. Removed core modules (chat, survey, the old assignment) are
named from Moodle's own history. If the chosen target is older than the
removal, the finding is informational.

Usernames, emails, roles, grades, attempts and submissions are not edited.
A conflict with a user who already exists on the server cannot be seen from
the file. `users.xml` is not copied into the report.

External URLs, LTI tools, H5P libraries and SCORM runtimes are not fetched
or rebuilt. A `$@…@$` token is not requested. A SCORM or H5P activity with
no packed bytes is a warning, and only when the backup did not turn file
inclusion off.

Server memory, PHP time limits, upload size, disk space, permissions and
cron are not properties of the `.mbz`. They are not reported as corrupt
backup data.

## Rule catalog

| Id | Severity | Repair |
|---|---|---|
| `archive.unreadable` | critical | not repairable |
| `archive.extension` | info | not repairable |
| `archive.missing-root` | critical | not repairable |
| `archive.enclosed` | warning | manual |
| `archive.multiple-roots` | critical | manual |
| `archive.unsafe-path` | critical | not repairable |
| `archive.duplicate-path` | critical | not repairable |
| `archive.checksum` | critical | not repairable |
| `archive.crc` | critical | not repairable |
| `archive.ratio` | warning | not repairable |
| `xml.malformed` | critical | not repairable |
| `xml.utf8` | critical | not repairable |
| `xml.limit` | warning | not repairable |
| `xml.illegal-chars` | warning | confirmation required |
| `metadata.no-target` | info | not repairable |
| `metadata.target-older` | warning | not repairable |
| `sections.missing` | warning | not repairable |
| `sections.cycle` | warning | manual |
| `activities.missing` | critical | not repairable |
| `activities.missing-module` | warning | not repairable |
| `activities.undeclared` | warning | manual |
| `activities.duplicate` | warning | manual |
| `activities.bad-section` | warning | manual |
| `files.excluded` | info | not repairable |
| `files.missing` | critical | not repairable |
| `files.hash` | critical | not repairable |
| `files.size` | warning | automatic |
| `files.hash-skipped` | info | not repairable |
| `files.unreferenced` | info | manual |
| `questions.legacy-random` | info | not repairable |
| `questions.random-modern` | critical | confirmation required |
| `questions.random-blocked` | critical | manual |
| `questions.category-cycle` | warning | manual |
| `questions.missing-parent` | warning | manual |
| `questions.empty-pool` | warning | not repairable |
| `questions.outside-bank` | info | not repairable |
| `questions.bad-filter` | warning | manual |
| `questions.duplicate-id` | warning | manual |
| `plugins.removed` | warning | not repairable |
| `plugins.unknown-module` | info | not repairable |
| `plugins.unknown-qtype` | info | not repairable |
| `userdata.excluded` | info | not repairable |
| `userdata.missing` | warning | not repairable |
| `userdata.malformed` | warning | manual |
| `references.token` | info | not repairable |
| `embedded.package` | warning | not repairable |

The English sentences for each id live in `packages/core/src/doctor/catalog.ts`.
The viewer shows a title, an explanation and a consequence in English,
Spanish and French.

## Reports

**Download Diagnostic Report** is JSON. It is English technical text from
`@mbzoo/core`. **Download readable report** follows the language of the
page. Both omit question text, file bytes, passwords, usernames and email
addresses. Before/after XML stays on screen and is replaced with
`[omitted]` in the JSON.

## Check the result in Moodle

1. Restore the downloaded file onto a disposable course, on the Moodle
   version you actually use.
2. Open the activity the finding named. For a random-question repair, start
   a quiz preview and confirm the slot still draws from the same category.
3. If Moodle rejects the file, keep the original and the report. Do not
   keep applying the same repair: a second run finds nothing left to change
   when the first one succeeded.

These checks have been run in MBZoo's unit tests and in the browser against
synthetic backups: ZIP and TAR.GZ round-trips, the size repair, the illegal
character repair, the modern random-question preconditions, and the refusal
to rewrite a legacy 3.x random question. They have not been run inside
Moodle. Source compared while designing the rule: Moodle 3.x question
shape, 4.0 bank entries, 4.3–5.2 legacy filter conversion, 4.5, 5.1 (no
throw) and 5.2 / `main` (the throw above). See AN-009 and ADR-0037.

## Privacy

The scan, the preview and both downloads stay in the browser. Nothing is
uploaded. A report can still name archive paths. Do not publish a report
from a backup that contains people if those paths would identify a course
or a person. See [Privacy](/PRIVACY).
