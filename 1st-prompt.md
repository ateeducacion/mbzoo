# MBZoo — Repository Bootstrap and Technical Foundation

You are initializing and establishing the technical foundation of the following open-source project:

**Repository:** https://github.com/ateeducacion/mbzoo
**Project name:** MBZoo
**License:** MIT
**Primary tagline:** *See what's inside your MBZ.*
**GitHub description:** *Open, inspect, preview and export Moodle `.mbz` backups directly in your browser.*

Your task is **not to rush into implementing features**.

Your first responsibility is to research the problem, collect verifiable evidence, evaluate the technical options, document the important decisions, establish repository conventions for humans and AI agents, bootstrap the monorepo, and prove the chosen architecture with the smallest useful vertical slice.

The repository must be designed for long-term maintenance by both humans and coding agents.

---

# 1. Read the reference repositories first

Before making architectural or tooling decisions, study these repositories and their current contents:

1. https://github.com/ateeducacion/normativa_educativa_canaria

   * Especially:

     * `1er-prompt.md`
     * its evidence/research methodology
     * source tracking
     * stable identifiers
     * generated indexes
     * traceability rules

2. https://github.com/exelearning/moodle-mod_exelearning

   * Especially:

     * `AGENTS.md`
     * `.agents/skills/`
     * `research/`
     * `research/AGENTS.md`
     * ADR methodology
     * evidence storage
     * experiments
     * generated indexes
     * `architecture-records.json`
     * architecture documentation
     * CI/testing conventions

3. https://github.com/INTEF-Proyectos/procomun

   * Study its:

     * repository organization
     * development tooling
     * CI
     * documentation
     * tests
     * agent instructions, if any
     * architecture or decision records, if any
     * conventions that could reasonably be reused

Do not blindly copy any of them.

Create an evidence-backed analysis of **which conventions are appropriate for MBZoo and which are not**.

Record the exact repository URL, branch/tag/commit inspected, access date, and relevant paths.

Do not vendor copies of external repositories.

Do not copy external code unless its license and provenance explicitly allow it and there is a strong technical reason.

---

# 2. Project vision

MBZoo should become a fast, local-first toolkit for opening Moodle course backups without requiring a Moodle installation.

The core user experience is:

```text
drag course.mbz
      ↓
course appears quickly
      ↓
browse its structure and resources
      ↓
preview supported activities
      ↓
run supported interactive content
      ↓
inspect metadata/files
      ↓
export useful representations
```

The default web application must process the backup **locally in the user's browser**.

A backup must not be uploaded to a server merely to inspect it.

Privacy should be a product property, not only documentation.

---

# 3. Functional direction

The architecture should support these capabilities progressively.

## 3.1 Open and inspect

Given a Moodle `.mbz` backup:

* detect its archive format;
* inspect `moodle_backup.xml`;
* inspect course metadata;
* reconstruct sections;
* reconstruct activities;
* index Moodle files from `files.xml`;
* resolve Moodle's content-addressed file store;
* resolve `@@PLUGINFILE@@` references;
* expose backup metadata;
* expose unsupported data safely rather than silently dropping it.

The parser must preserve enough source metadata to make debugging possible.

---

# 4. Supported archive formats

Research actual Moodle backup formats from authoritative Moodle documentation and current Moodle source code.

At minimum investigate:

* ZIP;
* TAR.GZ;
* ZIP64;
* large backups;
* archive entries that cannot fit comfortably in browser memory.

Do not assume `.mbz == ZIP`.

Record evidence.

---

# 5. Course browsing

The viewer should eventually provide useful representations for common Moodle activities and resources such as:

* Label;
* Page;
* Book;
* File;
* Folder;
* URL;
* Assignment;
* Forum, read-only where practical;
* Glossary, read-only where practical;
* Quiz;
* SCORM;
* H5P;
* unknown third-party modules.

Unknown Moodle plugins must fail gracefully.

A third-party activity must never make the entire course unreadable.

A generic fallback should expose safe metadata and available files.

---

# 6. Interactive content

Treat **viewing** and **executing** as different capabilities.

## SCORM

Investigate whether `scorm-again` is an appropriate runtime foundation.

Research:

* SCORM 1.2;
* SCORM 2004;
* launch requirements;
* API lifecycle;
* tracking;
* score;
* completion;
* success;
* suspend data;
* sequencing where applicable;
* sandbox requirements.

