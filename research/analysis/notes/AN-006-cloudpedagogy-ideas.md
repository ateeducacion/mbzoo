---
id: AN-006
title: CloudPedagogy repos — what MBZoo adopted and what it did not
date: 2026-08-25
sources: [REPO-006, REPO-007, REPO-008]
ai_tool: opencode
ai_model: ox-alpha
---
## Adopted (this iteration)
- module.xml as first-class settings on ActivityInfo + humanized availability
  (REPO-006 semantics, MBZoo types).
- Book parser + TOC/chapter navigation (REPO-008 chapter model).
- External reference scanner with provider classification, detect-and-show
  only (REPO-006), consistent with the privacy model.
- Hidden-activity indicator in the tree.

## Deliberately not adopted
- Python architecture/parsers; our portable core + worker model stands.
- Replacing parseActivityXml generic capture with per-plugin parsers.
- Code from REPO-008 (licence placeholder — ideas only).

## Remaining roadmap
TASK-006 (context graph), TASK-007 (explorer filters), TASK-008 (QA tab),
MBZ comparison (idea recorded, no task yet).
