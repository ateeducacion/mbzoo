---
id: ADR-0017
title: Sandboxed previews — inline data: assets and author links in a new tab
status: Accepted
date: 2026-08-25
sources: [TECH-010]
experiments: []
related: [ADR-0009, ADR-0012, ADR-0013, ADR-0016]
supersedes: [ADR-0014]
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0017: Sandboxed previews — inline data: assets and author links in a new tab

## Context

ADR-0014 established static previews: pdf.js onto canvas, and course HTML
inside an `sandbox="allow-scripts"` iframe with an injected CSP, with
relative `src`/`href` rewritten to **blob: URLs** of sibling archive files.

Testing against two real institutional backups (SMR_SR, SMR_MME — TAR.GZ,
116 MB and 645 MB, inspected locally and never vendored) showed the blob:
half of that decision does not work. A single `resource` in SMR_SR is an
eXeLearning export of 110 files — one `index.html` plus CSS, JS and
images, referenced by 36 relative `src` and 10 relative `href`. Every one
of the 31 images failed:

```
Not allowed to load local resource: blob:http://127.0.0.1:4173/…
```

`sandbox` without `allow-same-origin` gives the frame an **opaque
origin**. A blob: URL minted by the app origin is not loadable from
there, so images, stylesheets and scripts were all silently dead. The
synthetic fixture never caught it because its HTML has no sub-resources.

Separately, the author's 38 external links did nothing: `sandbox` without
`allow-popups` blocks opening a tab, and the CSP's `default-src 'none'`
means the frame cannot navigate itself to a remote page either.

## Problem

How can a multi-file course site render faithfully — assets loaded, the
author's links usable — without granting the frame same-origin access or
a network channel?

## Decision drivers

- The frame must never reach the app origin: no `allow-same-origin`.
- No network egress from the frame (ADR-0009): `connect-src 'none'`.
- Backup-provided scripts still run only inside the sandbox (ADR-0013).
- A preview that silently drops every image is worse than useless — it
  misrepresents the backup's contents.

## Options considered

### Option A: Inline assets as data: URIs, allow popups — chosen

Rewrite relative refs to `data:` URIs, which travel with the document and
load fine on an opaque origin. Add `allow-popups` and
`allow-popups-to-escape-sandbox` so author links open a real tab.

### Option B: `allow-same-origin` so blob: URLs resolve

One attribute, everything works as originally designed.

### Option C: Leave assets broken, list links outside the frame

Keep the grant list untouched; surface external links in a panel beside
the preview.

## Decision

We will keep ADR-0014's shape and change two things.

Restated in full, superseding ADR-0014:

1. **PDF**: pdf.js onto canvas, page-limited, download fallback. No
   iframe. (Unchanged.)
2. **HTML**: an iframe with an opaque origin plus injected CSP. The grant
   list is exactly `allow-scripts allow-popups
   allow-popups-to-escape-sandbox`. **`allow-same-origin` is forbidden**,
   and so is `allow-top-navigation`: the frame must never reach the app
   nor replace the MBZoo page.
3. **Assets**: relative `src`/`href` resolve to **inline `data:` URIs**,
   not blob: URLs, capped at 8 MB per asset. CSS `url(...)` is resolved
   the same way. The CSP therefore lists `data:` alongside `blob:` for
   img/style/script/media/font. `connect-src` stays `'none'`.
4. **Author links**: `http(s)` anchors are retargeted to
   `target="_blank" rel="noopener noreferrer nofollow"`. The `href` is
   left as written — it is the author's link, not ours to rewrite. `rel`
   is replaced wholesale so an author-supplied `rel` cannot weaken it.
5. **CSS/JS/text**: text previews; never injected into the app document.
   (Unchanged.)

## Consequences

### Positive

- Multi-file course sites render as their author built them: in SMR_SR,
  31 of 31 images now load where 0 did.
- No same-origin grant, no network grant. The frame still cannot read the
  app or phone home.
- `data:` inlining is the same mechanism ADR-0016 uses for HTML export.

### Negative

- **`allow-popups-to-escape-sandbox` lets backup-provided script call
  `window.open()` into an unsandboxed tab.** This is a real widening,
  accepted deliberately; see the pre-mortem below.
- `data:` inflates payloads by roughly a third, and assets are duplicated
  per referencing document rather than shared.