Do not implement a new SCORM runtime unless evidence shows an existing library is unsuitable.

## H5P

Investigate current options such as `h5p-standalone` and the current H5P runtime architecture.

Determine whether H5P packages embedded in Moodle backups can be reconstructed and launched safely.

## Moodle Quiz

Do **not** claim that MBZoo can faithfully execute Moodle `mod_quiz` unless this is demonstrated.

Research Moodle's Question Engine, question behaviours and question-type plugins.

Assume initially that a faithful Moodle quiz runtime cannot be reproduced from backup data alone without reimplementing significant Moodle PHP behaviour.

Design instead for:

```text
Quiz inspection
      ↓
question reconstruction
      ↓
preview
      ↓
optional MBZoo "practice mode"
```

A future practice mode may progressively support standard question types such as:

* multichoice;
* truefalse;
* shortanswer;
* numerical;
* matching;
* essay display.

Clearly distinguish:

```text
Moodle-compatible rendering
```

from:

```text
MBZoo practice mode
```

Never pretend they are equivalent.

---

# 7. Export capabilities

Architect MBZoo so that it can eventually support:

```text
MBZ
 ├── JSON model
 ├── reconstructed original files
 ├── static HTML course
 ├── static ZIP archive
 ├── individual SCORM extraction
 ├── individual H5P extraction
 └── future format conversion
```

The initial architecture must not make static export unnecessarily difficult.

Do not attempt to generate new Moodle `.mbz` backups during the initial phase.

Reading backups and generating Moodle-compatible backups are substantially different problems.

---

# 8. Performance is a primary requirement

A core project goal is:

> Drag an `.mbz` file and see useful course information as quickly as possible.

Do not design only for tiny fixtures.

Research realistic strategies for backups in ranges such as:

```text
10 MB
100 MB
500 MB
1 GB
4+ GB
```

Do not load an entire multi-gigabyte backup into memory by default.

Evaluate:

* streaming;
* random access where archive format permits it;
* lazy extraction;
* lazy XML parsing;
* Web Workers;
* transferable objects;
* SharedArrayBuffer only if genuinely justified;
* OPFS;
* IndexedDB where appropriate;
* memory backpressure;
* object URLs;
* progressive course rendering.

The ideal experience should resemble:

```text
drop MBZ
  ↓
detect archive
  ↓
read minimum metadata
  ↓
show course name and structure
  ↓
continue indexing lazily
```

Do not make the user wait for every binary asset to be extracted before showing the course.

Define measurable performance targets after collecting evidence.

---

# 9. Security model

Treat every `.mbz` as an **untrusted file**.

This is mandatory.

Investigate and explicitly document threats including:

* path traversal / Zip Slip;
* archive bombs;
* extreme compression ratios;
* maliciously huge entries;
* malformed archives;
* XML entity expansion;
* XXE;
* XML bombs;
* malicious HTML;
* JavaScript embedded in course content;
* SVG script execution;
* unsafe MIME handling;
* Blob URL lifetime;
* unsafe iframe navigation;
* SCORM packages with arbitrary JavaScript;
* H5P JavaScript;
* external network requests;
* popup escape;
* same-origin access;
* malicious filenames;
* Unicode/path ambiguities;
* corrupted backups.

Interactive content must not execute with arbitrary access to the MBZoo application context.

Research a sandbox architecture using mechanisms such as:

* sandboxed iframes;
* opaque origins where possible;
* restrictive CSP;
* `postMessage` bridges;
* explicit capability boundaries.

Do not simply insert backup HTML with unsanitized `innerHTML`.

Security decisions must have ADRs.

---

# 10. Privacy model

Moodle backups may contain:

* names;
* email addresses;
* student submissions;
* grades;
* comments;
* logs;
* messages;
* private files;
* other personal information.

MBZoo should follow a local-first model.

For the web viewer:

* no course data should leave the browser by default;
* no telemetry should include course contents;
* no third-party analytics should be introduced by default;
* external resources referenced by the course require careful consideration;
* exporting data must be an explicit user action.

Create documentation explaining this model.

Never commit real Moodle backups containing personal information.

---

# 11. Fixtures and evidence

Tests need realistic `.mbz` backups, but repository fixtures must be safe.

Prefer:

