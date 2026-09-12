# AGENTS.md — MBZoo

**MBZoo** opens, inspects and previews Moodle `.mbz` backups directly in the
browser. *See what's inside your MBZ.* License: GPL-3.0-or-later (ADR-0035).
Per-activity export (module XML, rendered content HTML, files ZIP) ships
(ADR-0016); whole-backup re-packaging is planned, not implemented.

## Product scope

The current support matrix belongs in `README.md` and the viewer documentation.
SCORM (ADR-0023/0032) and H5P (ADR-0018) playback are experimental.
Whole-backup re-packaging remains planned; do not advertise it as implemented.

## Repository map

```
apps/viewer/    browser app (Vite, vanilla TS, parse worker, renderers)
apps/cli/       Bun CLI adapter over the core
apps/docs/      documentation site bundled with the viewer
packages/core/  portable parser: model/ archive/ moodle/   (@mbzoo/core)
fixtures/       deterministic synthetic .mbz fixtures + generator + manifest
e2e/            Playwright specs
research/       evidence system (sources → analysis → decisions); see research/AGENTS.md
docs/           architecture & privacy documentation
.agents/skills/ project skills for agents
.github/        CI workflows
```

## Development and verification

```bash
bun install --frozen-lockfile # reproduce the committed dependency set
bun run check               # lint + format + typecheck + unit tests + build + research validation
bun run dev:viewer          # viewer dev server
bun run build:viewer        # required before E2E: tests serve the built viewer
bunx playwright install     # install browser engines once
bun run test:e2e             # Chromium, Firefox and WebKit
bun run cli -- <file.mbz>   # inspect a backup from the terminal
bun run research:indexes    # regenerate research indexes (never edit them)
```

Run checks appropriate to the change while iterating; `bun run check` is the
final code-change gate used by CI. Documentation/skill-only changes need link,
frontmatter and diff checks; workflow changes also need `actionlint`.
E2E uses a checkout-derived port (`MBZOO_E2E_PORT` overrides it) and never reuses
an existing server. Do not import playground shell selectors or WASM boot waits.

## Architecture boundaries

- `packages/core` must stay runtime-portable: Web-platform APIs only
  (Uint8Array/Blob/TextDecoder/DecompressionStream). No Node, DOM globals,
  Bun or Vite APIs (ADR-0004).
- The normalized model (`packages/core/src/model/backup.ts`) is the only
  contract crossing package boundaries. XML library objects never escape
  `src/moodle`.
- Viewer uses `textContent` for backup-derived text by default. Backup-derived
  HTML may reach `innerHTML` only after the single `sanitizeHtml()`/DOMPurify
  path defined by ADR-0012. Do not create a second sanitization path.
- Executable HTML files run only in an opaque-origin sandboxed iframe with the
  preview-specific CSP policies (ADR-0017/0018/0032); never in the MBZoo application origin.
- New packages only when a real boundary exists (ADR-0011).

## Coding conventions

- English everywhere: code, comments, docs, ADRs, commits.
- Branch names are English and start with `feature/` or `hotfix/`.
- TypeScript strict plus noUncheckedIndexedAccess/exactOptionalPropertyTypes;
  do not weaken flags.
- No comments unless they explain a non-obvious "why"; cite decision/source IDs
  where relevant, e.g. `(ADR-0005)`, `(REPO-004)`.
- Biome owns formatting and linting; do not add ESLint/Prettier.
- Every behavior change ships with tests covering happy path and edges.

## Security rules (binding)

1. Every `.mbz` and every value extracted from it is hostile input. Validate at
   trust boundaries; use `unknown` and narrow explicitly; never unsafe type
   assertions to silence validation.
2. Never execute backup-provided JavaScript in the MBZoo application origin.
   Page/Label HTML is sanitized (ADR-0012); executable HTML-file previews use
   the opaque-origin sandbox and its preview-specific CSP policies.
3. SCORM/H5P playback must stay inside the opaque-origin sandbox. Preserve
   the per-preview permissions and CSP in `mbz-content-sandbox`. Any new executable-content surface,
   iframe permission, postMessage bridge or network capability requires an
   evidence-backed security/architecture decision and threat-model review.
4. Nothing may upload user data anywhere. No telemetry, analytics or automatic
   fetching of backup-referenced remote content. Backup link tokens
   (`$@CODE*arg@$`) are decoded and offered as links, never requested, and an
   undecodable one must lose its href rather than resolve against our own
   origin (ADR-0019).
5. Path traversal, XML entity expansion and malformed input are regression
   classes. Extend security tests whenever archive, parser or renderer trust
   boundaries change.

## Evidence & documentation rules

- Durable claims cite registered records (REPO-NNN / STD-NNN / TECH-NNN /
  EXP-NNN / ADR-NNNN) or carry `[PENDING: verification required]`.
