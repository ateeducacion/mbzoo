---
id: ADR-0007
title: Viewer UI starts vanilla TypeScript + DOM
status: Accepted
date: 2026-08-24
sources: []
---
## Context
Prompt §17: no framework without evidence. Current UI = dropzone, status line,
section/activity tree.

## Decision
Vanilla TS DOM manipulation with textContent-only injection of backup-derived
strings (defense-in-depth on top of ADR-0009). Semantic HTML + aria-live status
for accessibility from the start; CSS custom properties, reduced-motion support.

## Rejected alternatives
Lit/Preact/React: component isolation benefits do not outweigh bundle +
abstraction costs while renderers number < 10. Re-evaluate when activity
renderers land (Q-010).