1. synthetic backups generated for MBZoo;
2. deliberately created Moodle demo courses;
3. properly licensed public examples;
4. minimized test fixtures derived from data we are allowed to redistribute.

Never add an arbitrary real institution course backup to Git.

For every fixture record:

* source;
* Moodle version;
* backup options;
* included activity types;
* license/provenance;
* whether it contains user data;
* SHA-256 checksum;
* expected parser characteristics.

Create a fixture manifest.

---

# 12. Technical architecture constraints

The project should be structured as a monorepo.

The exact package split must be justified, but evaluate an architecture similar to:

```text
mbzoo/
├── apps/
│   ├── viewer/
│   └── cli/
│
├── packages/
│   ├── core/
│   ├── archive/
│   ├── moodle/
│   ├── activities/
│   ├── exporter/
│   └── runtime/
│
├── fixtures/
├── docs/
├── research/
├── .agents/
└── .github/
```

Avoid premature package fragmentation.

Create a package only where a real architectural boundary exists.

---

# 13. `core` portability requirement

This is a key architectural constraint.

The core MBZ parsing/model layer should not unnecessarily depend on:

```text
Bun.*
Node.js-specific APIs
browser DOM APIs
Vite-specific APIs
UI framework APIs
```

Prefer portable Web Platform primitives where suitable:

```text
Uint8Array
ArrayBuffer
ReadableStream
Blob abstractions where appropriate
TextDecoder
structured data
```

If filesystem or runtime-specific behaviour is needed, place it behind adapters.

The desired direction is:

```text
                   MBZoo core
                   /        \
                  /          \
          Browser adapter    Bun adapter
                ↓                 ↓
             Viewer              CLI
```

Evaluate whether Node.js and Deno compatibility can be retained cheaply.

Do not sacrifice the browser product merely for theoretical portability.

Record the decision.

---

# 14. Language evaluation

TypeScript is the leading candidate, but do not accept it merely because it has already been suggested.

Evaluate at least:

* TypeScript;
* Rust/WASM for performance-critical components;
* whether any additional language has a justified role.

Consider:

* browser execution;
* streaming;
* archive support;
* XML parsing;
* developer productivity;
* code sharing with CLI;
* testing;
* ecosystem maturity;
* maintainability;
* contributor accessibility;
* bundle size;
* WASM startup/copying costs;
* memory behaviour.

The expected outcome may well be:

> TypeScript everywhere initially, introducing Rust/WASM only if profiling demonstrates a real bottleneck.

But this must be an evidence-based conclusion, not a predetermined answer.

Create an ADR.

---

# 15. Bun evaluation

Bun is the leading candidate for repository tooling.

Evaluate separately its suitability as:

1. package manager;
2. workspace/monorepo manager;
3. script runner;
4. unit test runner;
5. TypeScript runtime for CLI;
6. CLI compiler;
7. web development server;
8. frontend production bundler.

These are separate decisions.

Do not write an ADR whose reasoning is merely "Bun is fast".

Research current Bun documentation and behaviour as of the execution date.

Evaluate:

* workspaces;
* isolated installs;
* lockfile behaviour;
* catalogs if useful;
* `bun:test`;
* coverage;
* package compatibility;
* executable compilation;
* Web Worker bundling;
* browser targeting;
* source maps;
* code splitting;
* HMR;
* WASM;
* plugin ecosystem;
* long-term portability;
* CI setup;
* security/supply-chain implications.

---

# 16. Bun vs Vite

Do not frame Bun and Vite as total replacements for one another.

Investigate two concrete frontend options:

### Option A

```text
Bun
├── package manager
├── workspaces
├── tests
├── dev server
└── browser bundler
```

### Option B

```text
Bun
├── package manager
├── workspaces
├── tests
└── CLI

Vite
├── browser dev server
├── Web Worker build
└── production browser build
```

Compare them using actual requirements for MBZoo:

* Workers;
* large binary assets;
* code splitting;
* WASM;
* HMR;
* browser compatibility;
* static deployment;
* GitHub Pages;
* bundle analysis;
* CSP;
* service worker/PWA potential;
* test integration.

If uncertainty remains, create a minimal reproducible experiment instead of guessing.

Record:

* commands;
* versions;
* environment;
* build time;
* bundle output;
* browser behaviour;
* limitations.

Then create an ADR.

---

# 17. UI technology evaluation

Do not introduce React because it is common.

Evaluate the UI complexity.

Compare at least:

* vanilla TypeScript + DOM;
* Lit;
* Preact;
* another lightweight framework only if justified.

Consider:

* course tree;
* activity renderers;
* progressive loading;
* state management;
* accessibility;
* bundle size;
* component isolation;
* contributor familiarity;
* long-term maintenance.

The viewer should remain lightweight.

Avoid a large SPA framework unless the requirements justify it.

Record the decision.

---

# 18. Archive library evaluation

Research and compare current libraries rather than selecting one from memory.

Evaluate at least relevant candidates such as:

* zip.js;
* fflate;
* other actively maintained browser archive libraries;
* WASM-based options if relevant.

Requirements include:

* ZIP;
* ZIP64;
* large files;
* Web Streams;
* Workers;
* random access;
* extraction of individual entries;
* memory behaviour;
* browser support;
* TypeScript API quality;
* maintenance;
* license;
* security history.

TAR.GZ may require a different strategy.

Do not force ZIP and TAR.GZ into the same implementation if their access characteristics differ.

Create an experiment using realistic archive sizes if necessary.

---

# 19. XML parser evaluation

Moodle backups are XML-heavy.

Evaluate:

* DOM-based parsing;
* SAX/event-based parsing;
* streaming XML libraries;
* current TypeScript/browser XML libraries.

Requirements:

* large `files.xml`;
* predictable memory usage;
* no external entity resolution;
* malformed XML handling;
* namespaces where applicable;
* TypeScript support;
* browser and CLI reuse.

Do not select the XML parser based solely on API convenience.

Security and memory behaviour matter.

---

# 20. Internal normalized model

Design a normalized model independent of Moodle XML serialization and independent of the UI.

Conceptually it should represent things such as:

```text
Backup
Course
Section
Activity
File
Question
Resource
Plugin
```

Do not expose arbitrary parser-library object structures throughout the application.

Preserve source/provenance metadata when helpful for debugging.

Activity-specific information should support typed extension without reducing all plugin data to `any`.

Use `unknown` at trust boundaries and validate before narrowing.

Avoid unsafe type assertions.

---

# 21. Activity architecture

Investigate a plugin/renderer model conceptually similar to:

```text
Moodle activity
      ↓
activity parser
      ↓
normalized activity model
      ↓
renderer
      ↓
optional launcher
```

A module might support different capabilities:

```text
inspect
render
launch
export
```

For example:

```text
Page
  inspect ✅
  render  ✅
  launch  —
  export  ✅

SCORM
  inspect ✅
  render  ✅
  launch  ✅
  export  ✅

Unknown plugin
  inspect ✅
  render  fallback
  launch  ❌
  export  files/metadata
```

Do not make execution mandatory for a renderer.

---

# 22. Testing strategy

Design testing as part of the architecture.

Evaluate and document at least:

## Unit tests

Candidates:

* `bun:test`;
* Vitest if browser-oriented functionality materially benefits from it.

## Browser integration / E2E

Use Playwright unless research identifies a stronger reason not to.

Test relevant functionality against:

* Chromium;
* Firefox;
* WebKit.

Do not assume JavaScriptCore/Bun tests prove browser interoperability.

## Parser fixtures

Use golden fixtures for:

* empty course;
* sections;
* pages;
* books;
* files;
* assignments;
* quiz;
* SCORM;
* H5P;
* user data;
* malformed backup;
* unsupported plugin;
* ZIP;
* TAR.GZ;
* ZIP64 where practical.

## Security tests

Include explicit tests for:

* traversal paths;
* archive bombs or safe simulated equivalents;
* malicious HTML;
* XML attacks;
* invalid MIME metadata;
* dangerous filenames.

## Performance tests

Create reproducible benchmarks for the parser and archive layer.

Do not put unstable wall-clock thresholds into normal CI without justification.

---

# 23. Code quality tooling

Evaluate current tools and select a deliberately small stack.

Candidates include:

* Biome;
* ESLint;
* Prettier;
* TypeScript compiler;
* dependency/license auditing tools.

Prefer fewer overlapping tools.

If Biome can adequately handle formatting/linting requirements, do not add ESLint + Prettier merely by habit.

If ESLint is required for important semantic rules, document why.

All code, comments, documentation, commit messages, ADRs and agent instructions must be in **English**.

Enable strict TypeScript settings.