- Never invent sources, versions or benchmark numbers. Run the experiment.
- Durable decisions get ADRs (template in `research/templates/`). Supersede;
  never rewrite accepted ADR history.
- Update `research/status.yaml` append-only when adding/changing tracked tasks
  or risks.

## Fixtures & privacy restrictions

- Committed fixtures must be synthetic, deterministic and documented in
  `fixtures/manifest.yaml` with sha256. Regenerate via the generator script;
  unexpected checksum drift is a regression.
- NEVER commit real institution or personal Moodle backups. Real-world
  specimens (e.g. saylordotorg/course_backups, REPO-004) are downloaded ad hoc,
  recorded with provenance, and never vendored wholesale.
- Do not port Moodle PHP line-by-line; study format facts instead
  (REPO-005). GPL-3.0-or-later (ADR-0035) removes the licence bar, not the
  rule: the parsers stay clean-room TypeScript, and copied code would drag in
  Moodle's copyright notices and PHP semantics.

## Files generated automatically

- `research/indexes/*.yaml` — regenerate with `bun run research:indexes`; CI
  detects stale output. Never hand-edit.

## What agents must never do

- Claim unimplemented features as working (README distinguishes
  Implemented/Experimental/Planned).
- Execute or auto-render course JavaScript in the main origin.
- Push, merge, publish releases or deploy unless explicitly authorized.
- Edit generated files by hand; rewrite ADR history; reuse IDs.
- Add heavy frameworks or new dependencies without an evidence-backed record
  covering purpose, license, maintenance and bundle impact.

## Task-specific skills

Read the skill needed for the task, not the whole catalog. Repository rules and
local domain guidance take precedence over general upstream examples.

| Skill | Use for |
| --- | --- |
| [mbz-parser](.agents/skills/mbz-parser/SKILL.md) | Archive/XML normalization and the portable core model |
| [mbz-viewer](.agents/skills/mbz-viewer/SKILL.md) | Viewer state, worker transport and renderers |
| [mbz-content-sandbox](.agents/skills/mbz-content-sandbox/SKILL.md) | Executable previews, CSP, iframe permissions and navigation messages |
| [mbz-security](.agents/skills/mbz-security/SKILL.md) | Reviewing hostile-input trust boundaries |
| [mbz-performance](.agents/skills/mbz-performance/SKILL.md) | Archive memory, lazy reads, transfers and preview lifetimes |
| [mbz-fixture](.agents/skills/mbz-fixture/SKILL.md) | Deterministic synthetic backups and specimen provenance |
| [browser-qa](.agents/skills/browser-qa/SKILL.md) | Authoring E2E specs and verifying viewer behavior |
| [systematic-debugging](.agents/skills/systematic-debugging/SKILL.md) | Reproducing failures and isolating their cause |
| [web-quality-audit](.agents/skills/web-quality-audit/SKILL.md) | Requested viewer quality audits |
| [mbz-research](.agents/skills/mbz-research/SKILL.md) | Registering format/library evidence and experiments |
| [architecture-decision](.agents/skills/architecture-decision/SKILL.md) | Durable decisions and superseding ADRs |
| [release-check](.agents/skills/release-check/SKILL.md) | Release verification |
| [skill-maintenance](.agents/skills/skill-maintenance/SKILL.md) | Updating these instructions and skills |
| [github-actions-hardening](.agents/skills/github-actions-hardening/SKILL.md) | Writing or reviewing GitHub Actions workflows |
| [playwright-cli](.agents/skills/playwright-cli/SKILL.md) | Terminal browser exploration; `browser-qa` governs E2E specs |

### Installation and updates

Skills live in `.agents/skills/`, with one symlink per skill in `.claude/skills/`.
Local skills have no GitHub provenance and are maintained here. The two upstream
skills are installed with `gh skills` (`gh skill` is an alias):

```bash
gh skills install github/awesome-copilot skills/github-actions-hardening --agent github-copilot
gh skills install microsoft/playwright-cli skills/playwright-cli --agent github-copilot
gh skills update --all --dir .agents/skills
```

Keep upstream contents and `metadata.github-*` verbatim. Fix upstream and update;
put MBZoo-specific overrides here or in local skills. The sources are
`github/awesome-copilot` ([MIT](.agents/licenses/github-awesome-copilot-MIT.txt)) and
`microsoft/playwright-cli` ([Apache-2.0](.agents/licenses/microsoft-playwright-cli-Apache-2.0.txt)).
Do not import Moodle Playground PHP/WASM or Node-test skills: MBZoo uses a portable
TypeScript parser, Bun tests, and a different browser architecture.

`.github/workflows/update-agent-skills.yml` checks weekly and on manual dispatch,
then opens or updates a review PR. It skips local skills and never auto-merges.
The default GitHub token does not trigger CI for the resulting PRs; review the
prompt diff before merging. Dependabot maintains the workflow action pins.
