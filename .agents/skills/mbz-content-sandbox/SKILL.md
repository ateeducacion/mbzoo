---
name: mbz-content-sandbox
description: Preserve MBZoo executable-preview isolation when changing CSP, iframe permissions, SCORM/H5P players or navigation messages.
---
# MBZoo content sandbox

Read `research/compliance/security/threat-model.md` and the relevant decisions:
ADR-0017 supersedes the initial HTML-preview policy in ADR-0014; ADR-0018 covers
H5P, ADR-0022 navigation, ADR-0023 SCORM, and ADR-0032 composed SCO documents.

- Backup JavaScript never runs in the application origin. No preview grants
  `allow-same-origin`.
- HTML/site frames in `apps/viewer/src/renderers.ts` currently grant
  `allow-scripts`, `allow-popups`, and `allow-popups-to-escape-sandbox` for author
  links (ADR-0017). H5P frames grant only `allow-scripts`. Do not copy permissions
  between preview types or describe every frame as scripts-only.
- Preserve the distinct `SANDBOX_CSP`, `SCORM_CSP`, and `H5P_CSP` in
  `apps/viewer/src/lib/preview-utils.ts`. SCORM's eval allowance is scoped to SCO
  documents; it is not permission to widen ordinary HTML previews. Network,
  nested frames and form submissions remain denied by these policies.
- The navigation bridge already exists. Preserve the current-frame
  `event.source` check, per-document token, strict `parseNavigationRequest`
  validation, rate limit and mounted-page allowlist. Opaque `event.origin`
  values are not authentication; a WindowProxy alone survives navigation.
- SCORM and H5P playback are experimental implementations in
  `apps/viewer/src/lib/scorm-player.ts` and `h5p-player.ts`. New runtime/network
  capabilities require evidence for license, bundle impact and trust boundaries,
  plus an ADR/threat-model update when the security decision changes.
- Revoke preview URLs and message listeners on disposal. Exercise malicious
  synthetic content in browser tests: blocked application-DOM access, automatic
  remote fetches and disallowed capabilities. Do not infer isolation or package
  compatibility from an iframe attribute or a Chromium-only success.