Evaluate options such as:

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true
```

Use them unless they cause a demonstrated interoperability problem.

---

# 24. CI/CD

Create GitHub Actions suitable for an open-source TypeScript monorepo.

At minimum consider:

```text
install with frozen lockfile
lint
format check
typecheck
unit tests
coverage
build
browser tests
security checks
dependency checks
```

Optimize CI so that normal PR feedback remains fast.

Consider separating:

### PR checks

Fast mandatory checks.

### Full browser compatibility

Potentially a matrix or scheduled workflow if expensive.

### Releases

Only after there is something meaningful to release.

### Static viewer deployment

Evaluate GitHub Pages as a natural deployment target because the application should be static and client-side.

Do not deploy automatically until repository conventions and target environment are understood.

Pin critical GitHub Actions appropriately.

Record decisions that affect the supply chain.

---

# 25. Dependency policy

Every production dependency should have a reason.

Before introducing a major dependency record:

* purpose;
* license;
* maintenance status;
* bundle impact where relevant;
* browser support;
* alternatives considered.

Prefer permissively licensed dependencies compatible with MIT distribution.

Do not accidentally incorporate GPL code into the MIT core by translating or copying Moodle source implementations.

It is acceptable to study Moodle source code and documentation to understand the backup format and behaviour.

Do not perform line-by-line PHP-to-TypeScript ports of GPL Moodle implementations into MIT packages.

Document provenance carefully.

---

# 26. Research and evidence system

Create a research structure inspired by the reference repositories.

Use English throughout.

A reasonable starting structure is:

```text
research/
├── README.md
├── AGENTS.md
├── status.yaml
│
├── sources/
│   ├── repositories/
│   ├── standards/
│   └── technologies/
│
├── analysis/
│   ├── notes/
│   └── matrices/
│
├── decisions/
│   ├── adr/
│   └── sdd/
│
├── experiments/
│   └── results/
│
├── evidence/
│
├── fixtures/
│
├── tasks/
│   ├── backlog/
│   ├── journal/
│   └── questions/
│
├── compliance/
│   ├── security/
│   ├── privacy/
│   ├── accessibility/
│   └── licensing/
│
├── templates/
├── schemas/
├── tools/
└── indexes/
```

Adapt this only when there is a reason.

---

# 27. Evidence rules

Adopt these rules.

## Evidence before preference

A durable technical claim should point to one of:

* official documentation;
* source code with repository + commit/tag;
* specification;
* reproducible experiment;
* benchmark;
* issue/PR;
* previous ADR.

## Separate layers

Keep separate:

```text
FACT
what was observed

INTERPRETATION
what we think it means

