---
id: ADR-0015
title: Documentation site — Rspress 2 in an isolated workspace, unified static deploy
status: Accepted
date: 2026-08-25
sources: [TECH-003, TECH-011, TECH-012, TECH-013]
experiments: []
related: [AN-007, ADR-0003, ADR-0009, ADR-0011]
supersedes: []
ai_tool: grok
ai_model: grok-4.6
---

# ADR-0015: Documentation site — Rspress 2 in an isolated workspace, unified static deploy

## Context

MBZoo already ships architectural notes (`docs/ARCHITECTURE.md`,
`docs/PRIVACY.md`) and needs a browsable site for the format guide,
activity matrix and research workflow. The viewer deploys as a static
GitHub Pages artifact. ADR-0009 forbids telemetry and automatic
network access. ADR-0003 gives the viewer to Vite; ADR-0011 forbids
new packages without a real boundary.

The site is already running on Rspress 2 (`apps/docs`, `@rspress/core`
2.0.19, TECH-011) with `docs/` as the source tree and output copied
into `apps/viewer/public/docs/`. This record locks that shape and the
fallback, rather than leaving it as an unrecorded spike.

## Problem

How should MBZoo publish documentation so that (a) `docs/` remains the
single source of truth, (b) the site is a fully static, zero-telemetry
artifact served with the viewer, and (c) search works offline — without
introducing a second deploy pipeline or a cloud search backend?

## Decision drivers

- Static output only; GitHub Pages; no server runtime.
- Zero telemetry, no third-party fonts/CDNs/analytics (ADR-0009).
- Client-side full-text search with no Algolia (or equivalent) account.
- `docs/` is the source of truth; README stays pitch + quick start.
- Isolation from `@mbzoo/core` and `@mbzoo/viewer` runtimes and bundles.
- Escapable toolchain: Markdown content must survive a generator swap.

## Options considered

### Option A: Rspress 2 (`@rspress/core`, TECH-011) — chosen

Rust/Rspack SSG. Built-in client-side search, MDX, `llms.txt`. Already
wired as `apps/docs` with output copied into the viewer public tree.

### Option B: VitePress (TECH-012)

Vite + Vue 3 SSG. Shares the viewer's bundler family (ADR-0003). Built-in
MiniSearch. Documented fallback if Rspack native binaries fail in CI.

### Option C: Starlight on Astro (TECH-013)

Astro documentation framework, Pagefind search, strong i18n/a11y. Extra
framework (Astro + content collections) for a small doc set.

### Option D: bunpress / hand-rolled Bun generator

Rejected: bunpress 0.1.x has no durable release; a custom generator
would own search, highlighting and navigation with no payoff at this
size (AN-007).

## Decision

We will:

1. Keep `@mbzoo/docs` as an isolated workspace under `apps/docs/`,
   generating the site with **Rspress 2** (TECH-011) from the repo
   `docs/` tree (`rspress.config.ts` `root: '../../docs'`).
2. Copy the build into `apps/viewer/public/docs/` so GitHub Pages
   serves the viewer at `/` and documentation at `/docs` from one
   artifact. No second Pages project, no docs server.
3. Treat `docs/` as the single source of truth. Do not duplicate
   architecture, privacy or activity-matrix content in `README.md`.
4. Configure the site with local assets only: no analytics, no
   third-party fonts, no cloud search (ADR-0009).
5. Keep Markdown/MDX in `docs/` generator-agnostic. If Rspack native
   binaries break CI, switch the workspace to VitePress (Option B)
   without rewriting content. That switch is a new ADR.

Standing rules:

- Documentation build must not enter `@mbzoo/core` or the viewer
  runtime bundle.
- Search stays client-side. Adding Algolia (or any network search
  backend) is a privacy-model change and needs its own ADR.
- New published packages still require a real boundary (ADR-0011);
  `apps/docs` is a workspace, not a published library.

## Consequences

### Positive

- One static deploy for viewer + docs.
- Offline full-text search without an API key or tracker.
- README stays short; `docs/` does not drift against a second copy.
- Rspress `llms.txt` output matches the evidence-system habit of
  machine-readable docs.

### Negative

- The repo now has two bundlers: Vite (viewer, ADR-0003) and Rspack
  (docs). Acceptable only because docs never touch parser/viewer code.
- `@rspress/core` pulls a React/Rspack toolchain used solely at docs
  build time.
- A post-build copy step (`apps/docs/scripts/copy-dist.mjs`) is
  another moving part.

### Neutral

- Vue (VitePress) or Astro (Starlight) would also be docs-only
  dependencies; the React pull from Rspress is the same class of cost.
- Content volume is small (~10 pages). Generator choice is about
  search + static output + isolation, not about authoring scale.

## Risks

- **Rspack native binaries fail on a CI/OS combination we care about.**
  Mitigation: content stays ordinary Markdown; VitePress is the
  recorded fallback (TECH-012, AN-007). Revisit this ADR rather than
  patching Rspack in core/viewer CI.
- **Docs site grows a tracker, webfont CDN or Algolia key.** Mitigation:
  ADR-0009 applies; the checklist for this record forbids it; review
  `apps/docs/rspress.config.ts` when bumping `@rspress/core`.
- **Copy-into-viewer public/ drifts from `docs/`.** Mitigation:
  `bun run docs:build` is the only publish path; do not hand-edit
  `apps/viewer/public/docs/`.

