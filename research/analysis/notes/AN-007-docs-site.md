---
id: AN-007
title: Documentation site strategy
date: 2026-08-25
sources: [TECH-011]
ai_tool: opencode
ai_model: ox-alpha
---
## DECISION
Rspress 2 generates the docs site from the repo's existing `docs/` directory
(single source of truth: ARCHITECTURE.md/PRIVACY.md live there already), plus
guide pages moved out of README (activity matrix, development). Output is built
into apps/viewer/public/docs so the existing Pages deploy serves viewer + docs
as one static artifact. README shrinks to pitch + quick start + links.

## REJECTED
bunpress 0.1.x (immature); duplicating content between README and docs
(drift risk); a separate Pages artifact for docs (two deploys to maintain).