DECISION
what MBZoo will do
```

Never turn interpretation into fake fact.

## No invented evidence

If information cannot be verified:

```text
[PENDING: verification required]
```

Do not manufacture a source, version, benchmark or result.

## External sources

Record:

* stable ID;
* title;
* canonical URL;
* source type;
* version/tag/commit where relevant;
* access date;
* license when relevant;
* short summary;
* claims supported by the source.

Do not mirror entire third-party documentation unnecessarily.

## Experiments

Each experiment must record:

* objective;
* hypothesis;
* environment;
* OS;
* runtime versions;
* dependency versions;
* exact command;
* fixture;
* measurements;
* result;
* limitations;
* conclusion;
* repository commit where applicable.

An experiment should be reproducible by another contributor.

---

# 28. Stable identifiers

Use stable monotonic IDs.

Suggested namespaces:

```text
REPO-001  external repository
STD-001   standard/specification
TECH-001  technology/library
AN-001    analysis
EXP-001   experiment
ADR-0001  architecture decision
SDD-0001  software design document
TASK-001  task
Q-001     open research question
RISK-001  tracked risk
```

IDs must never be reused.

Accepted ADRs must not be silently rewritten when a decision changes.

Instead:

```text
ADR-0007 supersedes ADR-0002
```

Preserve history.

---

# 29. ADR policy

Create an ADR for durable decisions such as:

* primary implementation language;
* Bun usage;
* frontend build system;
* monorepo structure;
* archive processing strategy;
* XML parser;
* normalized model;
* activity plugin architecture;
* large-file strategy;
* sandbox model;
* testing strategy;
* UI technology;
* dependency/licensing policy.

An ADR must include:

```text
Status
Date
Context
Problem
Evidence
Options considered
Decision
Consequences
Risks
Rejected alternatives
Related sources
Related experiments
Supersedes / Superseded by
```

Do not create an ADR for trivial implementation details.

---

# 30. SDD policy

Use an SDD before implementing a substantial cross-cutting feature.

An SDD should describe:

* problem;
* goals;
* non-goals;
* functional design;
* architecture;
* data flow;
* interfaces;
* security;
* failure behaviour;
* testing;
* migration/compatibility where relevant;
* implementation plan.

Extract durable decisions into ADRs instead of burying them only in the SDD.

---

# 31. Generated indexes

Do not force contributors to manually maintain lists that can drift.

Create small repository tools to generate useful indexes such as:

```text
research/indexes/sources.yaml
research/indexes/adrs.yaml
research/indexes/experiments.yaml
research/indexes/tasks.yaml
```

Consider also a machine-readable root index such as:

```text
architecture-records.json
```

if it provides real value.

Create validation scripts for identifiers, references and required metadata.

Generated files must say that they are generated.

CI should detect stale generated indexes.

---

# 32. Agent instructions

Create a strong root:

```text
AGENTS.md
```

It must explain:

* project purpose;
* current maturity;
* repository map;
* architecture boundaries;
* mandatory commands;
* coding conventions;
* security rules;
* testing expectations;
* documentation rules;
* evidence rules;
* ADR/SDD workflow;
* fixture/privacy restrictions;
* definition of done;
* files generated automatically;
* what agents must never do.

Do not let `AGENTS.md` become a historical diary.

Keep durable operational guidance there.

Historical research belongs under `research/`.

Create additional scoped `AGENTS.md` files only where directory-specific rules genuinely differ, for example:

```text
research/AGENTS.md
```

---

# 33. Agent Skills

Create project-local skills using the interoperable convention:

```text
.agents/skills/<skill-name>/SKILL.md
```

Do not create dozens of trivial skills.

Create a small number of useful, project-specific skills.

At minimum evaluate creating:

```text
.agents/skills/
├── mbz-research/
│   └── SKILL.md
├── mbz-fixture/
│   └── SKILL.md
├── architecture-decision/
│   └── SKILL.md
├── mbz-parser/
│   └── SKILL.md
└── release-check/
    └── SKILL.md
```

Possible responsibilities:

### `mbz-research`

How to:

* research Moodle internals;
* register a source;
* distinguish fact/interpretation;
* create experiments;
* update generated indexes.

### `mbz-fixture`

How to:

* create a safe test Moodle backup;
* strip personal data;
* document provenance;
* calculate checksums;
* add expected properties.

### `architecture-decision`

How to:

* determine whether an ADR is required;
* research alternatives;
* reference evidence;
* write/supersede ADRs.

### `mbz-parser`

Project-specific invariants for:

* archive handling;
* XML;
* file lookup;
* normalized model;
* trust boundaries;
* parser tests.

### `release-check`

Future release gates:

* tests;
* build;
* licensing;
* generated indexes;
* security;
* documentation;
* artifacts.

Follow the current Agent Skills specification/conventions.

Do not invent incompatible proprietary skill formats.

---

# 34. Other agent compatibility files

Inspect what the ATE/eXeLearning repositories currently do.

Prefer:

```text
AGENTS.md
```

as the canonical project instruction file.

If additional agent clients require files such as `CLAUDE.md`, prefer a minimal compatibility mechanism rather than duplicating large instructions that will diverge.

Document whatever convention is chosen.

Do not create redundant copies without justification.

---

# 35. Root documentation

The repository should eventually contain at least:

```text
README.md
LICENSE
CONTRIBUTING.md
SECURITY.md
DEVELOPMENT.md
AGENTS.md
docs/ARCHITECTURE.md
docs/PRIVACY.md
```

Keep documentation proportional to the project's maturity.

Do not fill files with generic boilerplate merely to satisfy a checklist.

---

# 36. README requirements

The first README should explain clearly:

```text
MBZoo
See what's inside your MBZ.
```

Explain:

* what MBZoo is;
* that `.mbz` means Moodle course backup;
* local-first/client-side processing;
* current maturity;
* what currently works;
* planned capabilities;
* privacy model;
* development commands;
* license.

Do not advertise capabilities that are only planned.

Clearly distinguish:

```text
Implemented
Experimental
Planned
```

---

# 37. Accessibility

The viewer itself must target WCAG 2.2 AA where practical.

Research appropriate automated accessibility testing.

Consider:

* axe;
* Playwright accessibility tests;
* keyboard navigation;
* semantic course tree;
* focus management;
* screen-reader announcements during long parsing operations;
* reduced motion;
* contrast.

Accessibility is a quality requirement, not a late feature.

---

# 38. Internationalization

The project UI may eventually need multiple languages.

Evaluate whether introducing i18n infrastructure during bootstrap is justified.

Do not hard-code an architecture that makes translation difficult.

Do not add a heavy i18n framework before it is needed.

Source code and technical documentation remain English.

---

# 39. Browser support

Define and document a browser support policy based on actual required Web APIs.

Pay particular attention to:

* Web Workers;
* Web Streams;
* File API;
* OPFS;
* Compression Streams;
* transferable objects;
* WASM if used.

Do not silently depend on APIs that exclude an important supported browser.

Use progressive enhancement or fallbacks where economically reasonable.

---

# 40. Initial implementation scope

After research and foundational ADRs, implement only a **thin vertical slice** sufficient to prove the architecture.

A suitable first vertical slice is:

```text
drop .mbz
   ↓
