# Privacy model

Local-first is a product property, not documentation (prompt §10).

- Backups are parsed in the user's browser; no upload path exists in the
  codebase (viewer is static files; CLI reads local disk only).
- No telemetry, analytics or third-party requests ship by default. Any future
  opt-in telemetry must never include course content and needs an ADR.
- External resources referenced inside course content must not be fetched
  automatically; preview features will require explicit user action.
- Exporting data is always an explicit user action.
- Real backups containing personal data must never be committed to this
  repository (fixtures policy: research/compliance/licensing/fixture-policy).
