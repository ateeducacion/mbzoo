---
id: ADR-0026
title: Resolve embedded files by row, and return nothing rather than another row's file
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: []
related: [ADR-0009, ADR-0012, ADR-0013]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0026: Resolve embedded files by row, and return nothing rather than another row's file

## Context

Moodle stores every embedded file reference as the literal token
`@@PLUGINFILE@@/name.ext` inside the authored HTML, and resolves it at
display time against the file area the field belongs to.

MBZoo resolved that token in `resolveHtml()` — but only on the paths that
call it. Several renderers instead called `safeHtml()`, which sanitizes and
decodes course links but does not resolve `@@PLUGINFILE@@`. Measured in a
browser against a fixture carrying a real reference:

```
Page content      <img alt="a">                          (src stripped: ADR-0012 path)
Quiz question     <img src="@@PLUGINFILE@@/pic.png">     (token reaches the DOM)
Lesson page       <img src="@@PLUGINFILE@@/pic.png">     (token reaches the DOM)
```

The second failure is not a broken image. The browser resolves that path
against MBZoo's own origin and **requests it** — a fetch MBZoo did not
intend, on a page built from hostile input, which is the class of thing
ADR-0009 exists to prevent. It survived this long because the synthetic
fixture had no `@@PLUGINFILE@@` reference anywhere, so nothing exercised it.

Wiring the remaining call sites turned out to need a decision rather than a
mechanical change. Moodle scopes several of these file areas **per row**, not
per activity (REPO-005, each module's `backup_<mod>_stepslib.php`):

| Area | Keyed by |
| --- | --- |
| `mod_lesson/page_contents` | page id |
| `mod_lesson/page_answers`, `page_responses` | answer id |
| `mod_glossary/entry` | entry id |
| `mod_feedback/item` | item id |
| `mod_workshop/submission_content` | example submission id |
| `question/questiontext`, `answer`, … | question id |

`matchFileRecord()` matched on filename plus component, filearea and
contextid, with a fallback to any same-named file. Two lesson pages that each
embed a `pic.png` are indistinguishable under that rule, and whichever record
came first won for both.

## Problem

How should a file lookup behave when the reference cannot be pinned to a
single stored record?

## Decision drivers

- A wrong image is worse than a missing one: it looks correct.
- Nothing may be fetched that MBZoo did not resolve (ADR-0009).
- The existing loose match is load-bearing for the activity-wide areas
  (`intro`, `content`), where there is genuinely no row to key by.

## Options

1. **Keep matching on name and take the first hit.** Silently shows one
   page's image on another page. Rejected.
2. **Match on name plus itemid, falling back to name when the itemid
   misses.** The fallback re-introduces exactly the wrong-image case it was
   added to prevent. Rejected.
3. **Match on name plus itemid, and return nothing when the itemid is given
   and misses.** Chosen.

## Decision

We will pass the owning row's id to `matchFileRecord()` wherever Moodle keys
the area by one, and every `@@PLUGINFILE@@`-bearing field will be resolved
through `resolveHtml()` rather than `safeHtml()`.

Standing rules:

- When an `itemId` is given and no record matches it, return **undefined**.
  Do not fall back to a same-named file in another row: an image that belongs
  to a different page is a wrong answer wearing a right answer's clothes.
- Without an `itemId` the previous behaviour is unchanged, because the
  activity-wide areas have no row to key by and the loose match is correct
  there.
- Question files are pinned by component, filearea and question id but
  **not** by contextid: they hang off the question bank category's context,
  not the activity's, and a quiz can use a bank that lives elsewhere.
- More generally: **contextid is the wrong instinct.** It is the obvious key
  and it is not the identifying one. The context can be wider than the
  activity (a shared question bank), or missing from a record altogether —
  `renderWebsite` already guards the case where the record set widens because
  the backup omitted it. What identifies a file is component + filearea + the
  id of the row that owns it. contextid is a narrowing hint, and passing it
  where it does not apply loses the file rather than finding it.
- A field whose file area MBZoo cannot name is left unresolved rather than
  guessed at. `qtype_match` subquestions and rubric criteria are in that
  state today — rubric text carries no files at all (its backup plugin
  annotates none), and match subquestions are not yet mapped.

## Consequences

**Positive.** Embedded images render in lessons, quizzes, glossaries,
feedback questionnaires and workshop examples. No `@@PLUGINFILE@@` token
reaches the DOM, so no request is made under its name.

**Negative.** A backup whose files.xml disagrees with its content — a
hand-edited or partially-restored file — will now show no image where it
previously showed some image. That is the intended trade.

**Neutral.** Two renderers pre-resolve their HTML before a synchronous render
path (`show()` in the lesson, `questionCard()` in the quiz). The cost is one
pass over content already in memory.

## Risks

- **A field mapped to the wrong area shows nothing, silently.** Mitigated by
  taking every mapping from Moodle source rather than inference, and by an
  e2e that asserts a real embed resolves to a `blob:` URL *and* decodes.

## Validation

`e2e/viewer.spec.ts` — "embedded images resolve, and no @@PLUGINFILE@@ token
reaches the DOM": a lesson page and a quiz question each embed a file in the
per-row area Moodle uses; the test asserts both images decode and that no
request was made containing `PLUGINFILE`. `matchFileRecord`'s itemid
behaviour, including the deliberate miss, is unit-tested.

Field areas verified against Moodle source, and against a Moodle 5.2.2 backup
generated with images embedded in a lesson page and a lesson answer, which
recorded them as `mod_lesson/page_contents` and `mod_lesson/page_answers`
keyed by page and answer id exactly as mapped.

## References

- REPO-005 — `annotate_files()` calls in each module's backup stepslib.
- ADR-0009 — nothing is fetched that MBZoo did not resolve.
- ADR-0012 — the single sanitization path these fields still pass through.
