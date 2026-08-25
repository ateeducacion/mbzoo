> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/index.md.

# MBZoo

Open, inspect and preview Moodle course backups right in your browser. Local-first, no upload.

> See what's inside your MBZ.

[Open the viewer](https://ateeducacion.github.io/mbzoo/) | [What is an .mbz?](/guide/what-is-mbz) | [GitHub](https://github.com/ateeducacion/mbzoo)

## Features

- **100% local**: Backups are parsed in your browser via a Web Worker. There is no server and no telemetry — privacy is a product property.
- **Both real formats**: ZIP and TAR.GZ containers (tgz is Moodle's default since 2.9), with lazy metadata parsing and on-demand content extraction.
- **Reads the whole course**: 22 of Moodle 5.3's 23 activity modules, plus three Moodle has retired — and the grade items, rubrics and gradebook that sit beside them.
- **Tells you when a file names people**: A backup taken with user data carries names, emails and IP addresses. MBZoo says how many people and what kinds of data, before you share the file.
- **Safe by design**: Hostile-input posture — sanitized HTML, sandboxed opaque-origin previews, no content execution in the app origin.
- **Evidence-driven**: Every durable claim traces to a registered source, experiment or ADR. Machine-validated research indexes.
