---
name: mbz-viewer
description: Invariants for apps/viewer UI, worker integration and activity renderers. Load before changing viewer state, DOM rendering, previews, styles or worker messaging.
---
# Skill: MBZoo viewer work

- Keep the viewer Vite + vanilla TypeScript unless an evidence-backed architectural decision changes ADR-0007. Do not introduce a framework for local convenience.
- Parsing/heavy archive work stays off the main thread. Preserve the worker/core boundary and validate messages/data crossing it.
- Render backup-derived plain text with `textContent`. `innerHTML` is allowed only for output that has passed the single `sanitizeHtml()` DOMPurify path (ADR-0012).
- Use `Renderer`-managed object URLs and dispose them when changing/closing a preview. Do not leak blob URLs across activities.
- Unknown or partially supported Moodle modules must degrade to metadata/fallback + warnings, not break the explorer.
- Do not automatically request remote resources referenced by backup content. External URLs require explicit user action.
- Executable HTML/file previews must follow `mbz-content-sandbox`; do not weaken sandbox/CSP from renderer code.
- Keep loading, error, warnings, empty/fallback and “open another” flows coherent when changing state transitions.
- User-facing changes require targeted tests and browser-level verification. Load `browser-qa` for interaction/rendering changes and `web-quality-audit` for substantial UI work.
- Run `bun run check`; run `bun run test:e2e` when behavior is visible in the browser.
