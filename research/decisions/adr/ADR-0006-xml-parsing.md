---
id: ADR-0006
title: Event-based XML parsing behind an adapter (saxes initially)
status: Accepted
date: 2026-08-24
sources: [TECH-006, REPO-005]
---
## Context
moodle_backup.xml and files.xml scale with course size; DOMParser is
browser-only and memory-hungry; prompt §19 requires security-conscious choice.

## Decision
parseXmlEvents() exposes open/close/text events with hard budgets
(MAX_XML_BYTES input cap; decoded-text budget blunting entity expansion).
saxes 6.0.0 (ISC) is the initial implementation — it never fetches external
entities. Parsers consume events only; swapping implementations touches one file.

## Rejected alternatives
DOMParser (browser-only, whole-tree memory), fast-xml-parser (object-tree
memory model, lenient by default).

## Consequences
+ Predictable memory; strict malformed-input errors (tested).
− Manual path-tracking boilerplate per XML file; acceptable at current scope.
