---
id: ADR-0038
title: Archive additions and renames for MBZ Doctor
status: Proposed
date: 2026-10-15
sources: [REPO-005, TECH-005, STD-001]
experiments: []
related: [AN-010, ADR-0037, ADR-0004, ADR-0009, ADR-0016]
supersedes: []
ai_tool: grok
ai_model: Grok 4.7
---

# ADR-0038: Archive additions and renames for MBZ Doctor

## Context

ADR-0037 lets MBZ Doctor replace entries that are already in a backup and
copy every other entry into a new ZIP or TAR.GZ. The original Blob is never
written. A static reopen is not a Moodle restore (TASK-017, RISK-007).

AN-010 read Moodle 4.5 and 5.2. Three restore failures are not a text
replacement of an existing entry: one enclosing directory around the whole
backup, a missing `roles.xml` when no role id is present, a missing
`questions.xml` when nothing references the question bank, and a file
payload stored somewhere other than `files/<2 hex>/<sha1>` while
`files.xml` already has the right hash. Other restore strings depend on
the destination site or on records this backup does not contain.

`@mbzoo/core` stays on Web-platform APIs (ADR-0004). ZIP writing stays
fflate `ZipPassThrough` (TECH-005). TAR.GZ stays ustar plus gzip, capped
at 512 MiB (STD-001, ADR-0037). Nothing is uploaded (ADR-0009). This does
not supersede ADR-0016 or ADR-0037. Where ADR-0037 rules 1, 4, and 10
conflict with the rules below, this record wins.

## Problem

How can MBZ Doctor add a missing document, copy a verified payload, or
rename a single enclosing directory without turning the writer into a
general backup editor?

## Decision drivers

- A repair that guesses a role, a question, a context, or a hash can assign
  educational records to the wrong place.
- The original file stays untouched, and every entry that was not named in
  the plan keeps its bytes.
- Existing callers pass a replacement `Map`. That call shape keeps working.
- Empty XML that Moodle's writer would emit is still unverified until a
  live restore is recorded.

## Options considered

### Option A: Keep the replacement map only

No new writer surface. The enclosing directory, the missing root documents,
and the misplaced payload stay as warnings the user edits by hand.

### Option B: A typed add, rename, and omit plan — chosen

`rewriteArchive` accepts replacements, additions, renames, and omission of
an empty path. A `Map` argument is still replacements only. Output names
are checked before any archive byte is written.

### Option C: A general course serializer

Rebuild the backup from the normalized model, invent the missing records,
and flatten every directory. Unknown plugin XML and comments would not
survive.

## Decision

We will extend the ADR-0037 writer with a typed plan (Option B) and use it
only for the repairs named below.

Standing rules:

1. `rewriteArchive(source, plan | Map, options)` accepts
   `replacements`, `additions`, `renames`, and `omit`. A `Map` is
   replacements only. The source Blob is never written.
2. Every output name must pass `sanitizeTarName` unchanged, must not end
   in `/`, and must be unique. A rename or an add that collides with
   another output path throws before writing. An omitted path must already
   exist, must be empty, and must not also be replaced or renamed.
3. ZIP and TAR.GZ keep the ADR-0037 container rules: stored ZIP method 0,
   fixed ZIP time `2023-11-14T00:00:00.000Z`, ustar plus gzip, 512 MiB tar
   cap, no ZIP64. CRC mismatches, unsafe paths, duplicate paths, tar
   checksum failures, an unreadable container, a missing manifest, and more
   than one manifest still refuse the rebuild.
4. `archive.unwrap-root` is automatic and lossless. It is offered only when
   one manifest sits under one directory prefix, every entry starts with
   that prefix, each stripped path is unique and safe, and no ADR-0037
   integrity blocker is present. Plugin files are renamed, not dropped.
   XML is not edited because its directory changed. Any other layout keeps
   `archive.enclosed` and is not unwrapped.
5. `metadata.create-empty-roles` adds `roles.xml` whose root is
   `roles_definition` and whose body is empty. It is confirmation-required.
   It is refused when any scanned XML names a non-zero role id, when any
   XML file could not be scanned, or when a `roles.xml` already exists.
   A file whose root is not `roles_definition` is diagnostic only. No role
   is invented.
6. `questions.create-empty-bank` adds `questions.xml` whose root is
   `question_categories` and whose body is empty. It is
   confirmation-required. It is refused when any scanned XML depends on the
   question bank, when the scan is incomplete, or when `questions.xml`
   already exists. A different root is diagnostic only. No category,
   question, or quiz is created or deleted.
7. Rules 5 and 6 do not run from "Repair all safe issues". They stay
   confirmation-required until TASK-017 records a Moodle restore of those
   exact documents. `moodleRestoreVerified` stays false.
