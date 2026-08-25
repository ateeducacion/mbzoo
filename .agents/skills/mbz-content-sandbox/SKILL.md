---
name: mbz-content-sandbox
description: Security invariants for executable or active backup content. Load for iframe, HTML+JS, SCORM, H5P, postMessage, CSP, sandbox permissions, or embedded-runtime work.
---
# Skill: MBZoo content sandbox

1. Read ADR-0009, ADR-0012, ADR-0014 and the current threat model before changing active-content behavior.
2. Backup-provided JavaScript must never execute in the MBZoo application origin.
3. Current executable HTML-file preview uses an iframe with `sandbox="allow-scripts"` only: no `allow-same-origin`. Preserve the opaque origin unless a new evidence-backed ADR explicitly changes the security model.
4. Preserve the injected `SANDBOX_CSP` default-deny model. Local sibling assets may be rewritten to controlled blob/data URLs; backup-authored remote network, frames, forms and connections must not become automatically available.
5. Do not add popup, top-navigation, form, download, storage, same-origin or other sandbox permissions as a convenience fix. Treat each new token/capability as a security design change.
6. A future postMessage bridge must validate `event.source`, a strict message schema and an explicit capability/operation allowlist. Because opaque sandbox origins report `null`, do not rely on `event.origin` alone as authentication.
7. SCORM/H5P runtimes are still research work. Before adding a launcher, document runtime/library evidence, license/bundle impact, required sandbox capabilities, message/API surface and threat-model changes; create/supersede an ADR where required.
8. Revoke preview object URLs when disposed and avoid sharing application secrets/state into the frame.
9. Add browser security tests that demonstrate blocked app-DOM access and blocked network/capabilities for malicious fixture content. Use synthetic fixtures only.
10. Do not claim SCORM/H5P compatibility or isolation properties that have not been verified across the supported browsers.
