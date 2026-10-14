---
id: ADR-0037
title: Repair-only full backup rewrite
status: Proposed
date: 2026-10-14
sources: [REPO-005, TECH-004, TECH-005, TECH-006, STD-001]
experiments: []
related: [AN-009, ADR-0004, ADR-0006, ADR-0009, ADR-0016, ADR-0036]
supersedes: []
ai_tool: grok
ai_model: Grok 4.7
---

# ADR-0037: Repair-only full backup rewrite

## Context

ADR-0016 ships a per-activity export (module XML, rendered HTML, files ZIP)
and stops there. A whole Moodle `.mbz` was still read-only. Moodle 5.2 can
refuse a backup that still contains `<qtype>random</qtype>` on the modern
question-bank path, while a legitimate pre-4.0 backup of the same question
type is converted by Moodle's own restore code (AN-009, REPO-005). Teachers
need a way to see that difference and, where the structure is unambiguous,
download a new backup.

`@mbzoo/core` stays on Web-platform APIs (ADR-0004). ZIP reading is fflate
(TECH-005). zip.js (TECH-004) can copy a precompressed entry, and it is not
the reader. XML is parsed with saxes under the existing budgets (TECH-006,
ADR-0006). TAR headers follow ustar (STD-001). The normalized course model
drops plugin XML, comments and unknown elements, so it cannot be the source
of a rewritten backup. Nothing may be uploaded (ADR-0009).

## Problem

How can MBZoo write a new `.mbz` that applies a few verified repairs, keep
every unrelated entry, and avoid claiming that Moodle will restore the
result?

## Decision drivers

- Educational content is kept unless the user confirms a change that alters
  records.
- No new dependency, and no second archive implementation that CI does not run.
- The original file is never modified.
- A repair must not select a different Moodle restore path by editing
  `moodle_release` or `backup_version`.
- A static reopen in MBZoo is not a Moodle restore.

## Options considered

### Option A: Diagnosis only

Report problems and leave writing to the user. Nothing can be damaged. The
random-question case still has to be edited by hand.

### Option B: Repair-only rewrite on fflate — chosen

Copy the archive into a new Blob. Replace only entries named by an approved
repair plan. ZIP entries are stored uncompressed. TAR.GZ is a new ustar
stream plus gzip.

### Option C: Copy precompressed ZIP entries with zip.js

`passThrough` can keep the original deflate bytes when every size, CRC and
method field is supplied. A wrong field corrupts the entry. The reader does
not use zip.js (TECH-004).

### Option D: Rebuild XML from the normalized model

Smaller code, and it drops every element the parser does not understand.

## Decision

We will rewrite a full backup only as MBZ Doctor repair output (Option B).
This does not supersede ADR-0016 and it is not a general course editor.

Standing rules:

1. `rewriteArchive` takes an explicit replacement map. Every other entry is
   copied. The source Blob is never written.
2. Do not offer "export this course as an .mbz" from the activity toolbar.
3. A repaired ZIP stores every entry with fflate `ZipPassThrough` (method 0)
   and the fixed timestamp `2023-11-14T00:00:00.000Z`. `ZipPassThrough` is
   not a precompressed-deflate copy. fflate does not emit ZIP64. The repaired
   ZIP can be larger than the original.
4. A CRC mismatch, an unsafe path, a duplicate path, a tar checksum failure,
   an unreadable container, a missing `moodle_backup.xml`, or more than one
   backup root refuses the rebuild. An enclosing directory is reported and
   is not stripped.
5. TAR.GZ output is ustar plus gzip. Above 512 MiB the rebuild throws. It
   does not truncate. The gzip result is still one buffer (RISK-007).
6. `moodle_release` and `backup_version` are never edited to choose another
   restore path.
7. Questions, activities, files, attempts, submissions and plugin XML are
   not deleted to make a file look valid. The one exception is the modern
   random placeholder below, and only after confirmation.
8. A `<qtype>random</qtype>` on the legacy path (release older than 4.0, or
   a `backup_version` stamp before `20220202`) is informational. It is not
   rewritten. On the modern path the repair runs only when the bank entry
   holds that single random question, its text is `0` or `1`, the category
   has a context id to copy, tag names contain no comma, and every quiz
   slot that points at the entry already has `usingcontextid`, `component`
   and `questionarea` and does not already have a `question_set_reference`.
   The slot becomes a `question_set_reference` whose filter is the legacy
   JSON Moodle 4.3–5.2 converts. No bank-entry id, context id or question
   pool is invented. Any slot that cannot be converted blocks the whole
   repair. An orphan placeholder may be removed only after confirmation,
   and that removal is marked as content loss.
9. Confirmation-required repairs do not run unless the caller passes
   `confirmed: true`. "Repair all safe issues" sends automatic repairs
   only. A failed plan throws and returns no Blob.