- Assets over 8 MB stay unresolved.

### Neutral

- `script-src data:` is added, but the frame could already run backup
  scripts via `'unsafe-inline'` and `blob:` under ADR-0014. It changes
  the transport, not whether author code runs.

## Risks

- **A hostile backup opens a phishing tab.** Popups need user activation
  in practice, the tab is a plain browser tab the user can inspect, and
  MBZoo is a local inspection tool for a file the user already has.
  Mitigation is honesty, not prevention: this is the cost of usable
  links, recorded here so it is not discovered by surprise.
- **Grant creep.** Mitigated by an e2e test pinning the exact grant list
  as a sorted array, so any future widening fails CI and has to be
  argued for in an ADR.
- **Memory on asset-heavy sites.** Bounded by the 8 MB per-asset cap.

## Validation

- `e2e/viewer.spec.ts` — a multi-file site fixture asserts its relative
  image actually paints (`naturalWidth > 0`) and its stylesheet applies;
  the isolation test pins the sandbox grant list exactly and still proves
  no parent access and no network egress.
- Verified against the real SMR_SR backup: 31/31 images load, external
  links carry `target="_blank"`.

## Follow-up work

- Deep relative resolution across directories is still suffix-matched
  (ADR-0014's known limit, Q-011).
- Sharing one asset across sibling documents instead of re-inlining.

## References

- ADR-0014 — superseded by this record.
- ADR-0009 — no telemetry, no upload, no automatic remote fetch.
- ADR-0016 — per-activity export, which uses the same data: inlining.
- TECH-010 — pdf.js.

---

## Addendum: Investigation

### Constraints

The frame's opaque origin is the whole point of ADR-0014 and was treated
as immovable. That fixes the asset problem's shape: whatever the frame
loads must be carried *in* the document, because anything addressed by
app-origin URL is unreachable by construction.

### Comparative matrix

| Criterion | A: data: + popups | B: allow-same-origin | C: leave broken |
|---|---|---|---|
| Assets load | Yes | Yes | No |
| Author links work | Yes, in a new tab | Yes | Only outside the frame |
| Frame can reach app DOM/storage | No | **Yes** | No |
| Network egress | No (`connect-src 'none'`) | No | No |
| New risk | Script can open a tab | Full app compromise | None |
| Cost | +33% payload | None | Preview misrepresents backup |

### Option notes

**Option B is the one to reject loudly.** It is the smallest diff and it
would work, which is exactly what makes it dangerous: `allow-same-origin`
combined with `allow-scripts` lets the framed document script the parent,
read storage and defeat the entire premise of ADR-0014. Backup HTML is
hostile input (root `AGENTS.md` §1–2). Not an option at any convenience.

**Option C** was the conservative choice and was offered. It leaves the
preview lying about the backup: a course page shown without its images is
not the page the author wrote. Rejected in favour of A, with the popup
cost recorded rather than hidden.

### Adversarial review

- *Does `allow-popups-to-escape-sandbox` let the frame touch MBZoo?* No.
  It affects the **opened** context, not the opener. The frame stays on
  an opaque origin with no `allow-same-origin`.
- *Can the frame replace the MBZoo page?* No. `allow-top-navigation` is
  not granted, and the e2e test asserts its absence.
- *Does `data:` let the frame exfiltrate?* No. `connect-src 'none'`, and
  data: URIs are constructed by MBZoo from bytes already read out of the
  user's own file.
- *Can an author's `rel="opener"` re-enable window.opener?* No. `rel` is
  replaced, not appended.
- *Could `script-src data:` smuggle new code?* The frame already executed
  arbitrary author script under `'unsafe-inline'` before this change.
  The isolation boundary, not the script's transport, is what contains
  it.
- *What breaks first at scale?* A site with a large video: the 8 MB cap
  drops it and the element renders empty. Preferable to inlining a
  hundred-megabyte base64 string into a document.

### Evidence

- Failure reproduced against a real backup before any change: 31/31
  images broken, console full of `Not allowed to load local resource:
  blob:…`.
- Reproduced synthetically in `websiteFixture()` so the regression is
  covered by CI without shipping institutional data — the fixture is a
  1×1 PNG, a one-rule stylesheet and one external link.
- The real backups (SMR_SR, SMR_MME) were inspected locally only. Per
  the root `AGENTS.md` fixture rules they are never committed.
