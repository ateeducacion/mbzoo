# Activity & content support

MBZoo renders what the backup actually contains, and is transparent about
what it cannot do. Unknown third-party plugins never break the course view.

| Moodle module | Inspect | Render / preview | Notes |
|---|---|---|---|
| Page | ✅ | ✅ sanitized HTML | ADR-0012/0013 |
| Label | ✅ | ✅ sanitized HTML | |
| URL | ✅ | ✅ external link | never fetched automatically |
| Resource / File | ✅ | ✅ inline preview | PDF via pdf.js canvas, images, text, sandboxed HTML (ADR-0014) |
| Folder | ✅ | ✅ file cards | |
| HTML page w/ CSS+JS | ✅ | ✅ sandboxed iframe | opaque origin + CSP; scripts isolated from the app (ADR-0014). A multi-page site (e.g. an eXeLearning export) is paged from MBZoo's own list, not by following links inside the frame (ADR-0020) |
| Book | ✅ | ✅ chapters with TOC | |
| Forum | ✅ | ✅ typed summary | forum type and settings; discussions only exist if the backup included user data |
| Glossary | ✅ | ✅ entries rendered | entries are user-generated, so a backup taken without user data has none — the viewer says so |
| Assignment | ✅ | ✅ summary | dates and submission types; submissions only present with user data |
| Lesson | ✅ | ✅ branching pages | pages, answers and where each jump leads — all of it travels in a content-only backup |
| Choice | ✅ | ✅ question + options | |
| Database | ✅ | ✅ field schema | the fields collected; records only exist with user data |
| Workshop | ✅ | ✅ instructions + examples | example submissions and both instruction blocks; peer work is user data |
| IMS content package | ✅ | ✅ TOC + sandboxed pages | table of contents read from the PHP-serialized `structure` (ADR-0021) |
| Chat · Wiki | ✅ | ✅ typed summary | schedule / wiki mode; messages and pages are user data. Chat is labelled *retired*: Moodle removed it in 5.0 (MDL-82457) |
| Feedback (questionnaire) | ✅ | ✅ items rendered | labels, questions and their options in author order; responses only exist with user data |
| Quiz | ✅ metadata + question bank | ✅ read-only question navigation | multichoice/true-false/short answer/essay/match; random slots page through the pool they draw from, captioned with how many an attempt asks; faithful execution requires Moodle's Question Engine — not a goal |
| SCORM | ✅ metadata + package file | ⏳ research | launch needs a runtime (scorm-again candidate, Q-012) in the sandbox |
| H5P (mod_h5pactivity / .h5p files) | ✅ metadata + package | ⚠️ experimental playback | sandboxed player, self-contained packages; see ADR-0018 — unsupported content types fall back to download |
| eXeLearning .elp/.elpx | ✅ as files | ⏳ research | format study tracked in Q-016 |
| Unknown third-party plugins | ✅ | ✅ metadata fallback | never break the course view |

Legend: ✅ implemented · 🔜 planned next · ⏳ research (Q-012/Q-013/Q-016).

Media files (video, audio) preview inline with native controls; a media
element decodes its file but never executes it.

## Retired modules

Moodle has removed `chat` and `survey` from core (5.0, MDL-82457) and
`assignment` (4.2, MDL-72350), so no current Moodle can restore them — but
backups written before those releases still carry them. MBZoo reads them like
any other module and labels them *retired* next to the module name, with the
release that dropped them.

## Course links

Moodle cannot store absolute URLs for links between activities, so a backup
carries them as `$@COURSEVIEWBYID*62@$`-style tokens. MBZoo decodes them
(ADR-0019): a link to an activity that travelled in the same backup opens
that activity in MBZoo, anything else becomes a labelled link to the site
recorded in `<original_wwwroot>` — opened in a new tab, never fetched by
MBZoo — and a token MBZoo cannot decode keeps its text but leads nowhere,
rather than pretending to point somewhere.