10. After writing, the new archive is reopened. Entry names must match.
    Replaced entries must equal the written bytes. Every other entry's
    uncompressed bytes must equal the source. The outcome note is:
    "Archive and structural validation passed. Successful restoration in
    Moodle has not been verified." `moodleRestoreVerified` stays `false`
    until TASK-017 records a real Moodle restore.
11. Downloaded reports omit question text, file bytes, passwords, usernames
    and email addresses. The on-screen preview may show the XML diff.
12. The scan does not run during ordinary course open.

## Consequences

### Positive

- A teacher can download a new `.mbz` for a declared file size, for illegal
  XML control characters, and for the one modern random-question shape
  above.
- Unrelated bytes, including unknown plugin XML, stay in the archive.
- The original file remains available if the download is discarded.

### Negative

- A repaired ZIP is stored, so it can be much larger than a deflated backup.
- TAR.GZ rebuilds above 512 MiB are refused.
- The random-question repair has not been restored by Moodle in this
  repository (TASK-017).
- Original ZIP timestamps and compression methods are not preserved.

### Neutral

- Per-activity export is unchanged.
- Legitimate pre-4.0 random questions are left for Moodle to convert.

## Risks

A repaired archive can still fail on a real site, and a stored ZIP or a
large TAR.GZ can exceed what the browser will hold (RISK-007). The
mitigation is to refuse unsafe containers, require confirmation for
content-changing edits, and say in the product that Moodle restore was not
verified.

## Validation

`packages/core/test/doctor.test.ts` covers detection, the random-question
preconditions, both archive formats, idempotence, and the refusal cases.
`e2e/doctor.spec.ts` covers the viewer flow. TASK-017 is the Moodle restore
check and is still open. No experiment record exists: Docker and PHP were
not available when this decision was written.

## Follow-up work

- TASK-017: restore the synthetic modern random-question backup on Moodle
  5.2 and record the result.
- A precompressed ZIP copy stays out until an experiment shows that every
  required zip.js field can be filled from the reader without corrupting
  an entry.
- OPFS staging for very large TAR.GZ remains TASK-012.

## References

- AN-009, REPO-005, TECH-004, TECH-005, TECH-006, STD-001
- ADR-0004, ADR-0006, ADR-0009, ADR-0016, ADR-0036

---

## Addendum: Investigation

The evidence log is AN-009. This addendum records the choice among writers
and the repair boundary. It does not add a second analysis of Moodle's
restore code.

### Constraints

- Portable core: `Blob`, `Uint8Array`, `DecompressionStream`, fflate.
- Hostile input: unsafe paths and duplicate names are already dropped or
  recorded by the readers. A rewrite must not resurrect them.
- Unknown XML must survive. Edits are range splices on the original text,
  not a serializer fed by the normalized model.

### Comparative matrix

| Criterion | A Diagnosis only | B Stored fflate rewrite | C zip.js passThrough | D Model rebuild |
|---|---|---|---|---|
| Runtime | core | core, fflate already in use | zip.js, unused by the reader | core |
| New dependency | no | no | no, but a second writer | no |
| Unrelated bytes | untouched | copied | copied if metadata is exact | dropped |
| Failure mode | user edits by hand | larger ZIP; no ZIP64 | a wrong field corrupts the entry | silent data loss |
| Privacy | local | local | local | local |

### Option notes

Option C stays available later. It was rejected now because EXP-002 already
retired zip.js as the read path, and `passThrough` trusts caller-supplied
CRC and sizes. Option D conflicts with the reason the normalized model is
lossy. Option A does not meet the request to download a repaired backup
for the one case Moodle's own code already documents.

### Adversarial review

- Stored output can blow past a browser download limit. The writer returns
  one Blob or throws. It does not advertise unbounded backups.
- Recomputing a CRC over bytes whose stored CRC already mismatches would
  hide corruption. That case refuses the rebuild.
- Stripping illegal XML characters can remove bytes inside authored text.
  The step is confirmation-required and marked as content loss.
- Converting a random question by renaming `qtype`, or by lowering the
  backup version, would hit the wrong Moodle code. Both are forbidden.
- The legacy filter JSON is what Moodle 4.3–5.2 converts. Whether Moodle
  4.0–4.2 stores that JSON unchanged was not executed against a live site.
  The repair is therefore not labelled verified in Moodle.
- The worker posts the repaired bytes back to the page. A file the browser
  cannot hold fails the operation. The source file is unchanged.

### Evidence

Facts about the 5.2 throw, the legacy stash path, the filter JSON, fflate
`ZipPassThrough`, and ustar checksums are in AN-009 and cite REPO-005,
TECH-004, TECH-005, TECH-006 and STD-001. No Moodle process restored a
file produced by this writer.
