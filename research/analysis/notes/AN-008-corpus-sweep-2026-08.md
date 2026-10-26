---
id: AN-008
title: What 114 real backups say about where MBZoo should go next
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: [EXP-004]
ai_tool: claude-code
ai_model: claude-opus-5
---

# AN-008: What 114 real backups say about where MBZoo should go next

An analysis note is INTERPRETATION, not a decision. It feeds an ADR (or
records why no ADR is needed).

## Problem and motivation

Every design decision so far rested on one synthetic fixture and three real
backups inspected by hand. This note runs the parser over a corpus — the
111 public Saylor backups (REPO-004) plus `SMR_SEGI`, `SMR_SOR_01_09` and a
CS401 duplicate, 114 files, 2.2 GB — and asks what the data says, not what
we assumed. Raw sweep output is reproducible from the method below; the
institutional backups are inspected locally and never vendored.

## Constraints

- Only what the parser exposes is measured: module names, section shape,
  file records, warnings, timing, peak memory. No content was rendered.
- All 114 are content-only (`users=0`). Nothing here says anything about
  user-data paths; the synthetic `demo-course-users.mbz` remains their only
  coverage (see Gaps).

## Method

```
bun run <sweep.ts>   # openBackupSession over each file; JSON per backup
```
Per backup: format, sections, activities, module counts, file records,
top file extensions, warnings, orphan activities, wall time. Course format
and section format options were read from `course/course.xml` and
`sections/section_N/section.xml` directly.

## FACTS

**Robustness.** 114 of 114 open. 0 parse errors, 0 warnings, 0 activities
outside a section. All are TAR.GZ; none is ZIP (Moodle ≥ 2.9 default,
MDL-41838). Releases: Saylor 2017 exports are 3.3+, the 2020 re-exports are
later, SMR is 3.1.4+.

**Course format.** 111 of 111 Saylor backups are `flexsections`, and every
one of their 3,755 sections carries `course_format_options` with `parent`
(a section *number*), `collapsed` and `visibleold`. Nesting reaches three
levels (`Unit 1 → 1.1 → 1.1.1`). The two SMR courses are `topics`.
Before ADR-0030 MBZoo flattened all of this with no warning — the "0
warnings" above was the parser being silent about the one thing it did not
model, which is the failure mode Q-002 predicted.

**Modules** (activities / backups containing them):

| module | activities | backups | note |
| --- | ---: | ---: | --- |
| url | 6,015 | 105 | **51 % of every activity in the corpus** |
| page | 4,650 | 113 | |
| resource | 646 | 49 | SMR: 265 `.elp` among these |
| label | 339 | 41 | |
| hvp | 106 | 4 | 2020 ESL/COMM courses; real H5P packages |
| assign | 52 | 3 | ENGL210 has 40 |
| book, quiz | 18 each | 2 | quiz and forum only in SMR |
| forum | 15 | 2 | |
| folder | 9 | 5 | |
| chat, feedback, glossary | 2 each | 2 | SMR |
| scorm | 1 | 1 | PRSM107 — the corpus's one real SCORM package |

**Files** (top extensions, all backups): png 19,433 · jpg 8,951 · json
6,664 · js 3,542 · gif 2,870 · css 1,857 · html 1,773 · xml 719 · pdf 406 ·
xsd 342 · data 337 · ico 337 · svg 300 · elp 265 · mp4 245 · docx 97 ·
jpe 96 · ttf/eot/woff 160 · swf 40. The `json`/`js`/`css` mass is H5P and
eXeLearning trees; `.data`/`.xsd` are eXeLearning internals; `.swf` (Flash)
appears only in SMR_SOR.

**Scale.** The largest are SMR_SOR (1,385 MB, 5,461 files) and SMR_SEGI
(400 MB, 32,150 files). The largest Saylor is 85 MB. Parse time was never
the problem — SMR_SOR opens in 2 s — memory was (EXP-004).

## Findings

1. **The corpus is half URLs.** MBZoo renders a `url` as one button and the
   address. For a Saylor-shaped course that is the primary content type, and
   the question a reviewer actually has — *where does this course send
   students, and is any of it dead?* — has no answer today. A course-level
   external-link inventory (by host, with the activities that point there)
   is the single highest-leverage view this corpus argues for. It also
   folds in the `scanExternalRefs` panel that already exists per activity.
2. **Section hierarchy was silently wrong for 97 % of the corpus.** Fixed by
   ADR-0030; recorded here because it is the clearest example of a warning
   that never fired: the parser had no concept to warn about.
3. **Experimental playback now has real targets.** ADR-0018 and ADR-0023
   both forbid compatibility claims beyond the synthetic fixture. The corpus
   supplies 106 real H5P activities across four backups and one real SCORM
   package (PRSM107). Verifying against them is what would let either leave
   experimental status — or show exactly what fails.
4. **Some content is dead on arrival and should say so.** `.swf` cannot play
   in any current browser. Offering a download card without saying that is
   an omission; a line naming it as Flash is honest and cheap.
5. **Shared-folder resources are the SMR norm, not an edge case.** Every
   SMR resource carries the unit's whole tree; ADR-0028 reads Moodle's
   marker instead of guessing. The corpus confirms the shape is common.
6. **Memory, not speed, was the ceiling.** EXP-004 measured 5.9× the
   compressed size at peak before ADR-0029, and the corpus's two largest
   files are exactly the shape that hits it.

## Gaps this corpus cannot close

- **No `users=1` backup.** Personal-data disclosure, gradebook marks,
  forum posts and submissions are exercised only by the synthetic fixture.
  A real one — taken from a test site, never an institutional export — is
  the next specimen to record under REPO-004.
- **No ZIP.** The lazy ZIP path (ADR-0029) was measured on a ZIP rebuilt
  from SMR_SEGI (EXP-004), not on a Moodle-produced ZIP; a Moodle < 2.9
  export or a `.mbz` re-saved by a tool would be the real thing.
- **No `weeks`, `social` or `singleactivity` course.** ADR-0030 handles
  the two formats seen; the others carry no hierarchy and should degrade to
  the flat list, but that is inferred from core Moodle, not observed.

## Recommendations → tracked as

- TASK-009 external-link inventory (finding 1)
- TASK-010 verify H5P and SCORM against the real packages (finding 3)
- TASK-011 name unplayable legacy content (finding 4)
- TASK-012 OPFS staging for TAR.GZ, the memory ceiling that remains (Q-007)
- TASK-013 record a `users=1` specimen (gap 1)
