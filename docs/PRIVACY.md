# Privacy

**Nothing you open in MBZoo leaves your device.**

- The viewer is a static web application. Backups are read with the browser
  File API and parsed inside a Web Worker on your machine. There is no upload
  path — no backend, no telemetry, no analytics.
- The CLI reads local files only.
- External resources referenced by course content are not fetched
  automatically. Course links that Moodle rewrote into `$@…@$` tokens are
  decoded and offered as links, never requested (ADR-0019). If a future
  feature needs network access, it will be opt-in and documented here first.

This is a product property enforced by architecture (static deployment, no
server code), not just a policy statement.

## When a backup contains people

Nothing leaves your device — **but the file does.** A course backup taken
with *user data included* carries a root `users.xml`, and it is not a list of
names. One record holds:

> username · email · first and last name · ID number · two phone numbers ·
> institution · department · postal address · city · country · the last IP the
> account logged in from · a free-text profile description · role assignments

Forum posts, glossary entries, assignment submissions, quiz attempts and
grades travel the same way when that box was ticked.

So MBZoo says so as soon as such a file is opened: **how many people, and
which kinds of data are actually populated** — a column that exists but is
blank for everyone is not reported, because warning about phone numbers when
nobody has one teaches people to ignore the warning.

The list of names sits behind a disclosure that stays closed. Knowing a file
names four hundred people is what everyone needs; reading their names is a
deliberate act, and not one to perform by accident while screen-sharing.

**Treat a backup with user data as personal data** before emailing it,
uploading it, or committing it to a repository.

## Exports

Per-activity export (module XML, rendered content as a standalone HTML file,
attached files as a ZIP) is a deliberate user action: nothing is written
without a click, and the file is produced in your browser and handed to your
own download folder. See [Activity support](/guide/activity-support.html).

## What this repository never contains

Real institution or personal backups are never committed. Committed fixtures
are synthetic, deterministic and checksummed in `fixtures/manifest.yaml`. Real
specimens used to verify parsers are recorded there with their provenance and
left out of the tree.