detect archive
   ↓
read Moodle backup metadata
   ↓
parse course and sections
   ↓
display course title
   ↓
display section/activity tree
```

It does **not** need to launch SCORM, H5P or Moodle quizzes yet.

Use one or more safe synthetic fixtures.

The vertical slice should demonstrate:

* monorepo works;
* browser app works;
* parser package works;
* Worker boundary if selected;
* tests work;
* CI works;
* build is deployable as static files.

Do not build a polished application before validating the architecture.

---

# 41. Suggested initial research questions

Create and investigate questions equivalent to:

```text
Q-001
What exact archive formats can current supported Moodle versions produce for .mbz backups?

Q-002
What is the minimum XML/file subset required to reconstruct a course navigation tree?

Q-003
How should files.xml and the content-addressed backup file store be indexed efficiently?

Q-004
Can ZIP archives be inspected lazily without extracting binary assets?

Q-005
What is the appropriate streaming strategy for TAR.GZ backups?

Q-006
What browser memory limits materially affect MBZoo?

Q-007
Should temporary large-file data use memory, OPFS, IndexedDB, or a hybrid?

Q-008
Which XML parsing strategy provides the best memory/security trade-off?

Q-009
Should the viewer use Bun's browser bundler or Vite?

Q-010
Which UI approach provides the smallest maintainable component model?

Q-011
How should arbitrary embedded Moodle content be sandboxed?

Q-012
Can SCORM content be launched safely with scorm-again?

Q-013
Can Moodle H5P activities be reconstructed for h5p-standalone?

Q-014
Which Moodle quiz question types can be represented independently without reproducing Moodle's Question Engine?

Q-015
What static export model best preserves course navigation and assets?
```

Adapt these after examining real evidence.

---

# 42. Initial technical candidates to investigate

These are **candidates, not mandated choices**:

```text
Language
  TypeScript

Repository runtime/tooling
  Bun

Frontend builder
  Bun bundler
  Vite

Archive
  zip.js
  fflate
  TAR/GZIP alternatives

XML
  DOMParser
  SAX/event parser
  maintained TypeScript XML libraries

HTML security
  DOMPurify
  browser/platform alternatives

SCORM
  scorm-again

H5P
  h5p-standalone

Unit tests
  bun:test
  Vitest

Browser/E2E
  Playwright

Quality
  Biome
  ESLint only if needed
  TypeScript strict checking
