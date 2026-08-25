# Privacy

**Nothing you open in MBZoo leaves your device.**

- The viewer is a static web application. Backups are read with the browser
  File API and parsed inside a Web Worker on your machine. There is no upload
  path — no backend, no telemetry, no analytics.
- The CLI reads local files only.
- Course content may contain personal data (names, emails, submissions,
  grades). MBZoo treats that data as yours alone: it stays in memory, and any
  future export feature will require an explicit user action.
- External resources referenced by course content are not fetched
  automatically. If a future feature needs network access, it will be opt-in
  and documented here first.

This is a product property enforced by architecture (static deployment, no
server code), not just a policy statement.