8. `files.recover-misplaced-content` copies bytes to
   `files/<2 hex>/<sha1>` only when a candidate at or below the hash budget
   hashes to the `contenthash` already in `files.xml`, the record is a
   physical file, the canonical path is absent, and the path is safe.
   `files.xml` is not rewritten. The original entry stays. A completed
   search with no match stays `files.missing`. A search that skipped an
   oversized candidate is `files.recovery-incomplete`, not missing content,
   and is not repairable. A hash mismatch is not repaired by storing a new
   hash. External aliases and directory records are not pool files.
9. `questions.multiple-top-categories` is manual. It is emitted only when
   `backup_release` is at least 3.5, the first eight digits of
   `moodle_version` are greater than `20180205`, and one context has more
   than one category whose parent is `0` or empty. Categories are not
   merged. Legacy attempt holes
   (`questionattemptreferstomissingquestion`,
   `questionattemptdatamissing`) are diagnostic and do not delete attempts.
   `unknown_context_mapping` is diagnostic and invents no context id.
   Dangling or duplicate `inforef` ids are diagnostic. A missing
   `inforef.xml` is not itself an error and is not synthesized.
10. `error_question_answers_missing_in_db` and
    `error_question_hint_missing_in_db` are not findings. They are matches
    against a question that already exists on the destination.
    `metadata.target-older` stays a warning: Moodle records
    `noticenewerbackup` on the warning list, and later steps may still
    fail. Release strings approximate `$CFG->version < moodle_version`.
    The declared version is never rewritten.
11. User conflicts, external aliases, `restorechecksumfailed`,
    `errorcopyingbackupfile`, `errorminbackup20version`, and
    `errorrestorefrontpagebackup` are not repaired from the file.
    Questions, activities, files, attempts, submissions, grades, users,
    and plugin XML are not deleted to clear a finding.
12. After writing, verification checks replaced bytes, renamed bytes,
    added bytes, and the absence of unexpected names. A pool addition
    must hash to the 40 hex digits in its path. The outcome note remains
    "Archive and structural validation passed. Successful restoration in
    Moodle has not been verified."

## Consequences

### Positive

- A wrapped backup and a verified misplaced payload can be repaired
  without editing XML.
- An empty role or question document is offered only after a local proof
  that nothing in the scanned backup needs it.
- Destination-dependent restore errors stay labelled as such.

### Negative

- The empty documents have not been restored by Moodle (TASK-017).
- A repaired ZIP is still stored and can be much larger than the original.
- A file above the hash budget can hide a matching payload. The finding
  then says the search was incomplete.

### Neutral

- ADR-0037 repairs (file size, illegal XML characters, one modern random
  question) keep their rules.
- Per-activity export is unchanged.

## Risks

A renamed or added entry can still fail on a real site, and a stored ZIP
can exceed what the browser will hold (RISK-007). The mitigation is the
proof list above, confirmation for the two empty documents, and the same
unverified-restore sentence.

## Validation

`packages/core/test/doctor-restore.test.ts` covers unwrap on ZIP and
TAR.GZ, the blocked layouts, both empty documents and their refusals, hash
recovery and its refusals, the top-category gate, legacy attempts, inforef
and context diagnostics, and the version warning. `e2e/doctor.spec.ts`
still covers the viewer repair flow. TASK-017 is open. No experiment
record exists: a disposable Moodle was not run for this decision.

## Follow-up work

- TASK-017: restore the empty documents, one unwrapped backup, and one
  recovered payload on Moodle 4.5 and 5.2. Record an EXP. Only then may a
  later ADR relax rule 7.
- Category consolidation and speculative XML repairs stay out until a
  single transformation is proven against Moodle.

## References

- AN-010, REPO-005, TECH-005, STD-001
- ADR-0037, ADR-0004, ADR-0009, ADR-0016

---

## Addendum: Investigation

The evidence log is AN-010. This addendum does not repeat it.

### Constraints

The plan is applied while entries are read. It does not assemble a second
copy of every payload before the write loop. Additions are sorted by path
so the output does not depend on `Map` order.

### Comparative matrix

| Criterion | A Replacement map | B Typed plan | C General serializer |
|---|---|---|---|
| Runtime | fflate / ustar | same | new writer |
| New dependency | no | no | no |
| Plugin XML | copied | copied or renamed | dropped |
| Wrong guess | user edits by hand | refused before write | silent data loss |

### Adversarial review

The chosen plan can still pass a file Moodle rejects. Rule 12 forbids
calling that a verified restore. Omit is limited to empty entries so a
rename cannot be used to delete a payload. Two additions of different
bytes at one path throw. "Repair all safe issues" passes
`confirmed: false`, so rules 5 and 6 do not run with it.

### Evidence

See AN-010. No command was run against Moodle, so there is no EXP record.
