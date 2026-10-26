---
id: ADR-0022
title: Multi-page sites navigate in-frame through a validated request to MBZoo
status: Accepted
date: 2026-08-25
sources: [REPO-004]
experiments: []
related: [ADR-0009, ADR-0012, ADR-0014, ADR-0017, ADR-0020]
supersedes: [ADR-0020]
ai_tool: claude-code
ai_model: claude-opus-5
---

# ADR-0022: Multi-page sites navigate in-frame through a validated request to MBZoo

## Context

ADR-0020 defused every in-frame link to another page of the same site:
`rewriteRelativeRefs` replaces the `href` with `data-mbz-page`, and
`renderWebsite` offers a row of page buttons instead. It did so because
rendering the target outside the pipeline strands it — a sibling inlined as
a `data:` document cannot resolve its own relative stylesheet, and the CSP
we inject never reaches it, so it could reach the network in violation of
ADR-0009.

In practice a reader opening the 108-file eXeLearning export in
`SMR_SOR_01_09` (REPO-004, inspected locally, never vendored) clicks the
site's own navigation, or the "Siguiente" link at the foot of every page,
and nothing happens. ADR-0020 predicted this exact failure and mitigated it
with a hint and an inert-link style. The mitigation is not enough: the
links are the site's primary navigation.

## Problem

How can a page link inside the opaque-origin sandbox move the reader to
another page of the same resource, when every rendered document must still
pass through `rewriteRelativeRefs` + `retargetExternalLinks` + `injectCsp`,
and the document doing the asking is hostile input?

## Decision drivers

- Nothing may reach the frame that has not been through the pipeline. This
  is ADR-0020's rule and it is not up for renegotiation.
- No new sandbox capability, no CSP widening (ADR-0014, ADR-0017).
- The reader must not be told a link works and then have it silently refused
  — that is ADR-0020's documented failure mode with its mitigations removed.
- Payload bounded by the site, not by its link graph.

## Options

1. **Keep every page link inert (ADR-0020).** Honest but unusable for
   exported courseware, whose navigation *is* the links. Rejected.
2. **Recursively process and inline siblings.** Correct at depth 1,
   O(pages^depth) beyond it, and duplicates every shared asset per page.
   Rejected in ADR-0020 and still rejected.
3. **Defuse the link, but let the document ask the parent to navigate.**
   Chosen.

## Decision

We will let a sandboxed page *request* navigation, and let MBZoo decide.

- `rewriteRelativeRefs` still removes the `href`. A reference that resolves
  to an HTML record which is genuinely one of this render's pages becomes
  `data-mbz-page`; any other HTML record becomes `data-mbz-page-inert` and
  keeps ADR-0020's not-allowed styling. The two attributes exist so MBZoo
  never styles a link as live and then refuses it.
- A page of a multi-page site receives an injected capture-phase listener
  that turns a click on `[data-mbz-page]` into
  `parent.postMessage({source, type, token, page}, '*')`.
- The viewer accepts a message only when all of these hold, and ignores it
  silently otherwise: the `event.source` is identical to the live preview
  iframe's `contentWindow`; at least 250 ms have passed since the last
  accepted navigation; the message echoes the token minted for the document
  currently displayed; and the requested reference, resolved against that
  document's directory and percent-decoded, equals the full path of one of
  this render's pages.

### Standing rules

1. Never inline an HTML document as a `data:` URI. A document that has not
   been through `rewriteRelativeRefs` + `retargetExternalLinks` +
   `injectCsp` must not be reachable from the frame. (Carried forward from
   ADR-0020, unchanged.)
2. A navigation request is authorized by *what it names*, never by where it
   claims to come from. `event.origin` is `"null"` for an opaque origin and
   must never be used as authority.
3. Window identity alone does not authenticate a document. Every rendered
   page carries a freshly minted token, and a request that cannot echo it is
   refused.
4. The navigable set is the HTML records sharing the entry page's context
   and component. It is never widened to the archive.
5. No new sandbox token and no CSP change may be introduced to serve
   navigation. The iframe keeps `allow-scripts`, `allow-popups`,
   `allow-popups-to-escape-sandbox`, and never `allow-same-origin`.

## Consequences

**Positive.** The site's own navigation works, under the same CSP and the
same pipeline as before. The anchor ADR-0020 listed as a known loss is back:
the fragment rides on the composed document's blob URL and the browser
applies it, with nobody reaching into the frame. Pages the entry page never
links to stay reachable from the page row.

**Negative.** MBZoo now runs a script of its own inside a document that may
run hostile scripts. The feature's correctness depends entirely on the
parent-side checks; the injected script is a convenience, not a control.

