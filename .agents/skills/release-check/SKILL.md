---
name: release-check
description: Pre-release gate checklist for MBZoo. Use before publishing a version or deploying.
---
# Skill: Release check

Run in order and stop on the first failure:

1. `bun run check` — lint, format, typecheck, unit tests, coverage, build and research validation.
2. `bun run test:e2e` — all configured Chromium, Firefox and WebKit projects.
3. Fixture determinism — regenerate fixtures and confirm generated archives + manifest match the committed intended state; unexpected drift blocks the release.
4. Licensing — review shipped dependency changes against `research/compliance/licensing/dependency-report.md`; no incompatible/GPL contamination in distributed MIT code.
5. Research indexes — `bun run research:indexes -- --check` must be clean.
6. Documentation truth pass — README support matrix, `AGENTS.md`, DEVELOPMENT and user-visible claims must match implemented behavior.
7. Security pass — threat model remains accurate; sanitization, sandbox permissions and the effective injected preview CSP still match ADR-0009/0012/0014. Any new untrusted-content capability requires its decision/review first.
8. Deployment, only when explicitly authorized — the Pages workflow is green and the deployed viewer passes a smoke test for loading assets and opening the synthetic fixture. Do not claim configurable HTTP security headers on GitHub Pages; verify the controls the app actually owns.
