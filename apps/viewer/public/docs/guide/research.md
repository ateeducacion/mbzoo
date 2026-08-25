> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/guide/research.md.

# Research & evidence system

Every durable claim in MBZoo traces to a registered record:

- `REPO-NNN` / `STD-NNN` / `TECH-NNN` — inspected sources
- `AN-NNN` — analyses (facts vs interpretation)
- `EXP-NNN` — reproducible experiments (commands, environment, measurements)
- `ADR-NNNN` — architecture decisions (readable decision body; investigation
  in the Addendum; supersede, never rewrite)
- `TASK-NNN` / `Q-NNN` — tracked work and open questions

The system is machine-validated: `bun run research:validate` checks IDs,
required metadata and cross-references; `bun run research:indexes` generates
the indexes (drift-checked in CI).

See [research/](https://github.com/ateeducacion/mbzoo/tree/main/research) in
the repository, and `research/AGENTS.md` for the operational rules.

## Specimens

The schema tells you what a backup _can_ contain; only a real file tells you
what one _does_. So a parser written from Moodle source is not finished until
it has been run against a real backup, and specimens come from four places:

| Source                                   | What it is good for                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Institutional backups (never committed)  | real-world scale and shapes — 100+ activity courses, eXeLearning exports, random quiz banks                           |
| `saylordotorg/course_backups` (REPO-004) | a public corpus of page/url/label-heavy courses, and `$@…@$` links                                                    |
| Moodle's own test fixtures (REPO-005)    | shapes core itself keeps working — a real IMS content package, a real delegated section                               |
| A course generated in a real Moodle      | anything the corpora do not contain: lesson, choice, database, workshop, rubrics, and a backup taken _with_ user data |

The last one is worth spelling out, because it costs about ten minutes:

```bash
docker run -d --name mbzoo-spec -p 8123:8080 -e DB_TYPE=sqlite3 \
  -e MOODLE_ADMIN=admin -e MOODLE_ADMIN_PASSWORD='…' erseco/alpine-moodle
```

Then build the course with Moodle's own APIs from a CLI script and back it up
through `backup_controller`, setting the `users` plan setting either way. Two
things that will bite otherwise: a CLI script has no session, so
`add_moduleinfo()` needs `\core\session\manager::set_user(get_admin())`
first; and a failed `add_moduleinfo()` leaves an open transaction that rolls
back everything created after it in the same request.

Specimens are recorded in `fixtures/manifest.yaml` with provenance and
checksums, and **never committed** — real institution or personal backups do
not belong in this repository, and a regenerable file is not fixture material.

This practice has already earned its keep. Five parsers built from the schema
passed every synthetic test; the first real lesson tripped a bug in all of
them, where a jump target whose page id was 1 or 2 was being read as a Moodle
constant that belongs to a different field entirely.

Machine-readable copies of this site (for agents):
[llms.txt](https://ateeducacion.github.io/mbzoo/docs/llms.txt) (index) and
[llms-full.txt](https://ateeducacion.github.io/mbzoo/docs/llms-full.txt)
(every page). Each HTML page also has a sibling `.md` file and a **Copy
Markdown** control.
