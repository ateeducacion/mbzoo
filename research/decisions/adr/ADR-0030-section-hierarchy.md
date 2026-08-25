---
id: ADR-0030
title: Sections form a tree when the course format says so
status: Accepted
date: 2026-08-25
sources: [REPO-004, REPO-005]
experiments: []
related: [ADR-0013, ADR-0028]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0030: Sections form a tree when the course format says so

## Context

`moodle_backup.xml` lists sections flat, and MBZoo rendered them flat. Two
Moodle mechanisms put hierarchy elsewhere:

- **Course formats** may store per-section options in
  `<course_format_options>` (`backup_stepslib.php:493-503`: `format`,
  `name`, `value`). `format_flexsections` keeps its nesting there as
  `parent` = the parent's section *number*, plus `collapsed` and
  `visibleold`.
- **Delegated sections** (Moodle 4.5+, `mod_subsection`) are owned by an
  activity, which MBZoo already placed under that activity.

RISK-002 said the flat mapping "may miss course-format-specific nesting
(e.g. flexsections)" and that the parser "emits warnings instead of
failing". A sweep of the corpus (AN-008) found that **111 of 111** public
Saylor backups are flexsections, nested up to three levels, and that the
parser emitted **zero** warnings on all of them — it had no concept to warn
about. Section 3 "1.1: History and Motivation" rendered as a sibling of
section 2 "Unit 1: Introduction", and nothing said so.

## Problem

How should the course tree reflect hierarchy that only a course format
knows about, for the formats that carry it, without pretending to
understand formats it has not seen?

## Decision drivers

- Do not misread a course silently. A flattened tree looks complete and is
  wrong, which is worse than a flagged gap.
- Keep the model format-agnostic where possible: the viewer should not
  branch on `flexsections`.
- Hostile input: a backup can name a parent that does not exist, or one
  that closes a loop.

## Decision

`CourseInfo` gains `format`. `SectionInfo` gains `formatOptions` (the raw
name → value map, whatever the format) and `parentId`, resolved at assembly:

- a **delegated** section's parent is the section holding its owning
  activity;
- a section whose `parent` option names a section number resolves that
  number to an id across the whole list — numbers, not ids, because that is
  what flexsections stores;
- a parent that names no section leaves the section top-level and adds a
  `section-parent-unresolved` warning;
- a cycle is broken at the link that closes it and reported as
  `section-parent-cycle`, so walking parents always terminates.

The viewer renders the list as a tree: each section's activities, then the
sections that name it as parent, one indent per level.

Standing rules:

1. Hierarchy is read from what the backup carries and never inferred from
   names or numbering.
2. A format not modelled degrades to the flat list *and keeps its raw
   options on the model*, so the data is not lost between parse and render.
3. Every unresolved or contradictory parent is a warning, never a guess.

## Consequences

**Positive.** The public corpus renders with the structure its authors
built. The two nesting mechanisms Moodle has share one field, so the viewer
has one tree to draw.

**Negative.** Depth adds indentation the sidebar did not have; very deep
courses get narrower activity rows.

**Neutral.** `topics`, `weeks` and the SMR courses carry no parents and
render exactly as before (verified: 0 options on any SMR section).

## Risks

- A future format storing parents under another option name will flatten
  silently again. Mitigation: rule 2 keeps the options on the model, and
  AN-008 lists the formats the corpus has *not* covered (`weeks`, `social`,
  `singleactivity`).

## Validation

- `packages/core/test/section-hierarchy.test.ts` — format read; the CS101
  parent map resolves numbers to ids; an unknown parent warns and stays
  top-level; a two-section cycle is broken and reported; a topics course
  carries nothing.
- `e2e/viewer.spec.ts` — a flexsections fixture shows "Resources" nested
  under "Introduction" at depth 1, absent from the top level, with its
  activities still opening.

## References

- REPO-004 — the corpus; CS101 `section_6465` is the worked example.
- REPO-005 — `backup_stepslib.php:493-503` for the element shape.
- AN-008 — the sweep that found the gap.
- ADR-0028 — the same principle for files: read the marker, do not guess.
