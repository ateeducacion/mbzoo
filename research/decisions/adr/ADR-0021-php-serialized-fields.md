---
id: ADR-0021
title: Read PHP-serialized backup fields with a refusing parser, never a reconstructing one
status: Accepted
date: 2026-08-25
sources: [REPO-005]
experiments: []
related: [ADR-0004, ADR-0009, ADR-0013]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0021: Read PHP-serialized backup fields with a refusing parser, never a reconstructing one

## Context

A few Moodle fields hold structured data inside a single XML leaf, written
with PHP's `serialize()`:

- `imscp.structure` — the IMS package table of contents, the only place the
  chapter titles of an IMS content package exist
  (`mod/imscp/lib.php`: `$imscp->structure = serialize($structure)`).
- `resource.displayoptions` — `a:1:{s:10:"printintro";i:1;}`, present in
  every REPO-004 backup.
- assign's `plugin_config` values.

Without a reader, an IMS content package renders as a bag of files with no
table of contents, and those fields either sit unused or reach the UI as
raw text.

`serialize()` is also the format behind PHP's best-known vulnerability
class: `unserialize()` instantiates classes named in the payload, which
turns attacker-controlled data into attacker-chosen object construction. A
backup is attacker-controlled data (AGENTS.md §1).

## Problem

How can MBZoo read these fields without adopting the part of the format
that exists to build objects?

## Decision drivers

- The value is in three specific field shapes: nested arrays of scalars.
  Nothing MBZoo reads needs objects or references.
- `@mbzoo/core` must stay Web-platform only (ADR-0004) — no PHP, no
  Node, no dependency.
- A malformed payload must fail closed, not half-parse into something a
  renderer then walks.

## Options

1. **A dependency.** Adds a package for three fields, and general-purpose
   readers implement `O:` because PHP does. Rejected.
2. **Regex the values out.** Works until a title contains `;` or `"`.
   Rejected: silently wrong is the worst failure here.
3. **A small reader for the subset that appears, refusing the rest.**
   Chosen.

## Decision

We will read these fields with `packages/core/src/moodle/php-serialized.ts`,
supporting exactly `N` (null), `b`, `i`, `d`, `s` and `a` (array), and
**refusing** `O:` (object), `C:` (custom serialization) and `R:`/`r:`
(back-references) outright.

Standing rules:

- Never add object or reference support. `O:`/`C:` exist to instantiate
  classes, which has no meaning in a viewer; `R:`/`r:` can describe cycles
  that a consumer walking the result would not survive.
- The reader is byte-oriented. PHP counts string lengths in **bytes**, so a
  payload holding any non-ASCII character cannot be scanned by JS string
  index — the fixture's own TOC is generated rather than typed for the same
  reason.
- Fail closed: a malformed payload returns `undefined`, never a partial
  value. Depth, node count and total size are bounded.
- New consumers narrow the result explicitly; `PhpValue` is a union, and a
  field that should be a string is checked before it is used as one.

## Consequences

**Positive.** IMS content packages show the author's table of contents.
`displayoptions` and assign's plugin config become readable when a renderer
wants them. No dependency, no PHP, still portable.

**Negative.** A backup written by a future Moodle that serializes an object
into one of these fields reads as absent rather than as data. That is the
intended trade.

**Neutral.** The reader is ~180 lines and used by one renderer today.

## Risks

- **A silently wrong value.** Mitigated by refusing rather than repairing:
  every length, count and delimiter is checked, and byte-length handling is
  covered by a test with multi-byte content.
- **Resource exhaustion from a crafted payload.** `MAX_PHP_BYTES`, a depth
  cap and a node cap bound the work; an array header claiming more entries
  than the payload could hold is refused before allocating.

## Validation

`packages/core/test/php-serialized.test.ts` covers each scalar type, key
order, byte-counted strings, the three refusals, malformed payloads, an
oversized array header and unbounded nesting. The e2e spec "an IMS package
shows the table of contents from its serialized structure" covers the
consumer.

## References

- REPO-005 — `mod/imscp/lib.php` (structure is `serialize()`d),
  `mod/imscp/locallib.php` (item keys: title, href, subitems).
- ADR-0009 — security model; every backup value is hostile input.
- ADR-0004 — portable core.
