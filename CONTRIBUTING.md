# Contributing

Thanks for helping MBZoo! Start with `README.md` for context and `AGENTS.md`
for repository conventions (they apply to humans and AI agents alike).

## Quick start

```bash
bun install          # Bun 1.4+ recommended
bun run dev:viewer   # viewer dev server
bun run check        # everything CI runs locally
```

## Ground rules

1. English everywhere (code, comments, docs, commits).
2. Every behavior change ships tests (happy path + edges + security
   regressions when touching parsers).
3. Durable technical decisions need an ADR — see
   `.agents/skills/architecture-decision/SKILL.md`.
4. Never commit real Moodle backups; fixtures policy in `AGENTS.md`.
5. Keep `packages/core` runtime-portable.

## Pull requests

- One focused change per PR.
- `bun run check` must pass locally.
- Reference research records (`ADR-NNNN`, `EXP-NNN`, …) when relevant.
