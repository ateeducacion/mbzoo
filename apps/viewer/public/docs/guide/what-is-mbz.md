> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/guide/what-is-mbz.md.

# What is an .mbz?

An `.mbz` file is a **Moodle course backup**: a package containing the course's
sections, activities, files, settings and (optionally) user data.

## Container formats

| Format | Since                          | Notes                                                      |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| ZIP    | Moodle 2.0                     | No ZIP64 support inside Moodle itself (4 GB practical cap) |
| TAR.GZ | default since 2.9 (opt-in 2.6) | POSIX ustar; no size cap in practice                       |

MBZoo detects the format from magic bytes and supports **both**.

## Inside the archive

```
moodle_backup.xml          course/section/activity skeleton, and the
                           settings that decide what else is in here
files.xml                  file index (contenthash, component, filearea…)
course/course.xml          full course metadata (fullname lives here)
sections/section_N/        per-section name, summary, activity order
activities/<mod>_N/        per-activity XML — see below
files/<2 hex>/<sha1>       content-addressed file pool
questions.xml              the question bank, shared by every quiz
gradebook.xml              category tree, aggregation, grade letters
users.xml                  the people — only when the backup was taken
                           with user data (see Privacy)
```

An activity directory holds more than its module payload, and the siblings
are where several things hide:

```
activities/assign_42/
  assign.xml               the module's own settings and content
  module.xml               visibility, completion rules, availability, tags
  grades.xml               this activity's grade item: out of, pass, weight
  grading.xml              rubric or marking guide, when one is defined
  inforef.xml              which files.xml records this activity uses
  calendar.xml roles.xml competencies.xml filters.xml
```

## The setting that decides everything

The single most useful thing to know about a `.mbz` is whether it was taken
**with user data**. Every module writes its full XML tree either way; what the
`users` setting gates is each element's _data source_.

Two modules that look equally rich in the schema can be worlds apart in a real
file. A `lesson` writes all of its pages and answers unconditionally — the
whole authored lesson is there. A `forum` writes nothing but the forum record;
every discussion and post is user data. That is why an empty glossary in a
content-only backup is not a bug, and why MBZoo says _why_ it is empty rather
than just that it is.

| Always in the backup                                                                                                                                                              | Only with user data                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| lesson pages and answers, choice options, database fields, workshop instructions and examples, quiz slots and the question bank, grade items and rubrics, the gradebook structure | forum discussions and posts, glossary entries, database records, wiki pages, chat messages, assignment submissions, quiz attempts, everyone's marks |

## Links that point nowhere

A backup may be restored onto a different site, so Moodle cannot store
absolute URLs for course-internal links. It rewrites them as
`$@COURSEVIEWBYID*62@$` tokens at backup time and decodes them at restore
time. MBZoo never restores anything, so it decodes them for display instead —
in-app navigation when the target travelled in the same backup, otherwise a
labelled link to the site the backup came from, never fetched (ADR-0019).

The same grammar carries `$@NULL@$`, which is Moodle's serialized SQL NULL —
a field value, not a link, and never content.

Facts verified against Moodle source (`moodle/moodle`, REPO-005) and against
real backups, including courses generated in a real Moodle for the purpose —
see `research/` in the repository.

## What MBZoo does with it

MBZoo parses the minimum XML subset needed to rebuild the course navigation
tree, then extracts content (pages, PDFs, websites, questions…) **on demand,
in your browser**. Nothing is uploaded — see [Privacy](/mbzoo/docs/PRIVACY.md).
