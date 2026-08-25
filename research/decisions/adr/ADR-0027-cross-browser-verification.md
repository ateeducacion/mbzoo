---
id: ADR-0027
title: Every browser runs on every change, and the worker stays one chunk
status: Accepted
date: 2026-08-25
sources: [TECH-008]
experiments: []
related: [ADR-0002, ADR-0005, ADR-0008]
supersedes: []
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0027: Every browser runs on every change, and the worker stays one chunk

## Context

CI ran Chromium on every push and pull request, and gated Firefox and WebKit
behind `if: github.event_name == 'schedule'` with a weekly cron. The comment
in the workflow called it "weekly cross-browser verification in addition to
Chromium on every run".

It had verified nothing. The repository was two days old, the cron fires on
Mondays, and across 50 CI runs — 40 `push`, 10 `pull_request` — not one was
a `schedule`. Firefox and WebKit had never executed in CI at all.

Meanwhile WebKit failed 45 of 45 e2e tests locally, for two agents
independently, on unmodified sources. That was read as a broken local
WebKit build. It was not.

## Problem

MBZoo shipped a viewer that did not work in Safari, and the arrangement
meant to catch that had not run once.

## The defect the missing coverage hid

`vite.config.ts` left the worker to code-split. Rolldown then emitted the
worker's entry chunk as **also** a shared vendor chunk, which the worker
itself re-imported:

```
index-*.js  →  new Worker(new URL("worker-X.js", …))    the worker entry
saxes-*.js  →  import { t } from "./worker-X.js"        the same file, shared
```

Chromium's module map dedupes that by URL and evaluates the module once.
WebKit evaluated it twice. The second evaluation reassigned
`self.onmessage` to a fresh module instance whose `session` was `undefined`,
so the sequence was: parse succeeds and the course tree renders, then every
subsequent read answers `No backup is open`. No exception, no console error,
nothing in the network tab — the detail pane simply rendered its header and
tabs and stopped.

In a released build that is a Safari user who opens a backup, sees the
course structure, and finds that no activity will open.

## Decision

1. **Chromium, Firefox and WebKit run on every push and pull request**, as
   one matrix job with `fail-fast: false` so one engine's failure never
   hides another's. The weekly `schedule` trigger is removed; nothing else
   used it.
2. **The worker is built as a single self-contained chunk**
   (`worker.rollupOptions.output.inlineDynamicImports`). A worker entry must
   never double as an importable shared chunk: any environment that resolves
   it under a second URL, or evaluates it twice for any reason, gets a
   second module instance, and the last `self.onmessage` assignment silently
   wins.

Standing rules:

- A browser that is not in CI is a browser MBZoo does not support. Adding a
  browser to the matrix is how support is claimed; a scheduled job is not.
- Worker state lives in module scope, so the worker's bundle must stay one
  chunk. If bundling changes, the invariant to re-check is that no other
  chunk imports the worker entry.

## Consequences

**Positive.** Safari and Firefox are verified on every change rather than
never. The class of bug this hid — silent divergence in module evaluation —
cannot recur unnoticed.

**Negative.** CI does three browser installs and three suites instead of one:
roughly three times the e2e minutes, and a browser-specific failure now
blocks a merge. That is the point, but it is a real cost on a repository
that will accumulate tests.

**Neutral.** The runner still goes through Node. Bun *can* host it — with
`node` absent from `PATH`, `bunx --bun playwright test` passes the full suite
locally — but shipping that to CI crashed the preview server it spawns
(`ERR_STREAM_WRITE_AFTER_END` out of `[WebServer]`), taking 16 Firefox tests
down with it while Chromium and WebKit happened to survive. Load-dependent,
therefore worse than a deterministic failure. Reverted; the Node prerequisite
stands until the child-process piping is understood.

## Risks

- **A flaky test now blocks three times as often.** `concurrent activity
  opens both finish` asserts which of two racing clicks wins, and was
  observed failing once under load on WebKit while passing 3/3 in isolation.
  Tests that assert the outcome of a race need rewriting to assert the
  invariant instead; noted, not fixed here, because it is not this
  decision's code.
- **Engine-specific failures that are not bugs.** WebKit reports the
  sandbox's refusal of the Fullscreen permission policy as a page error
  where Chromium is silent. That assertion now tolerates exactly that
  message rather than any error.

## Validation

- Full suite on all three engines: 171 passing, 0 failing.
- Before the bundling fix, WebKit failed 45 of 45; after it, 2 — the
  Fullscreen reporting difference above, and a real Safari bug where the
  Export menu ignored Escape because Safari does not focus a `<button>` on
  click and the handler was bound inside the menu's subtree. Both fixed.

## References

- TECH-008 — Playwright.
- ADR-0002 — Bun for repository tooling; the runner now needs no Node.
- ADR-0005 — the worker exists because parsing must stay off the main thread.
- ADR-0008 — testing strategy.

---

## Addendum: Investigation

### How it was found

The symptom was the least useful kind: a renderer that stops half-way with
no error. The path to the cause was to stop reading code and make each layer
report its own state.

Logging every worker request and reply showed the parse succeeding and every
read failing with `No backup is open` — so the worker's `session` was unset
at read time while the parse had clearly set it. Logging a per-module random
id inside the worker showed reads arriving at an instance whose parse had
never run. Logging a module-instance id in `main.ts` ruled out the obvious
explanation: one main instance, one `new Worker` call. A counter on
`globalThis` inside the worker then gave `evals=2`, which named the cause
exactly.

The generalisable part: when a module's state appears to vanish, count the
module's evaluations before suspecting the state.

### What the first three-browser run cost, and taught

The first run under this decision went red — on Firefox, on `main`. Sixteen
failures with one cause: the preview server died mid-run and every test after
it got `NS_ERROR_CONNECTION_REFUSED`. The single non-cascade failure, a
gradebook assertion, was simply the test in flight when the server went.

The cause was not the browser matrix. It was a second change made in the same
push: invoking the runner under Bun. That had been verified locally, on
macOS, including with `node` removed from `PATH` — and it was still wrong,
because what broke was Playwright piping a *child* process's output, on
Linux, under load. Two of the three engines passed anyway, which is exactly
the shape of a flake that would have reddened random PRs for weeks.

The lesson is about the verification, not the runtime: "the full suite passes
locally" is evidence about one OS and one machine's timing. A change to how
processes are spawned is not verified until it has run where processes are
spawned differently. Coverage and runtime were separable changes and should
have been separate pushes.

### Why this was invisible for the repository's whole life

Chromium passed. It was the only engine that ever ran, and it is the one
engine whose module map deduped the double URL. The bug was present from the
first commit that introduced the worker, and every green CI run since was
evidence about Chromium and nothing else.