```

Research current releases, maintenance activity, licenses and compatibility before installing them.

Do not install all candidates.

---

# 43. Initial ADRs expected

Do not create them before doing the necessary research.

Likely initial ADR candidates are:

```text
ADR-0001 — Primary implementation language
ADR-0002 — Monorepo and package manager
ADR-0003 — Browser build strategy: Bun vs Vite
ADR-0004 — Portable core boundary
ADR-0005 — Archive abstraction and large-file strategy
ADR-0006 — XML parsing strategy
ADR-0007 — UI architecture
ADR-0008 — Testing strategy
ADR-0009 — Untrusted-content sandbox model
ADR-0010 — Research/evidence and documentation workflow
```

If two decisions are tightly coupled, combine them.

Do not manufacture ten ADRs merely because this prompt lists ten examples.

---

# 44. Dependency and license report

Create an initial license analysis.

MBZoo itself is MIT.

Confirm compatibility for every dependency selected for the initial implementation.

Record at minimum:

```text
package
version
license
purpose
source
notes
```

Pay special attention to dependencies related to:

* Moodle;
* SCORM;
* H5P;
* archive handling.

Do not infer license compatibility from package popularity.

---

# 45. Continuous integration target

At the end of bootstrap, there should be a canonical local validation command, ideally something similar to:

```bash
bun run check
```

which coordinates the relevant checks.

Individual scripts should remain available, e.g.:

```bash
bun run lint
bun run format:check
bun run typecheck
bun test
bun run build
bun run test:e2e
```

Use names justified by the chosen tooling.

CI and local development should execute the same underlying commands.

---

# 46. Definition of done for this bootstrap task

Do not consider this first task complete until:

* the three reference repositories have been inspected and recorded;
* relevant upstream Moodle documentation/source has been inspected;
* project goals and non-goals are documented;
* research/evidence structure exists;
* source records exist;
* initial research questions exist;
* important technology options have been compared;
* experiments have been run where documentation alone is insufficient;
* foundational ADRs have been written;
* root `AGENTS.md` exists;
* `research/AGENTS.md` exists if justified;
* useful project-specific Agent Skills exist;
* the monorepo has been bootstrapped;
* the selected tooling is configured;
* strict TypeScript checking works if TypeScript is selected;
* lint/format tooling works;
* unit testing works;
* browser testing infrastructure works;
* CI works;
* MIT license exists;
* security/privacy principles are documented;
* safe fixture policy exists;
* at least one synthetic fixture exists;
* the thin vertical slice can open a test `.mbz` and render meaningful course metadata/structure;
* documentation states clearly what is and is not implemented;
* generated research indexes validate correctly.

---

# 47. Things you must not do

Do not:

* invent research findings;
* invent benchmark numbers;
* assume a library is maintained without checking;
* choose technology only because it is fashionable;
* assume `.mbz` is always ZIP;
* upload backups to a remote service;
* commit real personal Moodle data;
* execute arbitrary course JavaScript in the main application origin;
* blindly copy Moodle GPL code into MIT TypeScript code;
* claim MBZoo faithfully runs Moodle quizzes without proving it;
* implement every activity immediately;
* add a large frontend framework without evidence;
* split the monorepo into many packages without real boundaries;
* create duplicate agent instruction files that will drift;
* edit generated indexes manually;
* rewrite accepted ADR history;
* store conclusions without their supporting evidence;
* create GitHub issues or pull requests merely to obtain IDs;
* push, merge or publish releases unless explicitly authorized.

---

# 48. Working methodology

Work in this order:

```text
1. Inspect repository
2. Inspect reference projects
3. Research upstream Moodle/standards/libraries
4. Register sources
5. Identify questions
6. Analyze alternatives
7. Run focused experiments where needed
8. Record findings
9. Write ADRs
10. Bootstrap architecture
11. Implement thin vertical slice
12. Test
13. Run security/quality checks
14. Generate indexes
15. Reconcile documentation with actual code
```

Do not invert this into:

```text
pick stack
→ implement
→ write ADR explaining what we already happened to do
```

ADRs should capture actual informed decisions, not retroactive justification.

---

# 49. Final verification

Before finishing, execute every available validation command.

Record the exact results.

Ensure:

```text
install        PASS
lint           PASS
format         PASS
typecheck      PASS
unit tests     PASS
build          PASS
browser smoke  PASS
research check PASS
```

If something cannot pass, report it explicitly and create a tracked task/question.

Never report a test as passing if it was not executed.

---

# 50. Final report to me

When finished, provide a concise report containing:

## Repository foundation

What was created.

## Architecture

The main package boundaries.

## Decisions

List ADR IDs and one-line decisions.

## Evidence

Important sources and experiments.

## Technology choices

What was selected and, importantly, what was rejected.

## Vertical slice

What currently works end-to-end.

## Tests

Exact test/build/check results.

## Risks

The most important unresolved technical risks.

## Open questions

Tracked question IDs.

## Next step

Recommend **one** next implementation milestone.

Do not hide uncertainty.

The repository after this task should be a trustworthy technical foundation for MBZoo, not merely a generated project skeleton.

