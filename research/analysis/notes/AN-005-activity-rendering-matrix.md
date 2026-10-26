---
id: AN-005
title: How each Moodle activity type can be rendered from backup data
date: 2026-08-25
sources: [REPO-004, REPO-005, REPO-002]
ai_tool: opencode
ai_model: ox-alpha
---
## FACTS (observed in REPO-004/SMR_SEGI/CS401 samples + REPO-005)
- page/label: HTML in page.xml/label.xml (`<content>`/`<intro>`, escaped) — rendered since ADR-0013.
- url: `<externalurl>` in url.xml — linkable.
- resource/file/folder: payload files in the content-addressed pool keyed by
  (component=mod_*, filearea=content, contextid from activity XML root).
- forum: forum.xml holds intro/type; **discussions/posts only exist in the
  backup when user data was included** (content-only backups show none —
  verified in SMR_SEGI). Read-only rendering = intro + settings; discussions
  renderable when present.
- quiz: quiz.xml (activity) + root questions.xml (question bank). SMR_SEGI bank
  (976 KB) contains qtypes: multichoice, truefalse, shortanswer, match, essay,
  random. Inspection is straightforward; faithful execution requires Moodle's
  Question Engine (prompt §6 stance stands).
- assign: assign.xml intro + dates/grade settings; submissions only with user
  data.
- book: book.xml + chapter content inside the activity directory (structure
  per Moodle 2.x backup format; [PENDING: verification required — no book
  sample in current fixtures]).
- scorm: scorm.xml + the SCORM package (ZIP with imsmanifest.xml) stored as a
  pool file; launching requires a runtime (scorm-again candidate, Q-012).
- h5p: .h5p package file (ZIP: h5p.json + content/ + libraries); h5p-standalone
  candidate (Q-013).
- elp/elpx (eXeLearning): appear as resource files. .elpx is ZIP-based,
  .elp is XML (often gzipped). eXeLearning itself exports standard HTML —
  rendering strategy under Q-016 (REPO-002 is the authoritative source for
  format facts).

## INTERPRETATION
Everything except faithful quiz/SCORM/H5P *execution* is inspectable from
backup XML alone. Renderers are incremental work behind the ADR-0013
capability model; unknown plugins already fall back to metadata display.