## Validation

- `bun run docs:build` produces HTML plus a client-side search index
  under `apps/viewer/public/docs/`.
- `bun run check` stays green with the docs workspace installed.
- No network calls or third-party script/font URLs in the generated
  HTML head (spot-check on bump of `@rspress/core`).

## Follow-up work

- If Rspack binaries fail in CI, open a superseding ADR moving
  `apps/docs` to VitePress; do not keep both generators.
- Do not cite this ID for unrelated features (activity renderers stay
  under ADR-0013).

## References

- AN-007 (framework evaluation).
- TECH-011 Rspress 2, TECH-012 VitePress, TECH-013 Starlight, TECH-003 Vite.
- ADR-0003 (Vite owns the viewer), ADR-0009 (privacy), ADR-0011 (packages).
- Implementation: `apps/docs/rspress.config.ts`, `apps/docs/package.json`
  (`@rspress/core` 2.0.19), `apps/docs/scripts/copy-dist.mjs`.

---

## Addendum: Investigation

Working analysis: AN-007. This addendum is the durable copy of that
evaluation, so the decision above does not depend on finding the note.

### Constraints

| Constraint | Source |
|---|---|
| Static HTML/CSS/JS only; GitHub Pages | existing viewer deploy |
| No telemetry, no third-party fetch | ADR-0009, `docs/PRIVACY.md` |
| Offline search; no Algolia | ADR-0009 |
| `docs/` is canonical; no README duplication | AN-007, original spike |
| Docs toolchain isolated from core/viewer | ADR-0004, ADR-0011 |
| Content portable across generators | Markdown/MDX in `docs/` |

### Comparative matrix

| Criterion | Rspress 2 (TECH-011) | VitePress (TECH-012) | Starlight (TECH-013) | bunpress / hand-rolled |
|---|---|---|---|---|
| Bundler | Rspack (Rust) | Vite (same family as viewer) | Astro (Vite underneath) | Bun native |
| Offline search | built-in | MiniSearch, built-in | Pagefind | none (must build) |
| `docs/` as source | `root` config | `srcDir` | content collections | trivial |
| Unified static copy into viewer | yes | yes | yes | yes |
| Maturity | v2.0.19 installed | v1.x, large install base | production Astro theme | 0.1.x / unreleased |
| Docs-only dependency weight | React + Rspack native binaries | Vue 3 | Astro + Pagefind | minimal |
| Isolation from `@mbzoo/core` | workspace `apps/docs` | same | same | in-tree script |
| Escapability of content | Markdown/MDX | Markdown | Markdown | Markdown |

### Option notes

**Rspress 2.** Strength: search, MDX and `llms.txt` without extra
services; already proven in this repo at `@rspress/core` 2.0.19.
Weakness: second bundler (Rspack) and native binaries. Containment:
the workspace is docs-only; `docs:build` is the only consumer.

**VitePress.** Strength: one conceptual bundler family with ADR-0003;
MiniSearch is local; migration cost is low because `docs/` is ordinary
Markdown. Weakness: Vue runtime exists only for docs — same class of
cost as Rspress's React, without the native-binary risk.

**Starlight.** Strength: a11y/i18n defaults, Pagefind. Weakness: Astro
content-collection machinery is disproportionate for ~10 pages.

**bunpress / hand-rolled.** bunpress (stacksjs) was 0.1.x with no
usable release when TECH-011 was registered. A custom generator would
reimplement search, highlighting and sidebar for no product gain.

### Adversarial review

- **Failure — Rspack binary missing on a CI image.** Docs build is not
  on the parser/viewer critical path, but `bun run check` / deploy
  would fail. Pre-mortem: keep content in `docs/`; VitePress is the
  swap, not "vendor Rspack into core."
- **Failure — dual toolchain leaks into the viewer.** Mitigation:
  `@rspress/core` is a devDependency of `@mbzoo/docs` only. A PR that
  imports it from `apps/viewer` or `packages/core` is a boundary bug.
- **Failure — privacy regression on a theme default.** Documentation
  generators often inject Google Fonts or analytics. Mitigation: treat
  generated `<head>` as hostile on every `@rspress/core` bump; no
  remote font/script URLs.
- **Assumption challenged — "Rust core means we should prefer it."**
  Build speed is not a driver at this doc volume. The choice is search
  + static output + already-working isolation. VitePress remains the
  better *alignment* option; Rspress wins on *already shipped*.
- **Assumption challenged — "a custom Bun generator would be smaller."**
  True for Hello World, false once search and navigation exist. Rejected.

### Evidence

- TECH-011, `apps/docs/package.json`: `@rspress/core` 2.0.19, MIT.
- `apps/docs/rspress.config.ts`: `root: '../../docs'`, `base: '/mbzoo/docs/'`,
  `llms: true`, output copied into the viewer public tree.
- TECH-012: https://vitepress.dev — Vite + Vue SSG, local search.
- TECH-013: https://starlight.astro.build — Astro docs framework, Pagefind.
- TECH-003 / ADR-0003: Vite already owns `apps/viewer`.
- ADR-0009 / `docs/PRIVACY.md`: nothing leaves the device; no telemetry.
- Original AN-007 (pre-rewrite) rejected bunpress 0.1.x and a second
  Pages artifact — that rejection still holds.
