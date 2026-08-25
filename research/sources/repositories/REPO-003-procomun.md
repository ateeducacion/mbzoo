---
id: REPO-003
title: "procomun_2 (INTEF-Proyectos/procomun)"
kind: external-repository
url: https://github.com/INTEF-Proyectos/procomun
commit: local clone inspected 2026-08-24 (/Users/ernesto/Downloads/git/procomun_2)
accessed: 2026-08-24
license: "[PENDING: verification required — public GitHub org currently 404]"
---
## Facts observed (local clone)
Modern Bun + TypeScript monorepo:
- Workspaces `apps/*`, `packages/*`; Bun 1.3.x lockfile; Biome lint/format;
  bun:test unit + integration suites; Playwright E2E incl. @axe-core/playwright;
  strict TypeScript.
- ADR-driven stack decisions in `docs/negocio/decisiones/000N-slug.md`
  (TypeScript+Bun base, HTTP framework, frontend framework, DB, ORM…).
- Root AGENTS.md mandates: every relevant decision becomes an ADR; evaluate
  market solutions before building; accessibility/interoperability as base
  requirements.
- GitHub Pages used for static PR previews (ADR-0010 in that repo).

## Note
The public GitHub organization INTEF-Proyectos/procomun returned 404 on
2026-08-24; findings are from the provided local clone. The legacy
ctt-gob-es/procomun repo is unrelated.

## Relevance to MBZoo
Confirms the Bun+TS+Biome+Playwright toolchain pattern in a sibling ATE/INTEF
project; adopt ADR-before-stack discipline and axe-core in E2E.
