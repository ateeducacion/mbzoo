---
id: ADR-0019
title: Decode Moodle's $@…@$ link tokens instead of letting them resolve against MBZoo
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: []
related: [ADR-0009, ADR-0012, ADR-0013]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0019: Decode Moodle's `$@…@$` link tokens instead of letting them resolve against MBZoo

## Context

A backup may be restored onto a different site, so Moodle cannot store
absolute URLs for course-internal links. At backup time it rewrites them
into tokens — `$@COURSEVIEWBYID*62@$`, `$@PAGEVIEWBYID*921@$` — and decodes
them again at restore time through `restore_decode_rule` (REPO-005:
`backup/moodle2/restore_course_task.class.php` and the per-module
`restore_<mod>_activity_task.class.php` classes, read 2026-08-25).

MBZoo restores nothing, so the tokens reach the renderer verbatim. Being
neither absolute nor rooted, the browser resolved them against MBZoo's own
origin: a page in `CS401-2017-07-19` (REPO-004) linking six prerequisite
courses produced six links to
`https://ateeducacion.github.io/mbzoo/$@COURSEVIEWBYID*62@$`. They look
like MBZoo URLs, they 404, and they misattribute the course author's link
to us.

`moodle_backup.xml` does record where the course came from:
`<original_wwwroot>` (`https://learn.saylor.org` in CS401,
`http://www.mecd.es/cidead/aulavirtual` in the SMR_SEGI/SMR_SOR exports).
Combined with the decode rules, most tokens can be turned back into the
URL the author wrote.

The same grammar carries `$@NULL@$`, Moodle's serialized SQL NULL — 448
occurrences in CS401 alone. It is a field value, not a link, and it was
reaching the UI as literal text wherever a renderer printed a field.

## Problem

What should a `$@…@$` token become in a viewer that will never restore the
backup and must never fetch remote course content by itself?

## Decision drivers

- A link MBZoo cannot resolve must not pretend to lead somewhere, and must
  never appear to point at MBZoo.
- Nothing may be fetched automatically (ADR-0009): resolving a token is
  allowed to *offer* a URL, never to load one.
- `original_wwwroot` comes from the backup and is hostile input.
- Decode rules are format facts to study, not GPL code to port (REPO-005).

## Options

1. **Leave the tokens alone.** Zero work; keeps producing links that look
   like MBZoo's and lead nowhere. Rejected.
2. **Strip every token'd href.** Honest but lossy: the author's link target
   is recoverable and the reader loses it for no benefit.
3. **Decode against `original_wwwroot`, navigate in-app when the target
   travelled in this backup, drop the href otherwise.** Chosen.

## Decision

We will decode `$@CODE*arg@$` tokens in `packages/core/src/moodle/links.ts`
and apply the result in the viewer after sanitization, with three outcomes:

- The token names a **course module present in this backup** → the anchor
  gets `data-mbz-activity="<cmid>"` and navigates inside MBZoo. Its `href`
  still points at the original site so exports stay useful.
- The token decodes and the backup records a site → an anchor to that site,
  `target="_blank" rel="noopener noreferrer nofollow"`, labelled as a link
  on the original Moodle. MBZoo never requests it.
- Anything else → the anchor keeps its text and **loses its href**.

Standing rules:

- An unknown code decodes to an empty path. Never guess a URL shape; add a
  rule only after reading it in Moodle source and citing the file.
- `original_wwwroot` is accepted only as `http(s)://host…`, so a token can
  never become a `javascript:`/`data:` link.
- A token left in any URL attribute (`src`, `srcset`, `poster`, `href`) is
  removed. Decoding one is not an alternative: that would fetch remote
  course content on render.
- `$@NULL@$` is never a link. It is normalized to `''` at the parse
  boundary in `parseActivityXml`, so no renderer can print it as content.

## Consequences

**Positive.** Course links resolve to something true: in-app navigation for
what travelled in the backup, a labelled outbound link otherwise. No link
in rendered content can be mistaken for an MBZoo URL any more. `$@NULL@$`
stops leaking into activity metadata.