**Neutral.** Single-page HTML resources are untouched — no page row, no
injected script, byte-identical output to before.

## Risks

- **A hostile page drives the preview.** Bounded to pages of the same
  resource, which is what the page row already offers. Mitigated by the
  allowlist (rule 4), the token (rule 3) and the rate limit.
- **Unbounded allocation.** Every render mints object URLs that only
  `dispose()` reclaims, and `dispose()` does not run while the reader stays
  on the activity. Mitigated by revoking the previous page's URLs on
  replace, by the 250 ms floor, and by refusing a request naming the page
  already displayed.
- **Marking drift.** If the marking side and the accepting side ever
  disagree again, the reader gets live-looking dead links. Locked by the
  two-attribute split and covered by e2e.

## Validation

- `apps/viewer/test/preview-utils.test.ts` — `parseNavigationRequest`
  rejects non-objects, wrong `source`/`type`, non-string or oversized
  `page`, a prototype-polluted payload, a missing token and a wrong token;
  `pageNavScript` cannot be made to terminate its own script element;
  `decodeRefPath` survives a malformed escape; the CSP meta precedes the
  injected script.
- `e2e/viewer.spec.ts` — a link inside the frame navigates and the target
  renders with its relative stylesheet applied; a fragment survives; and a
  forged request is refused whether it climbs out of the resource, wears the
  wrong source, omits the token or guesses it.
- `bun run check` plus the Playwright job.

## References

- ADR-0020 — superseded: the page row, and the rule that nothing reaches the
  frame outside the pipeline.
- ADR-0009 — no upload, no telemetry, no fetching of backup-referenced
  remote content.
- ADR-0014, ADR-0017 — opaque-origin iframe, injected CSP, inlined assets.
- REPO-004 — the real backup corpus; SMR_SOR carries the eXeLearning shape.

---

## Addendum: Investigation

### What an adversarial review changed

The design was reviewed by an agent briefed to refute it. Two of its
findings changed the decision, and both are worth recording because the
first version of this ADR would have asserted guarantees MBZoo did not have.

**Window identity authenticates a browsing context, not a document.**
`frame.contentWindow` returns a WindowProxy whose identity survives a
cross-document navigation. A sandboxed frame may navigate *itself* —
`allow-top-navigation` governs the top-level context, not the frame's own —
and `SANDBOX_CSP` contains no directive that governs it: `frame-src` covers
nested contexts, `form-action` covers submissions, `connect-src` covers
fetch and XHR. So a page could replace itself with a network-loaded
document that keeps the same WindowProxy and no longer carries the meta CSP,
and that document would have passed an identity-only check. The token in
rule 3 exists because of this finding. The frame self-navigating is a
pre-existing property of the ADR-0014 sandbox and is not introduced here.

**The allowlist was wider than "this resource".** `renderFileList` drops the
context predicate when the activity XML omits `contextid`
(`contextId === '' || f.contextId === contextId`), and `contextid` is
backup-controlled. A crafted backup omitting it made the record set the
union of every `mod_resource` content file in the archive. Rule 4 narrows
the navigable set back to the entry's own context and component.

The review also confirmed two axes as sound: a popup opened under
`allow-popups-to-escape-sandbox` cannot impersonate the frame, because
`event.source` is the incumbent window and a popup posting through
`opener.parent` is identified as the popup; and there is no dispose race,
because `dispose()` removes the listener synchronously before any dispatch.

### Two defects found in code this decision touches

Both pre-date this ADR and are fixed here rather than left in place.

- `rewriteRelativeRefs` passed a backup-controlled reference as the
  *replacement* argument of `String.replace`, where `$'` expands to the
  portion of the string after the match. A reference containing `$'` would
  splice the rest of the document into an attribute. Replacements now go
  through a literal `replaceOnce`.
- The rate limit was evaluated last, so message parsing and record lookup
  ran at whatever frequency the frame chose. It is now the second check,
  immediately after window identity.

### Why the injected script is not the security boundary

ADR-0020 rejected a bridge partly because "the script we would inject runs
in the same document as the course author's scripts, so a hostile page could
forge navigation requests". A hostile page can forge them regardless: any
script in the frame can call `parent.postMessage`. The injected script
therefore hands an attacker nothing they did not already have, and the
security of the feature has to live — and does live — in the parent's
validation. ADR-0020 anticipated the shape of the answer when it noted that
MBZoo "would have to validate every requested filename against the
resource's own record list".

What the token adds is narrower and worth stating precisely: it does not
defend against a hostile script in the document MBZoo composed, because that
script can read the token. It defends against a *different* document
inheriting the same browsing context.
