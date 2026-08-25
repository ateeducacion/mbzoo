---
id: AN-007
title: Documentation site strategy and framework evaluation
date: 2026-08-25
sources: [TECH-003, TECH-011, TECH-012, TECH-013]
experiments: []
ai_tool: grok
ai_model: grok-4.6
---

# AN-007: Documentation site strategy and framework evaluation

Interpretation, not a decision. Feeds ADR-0015.

## Problem and motivation

MBZoo needs a documentation site that:

1. Surfaces architecture, privacy, format notes and the activity matrix
   from the existing `docs/` tree.
2. Deploys as one static artifact with `@mbzoo/viewer` on GitHub Pages.
3. Keeps README as pitch + quick start, without a second copy of the
   same pages.

## Constraints

- Static output only; no docs server, no second Pages project.
- Zero telemetry / no cloud search (ADR-0009).
- Client-side full-text search.
- Isolated from `@mbzoo/core` and the viewer runtime (ADR-0004, ADR-0011).
- Markdown in `docs/` must survive a generator swap.

## Options and comparative matrix

1. **Rspress 2** (TECH-011) — Rspack SSG, built-in search, MDX, `llms.txt`.
2. **VitePress** (TECH-012) — Vite + Vue, MiniSearch, same bundler family
   as the viewer (ADR-0003).
3. **Starlight / Astro** (TECH-013) — Pagefind, i18n/a11y, heavier setup.
4. **bunpress / hand-rolled** — unreleased or a custom generator.

| Criterion | Rspress 2 | VitePress | Starlight | bunpress / custom |
|---|---|---|---|---|
| Bundler | Rspack | Vite | Astro / Vite | Bun |
| Offline search | built-in | MiniSearch | Pagefind | none |
| `docs/` as source | yes | yes | content collections | yes |
| Maturity | v2 installed here | v1.x | production theme | 0.1.x / none |
| Extra toolchain | React + native binaries | Vue 3 | Astro | none |
| Isolation | `apps/docs` | `apps/docs` | `apps/docs` | in-tree script |

## Adversarial review

- **Rspress:** second bundler next to Vite; native binaries can fail in
  CI; React exists only for docs. Containment is workspace isolation,
  not "Rspack is fine everywhere."
- **VitePress:** best toolchain alignment; Vue-for-docs is the same
  class of cost as React-for-docs, without the native-binary risk. The
  real migration cost is low because content is Markdown.
- **Starlight:** capable, disproportionate for ~10 pages.
- **Custom / bunpress:** bunpress had no durable release when TECH-011
  was registered; a hand-rolled search/nav stack is unpaid maintenance.

Hidden cost of any SSG: default themes like to pull Google Fonts or
analytics. That is a privacy defect under ADR-0009, independent of
which generator wins.

## Synthesis (decision input)

Recommend **Rspress 2** for `apps/docs` because it is already generating
the site, gives offline search and `llms.txt`, and copies into
`apps/viewer/public/docs/`. Record **VitePress as the fallback** if
Rspack binaries break CI. Do not run two generators.

Decision record: ADR-0015 (investigation addendum is the durable copy
of this note).