**Negative.** Backups without `<original_wwwroot>` lose the href entirely
for cross-site links. Codes with multi-argument shapes we have not read
(most `*VIEWBYS*`, plugin-specific rules) degrade to dead links until
someone reads and cites the rule.

**Neutral.** Decoding runs on already-sanitized HTML through a detached
`<template>`; it adds no second sanitization path (ADR-0012).

## Risks

- **A wrong rule silently mislinks.** Mitigated by refusing to guess:
  unknown code → no path, plus unit tests per rule shape.
- **`original_wwwroot` points at a site that no longer exists** (the
  SMR_SEGI/SMR_SOR exports name a defunct `mecd.es` host). Accepted: the
  link is labelled as the *original* site, and nothing is fetched.

## Validation

`packages/core/test/links.test.ts` covers each rule shape, unknown codes,
missing arguments, `$@NULL@$`, and hostile `original_wwwroot` values. The
e2e spec `backup link tokens resolve instead of pointing at MBZoo` asserts
the three outcomes and that no `$@` survives in a URL attribute.

## References

- REPO-005 — moodle/moodle: `restore_decode_rule` definitions.
- REPO-004 — saylordotorg/course_backups: CS401 page carrying eight
  `$@COURSEVIEWBYID*…@$` links and 448 `$@NULL@$` values.
- ADR-0009 (security model), ADR-0012 (single sanitization path).

## Addendum: Investigation

Rules were read from `moodle/moodle` `main` on 2026-08-25 via the GitHub
raw API (paths moved under `public/` in recent releases):

| File | Codes read |
| --- | --- |
| `public/backup/moodle2/restore_course_task.class.php` | `COURSEVIEWBYID`, `COURSESECTIONBYID`, `GRADEINDEXBYID`, `GRADEREPORTINDEXBYID`, `BADGESVIEWBYID`, `USERINDEXVIEWBYID`, `PLUGINFILEBYCONTEXT` |
| `public/mod/page/…/restore_page_activity_task.class.php` | `PAGEVIEWBYID`, `PAGEINDEX` |
| `public/mod/forum/…/restore_forum_activity_task.class.php` | `FORUMINDEX`, `FORUMVIEWBYID`, `FORUMVIEWBYF`, `FORUMDISCUSSIONVIEW{,PARENT,INSIDE}` |
| `public/mod/quiz/…/restore_quiz_activity_task.class.php` | `QUIZVIEWBYID`, `QUIZVIEWBYQ`, `QUIZINDEX` |
| `public/mod/book/…/restore_book_activity_task.class.php` | `BOOKINDEX`, `BOOKVIEWBYID{,CH}`, `BOOKVIEWBYB{,CH}`, `BOOKSTART`, `BOOKCHAPTER` |

Page, forum, quiz and book agree on a convention every activity module
follows: `<MOD>VIEWBYID` → `/mod/<mod>/view.php?id=<cmid>` and `<MOD>INDEX`
→ `/mod/<mod>/index.php?id=<courseid>`. Those two are implemented as
patterns so unread modules still resolve; every other code needs a table
entry. The table is consulted **first**, because `USERINDEXVIEWBYID` would
otherwise be read as a `userindex` module.

`PLUGINFILEBYCONTEXT` is deliberately left undecoded. It addresses a file,
and a file that travelled in the backup should be resolved from the archive
(the `@@PLUGINFILE@@` path already does that) rather than linked back to a
site that would demand authentication.

**Pre-mortem.** The dangerous failure is a decoded URL that is not the
author's link — a wrong rule pointing readers at an unrelated page on a
real site. That is why an unrecognized code yields no path at all, and why
each rule in the table is traceable to a named file rather than to memory.
The second failure is a token turning into an executable URL; the
`http(s)` guard on `original_wwwroot` and the post-pass that strips any
surviving token from URL attributes both close that path, and both are
tested.
