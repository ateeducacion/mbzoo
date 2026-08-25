# Development

## Requirements

- [Bun](https://bun.sh) ≥ 1.4 (package manager, test runner, CLI runtime)
- Node 20+ — the Playwright runner is invoked through it
- `bunx playwright install` for E2E browsers

## Commands

| Command | Purpose |
|---|---|
| `bun install` | install workspace dependencies |
| `bun run dev:viewer` | Vite dev server for the viewer |
| `bun run build` | build all packages (viewer outputs static `dist/`) |
| `bun run preview:viewer` | serve the production build locally |
| `bun test packages apps fixtures` | unit tests (bun:test) |
| `bun run test:e2e` | Playwright specs against the built viewer |
| `bun run cli -- <file.mbz>` | inspect a backup from the terminal |
| `bun run lint` / `format` | Biome check/fix |
| `bun run typecheck` | strict TypeScript across workspaces |
| `bun run research:indexes` | regenerate research indexes |
| `bun run research:validate` | validate research records + index freshness |
| `bun run check` | the full local CI equivalent |

## Layout

See `docs/ARCHITECTURE.md`. Parser work has extra invariants — load
`.agents/skills/mbz-parser/SKILL.md` first.

## Fixtures

Regenerate with `bun run fixtures/scripts/generate-fixture.ts`; checksums live
in `fixtures/manifest.yaml`. Never commit real backups.

## Deployment

The viewer is a static site. Pushes to `main` build and deploy it to GitHub
Pages via `.github/workflows/deploy-pages.yml`.
