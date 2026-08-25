> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/guide/activity-support.md.

# Activity & content support

MBZoo renders what the backup actually contains, and is transparent about
what it cannot do. Unknown third-party plugins never break the course view.

| Moodle module                                 | Inspect                       | Render / preview                | Notes                                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page                                          | ✅                             | ✅ sanitized HTML                | ADR-0012/0013                                                                                                                                                                                                            |
| Label                                         | ✅                             | ✅ sanitized HTML                |                                                                                                                                                                                                                          |
| URL                                           | ✅                             | ✅ external link                 | never fetched automatically                                                                                                                                                                                              |
| Resource / File                               | ✅                             | ✅ inline preview                | PDF via pdf.js canvas, images, text, sandboxed HTML (ADR-0014)                                                                                                                                                           |
| Folder                                        | ✅                             | ✅ file cards                    |                                                                                                                                                                                                                          |
| HTML page w/ CSS+JS                           | ✅                             | ✅ sandboxed iframe              | opaque origin + CSP; scripts isolated from the app (ADR-0014). Links inside a multi-page site (e.g. an eXeLearning export) navigate through a validated request to MBZoo; the page row is a table of contents (ADR-0022) |
| Book                                          | ✅                             | ✅ chapters with TOC             |                                                                                                                                                                                                                          |
| Forum                                         | ✅                             | ✅ typed summary                 | forum type and settings; discussions only exist if the backup included user data                                                                                                                                         |
| Glossary                                      | ✅                             | ✅ entries rendered              | entries are user-generated, so a backup taken without user data has none — the viewer says so                                                                                                                            |
| Assignment                                    | ✅                             | ✅ summary                       | dates and submission types; submissions only present with user data                                                                                                                                                      |
| Lesson                                        | ✅                             | ✅ branching pages               | pages, answers and where each jump leads — all of it travels in a content-only backup                                                                                                                                    |
| Choice                                        | ✅                             | ✅ question + options            |                                                                                                                                                                                                                          |
| Database                                      | ✅                             | ✅ field schema                  | the fields collected; records only exist with user data                                                                                                                                                                  |
| Workshop                                      | ✅                             | ✅ instructions + examples       | example submissions and both instruction blocks; peer work is user data                                                                                                                                                  |
| IMS content package                           | ✅                             | ✅ TOC + sandboxed pages         | table of contents read from the PHP-serialized `structure` (ADR-0021)                                                                                                                                                    |
| Subsection                                    | ✅                             | ✅ nested in the tree            | Moodle 4.5+ delegates a section to a module; MBZoo nests it under its owner rather than listing it as a sibling                                                                                                          |
| Survey (retired) · Assignment 2.2 (retired)   | ✅                             | ✅ summary                       | removed from Moodle core in 5.0 and 4.2; no current Moodle can restore them                                                                                                                                              |
| Chat · Wiki                                   | ✅                             | ✅ typed summary                 | schedule / wiki mode; messages and pages are user data. Chat is labelled _retired_: Moodle removed it in 5.0 (MDL-82457)                                                                                                 |
| Feedback (questionnaire)                      | ✅                             | ✅ items rendered                | labels, questions and their options in author order; responses only exist with user data                                                                                                                                 |
| Quiz                                          | ✅ metadata + question bank    | ✅ read-only question navigation | multichoice/true-false/short answer/essay/match; random slots page through the pool they draw from, captioned with how many an attempt asks; faithful execution requires Moodle's Question Engine — not a goal           |
| Question bank · External tool · BigBlueButton | ✅                             | ✅ typed summary                 | configuration records; MBZoo never launches an external tool                                                                                                                                                             |
| SCORM                                         | ✅ metadata + course structure | 🧪 experimental playback        | SCOs run in the opaque-origin sandbox with a scorm-again runtime in the same document; nothing is tracked or saved (ADR-0023)                                                                                            |
| H5P (mod\_h5pactivity / .h5p files)           | ✅ metadata + package          | ⚠️ experimental playback        | sandboxed player, self-contained packages; see ADR-0018 — unsupported content types fall back to download                                                                                                                |
| EPUB                                          | ✅                             | ✅ chapter by chapter            | spine read from the OPF; assets inlined from the package, rendered in the sandbox. No pagination or bookmarks (ADR-0024)                                                                                                 |
| eXeLearning .elp/.elpx                        | ✅ classified by contents      | ✅ exported site                 | a .elpx carries the project and its render; the render is shown. A legacy .elp with only content.data says why it cannot be decoded (ADR-0025)                                                                           |
| Unknown third-party plugins                   | ✅                             | ✅ metadata fallback             | never break the course view                                                                                                                                                                                              |

Legend: ✅ implemented · 🔜 planned next · ⏳ research (Q-012/Q-013/Q-016).

Media files (video, audio) preview inline with native controls; a media
element decodes its file but never executes it.

## Personal data

A backup taken with **users included** carries a root `users.xml` holding
names, usernames, email addresses, ID numbers, phone numbers, postal
addresses, institutions, the last IP each account logged in from, and profile
descriptions. MBZoo says so as soon as such a file is opened: how many people,
and which kinds of data are actually populated. The list of names sits behind
a disclosure that stays closed, so reading it is deliberate rather than
something that happens while screen-sharing.

Nothing leaves your device — but the file does. Treat a backup with user data
as personal data before emailing it, uploading it or committing it anywhere.

## Grading

Every activity's grade item travels in a content-only backup, so MBZoo shows
what it is out of, what counts as a pass, its weight and whether it was hidden
— read from `grades.xml` beside the module payload. Students' marks
(`<grade_grades>`) are user data and are never read.

Rubrics and marking guides live in `grading.xml`, and are often the clearest
statement of what a task is assessed on: criteria, levels and their scores are
rendered in full. A grading method MBZoo does not decode is named rather than
shown as empty.

The course-wide gradebook — the category tree, its aggregation method, and the
grade letters — is shown in the detail pane before an activity is selected.

## Retired modules

Moodle has removed `chat` and `survey` from core (5.0, MDL-82457) and
`assignment` (4.2, MDL-72350), so no current Moodle can restore them — but
backups written before those releases still carry them. MBZoo reads them like
any other module and labels them _retired_ next to the module name, with the
release that dropped them.

## Course links

Moodle cannot store absolute URLs for links between activities, so a backup
carries them as `$@COURSEVIEWBYID*62@$`-style tokens. MBZoo decodes them
(ADR-0019): a link to an activity that travelled in the same backup opens
that activity in MBZoo, anything else becomes a labelled link to the site
recorded in `<original_wwwroot>` — opened in a new tab, never fetched by
MBZoo — and a token MBZoo cannot decode keeps its text but leads nowhere,
rather than pretending to point somewhere.
