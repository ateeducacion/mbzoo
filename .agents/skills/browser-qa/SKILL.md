---
name: browser-qa
description: Browser-level QA for the MBZoo viewer using Playwright. Use for user-visible viewer behavior, drag/drop, previews, accessibility interactions, browser-specific bugs, or E2E tests.
---
# Skill: Browser QA

1. Use the existing Playwright configuration and selectors. Do not add another browser automation stack.
2. Prefer the deterministic synthetic `.mbz` fixture for automated flows. Never put a real user/institution backup in E2E assets.
3. Assert user-visible outcomes plus important negative signals: no uncaught page errors, no unexpected dialogs/navigation, and no automatic remote fetch caused by backup content.
4. Cover the state transition being changed: landing/dropzone → loading → explorer, plus warnings/error/empty states when relevant.
5. For renderer changes, exercise the activity from the explorer and verify the rendered/fallback state rather than testing implementation-only DOM details.
6. For security-sensitive previews, verify sandbox behavior and blocked capabilities, not merely that an iframe exists.
7. Keep tests deterministic: use locators and event/state waits, never fixed sleeps. Do not enable retries to mask flakes.
8. Validate keyboard-reachable controls, visible focus where applicable, labels/titles for interactive or embedded content, and responsive behavior for significant UI changes.
9. Run the affected project while iterating; before completion run `bun run test:e2e` across Chromium, Firefox and WebKit plus `bun run check`.
10. Use retained Playwright traces to diagnose failures; update tests only when product behavior intentionally changed.
