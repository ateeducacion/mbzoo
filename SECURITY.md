# Security Policy

## Scope

MBZoo processes untrusted Moodle backup files fully client-side.
Threat model: `research/compliance/security/threat-model.md`.

## Supported versions

Pre-release software; only the latest `main` receives security fixes.

## Reporting a vulnerability

Open a private security advisory via GitHub ("Report a vulnerability" on the
repository's Security tab). Please include:

- affected area (parser, viewer, CLI),
- steps to reproduce (a crafted `.mbz` fixture is ideal — do not attach real
  backups containing personal data),
- expected vs actual behavior.

Please do not open public issues for vulnerabilities.

## Hard commitments

1. Every `.mbz` is treated as hostile input.
2. Embedded course content (SCORM/H5P/HTML/SVG) is never executed in the
   application origin; future launchers must use sandboxed iframes + CSP +
   postMessage capability bridges (ADR-0009).
3. No user data ever leaves the device; no telemetry.
