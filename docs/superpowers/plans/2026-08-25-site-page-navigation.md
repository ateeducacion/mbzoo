# Site Page Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the links inside a multi-page site preview navigate again, without letting any document reach the frame outside the render pipeline.

**Architecture:** The in-frame link keeps its defused `href`; an injected capture-phase listener asks the parent to navigate via `postMessage`. The parent authenticates by window identity, validates the requested name against the resource's own HTML records, and re-renders through the unchanged `rewriteRelativeRefs` -> `retargetExternalLinks` -> `injectCsp` pipeline. No new sandbox token, no CSP change.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite, bun:test, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-08-25-site-page-navigation-design.md`

## Global Constraints

- English everywhere: code, comments, docs, ADRs, commits.
- Do not weaken TypeScript flags. No `any`, no unsafe assertions to silence validation.
- Biome owns formatting/linting. Run `bun run check` before every commit.
- Comments only for a non-obvious "why", citing decision IDs, e.g. `(ADR-0021)`.
- No new sandbox tokens. The iframe keeps exactly `allow-scripts`, `allow-popups`, `allow-popups-to-escape-sandbox`, and never `allow-same-origin`.
- `SANDBOX_CSP` is not modified by this plan.
- ADR-0020's standing rule survives: never inline an HTML document as a `data:` URI.
- Every behavior change ships with tests for happy path and edges.

---

### Task 1: Reference splitting and the message validator

Two pure helpers, both DOM-free so `bun:test` covers them (ADR-0008).

**Files:**
- Modify: `apps/viewer/src/lib/preview-utils.ts`
- Test: `apps/viewer/test/preview-utils.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `splitRef(ref: string): { path: string; hash: string }` — `path` is `ref` without its `?query` and `#fragment`; `hash` is the fragment **including** the leading `#`, or `''`.
  - `parseNavigationRequest(data: unknown): string | undefined` — returns the requested page reference, or `undefined` for anything that is not a well-formed MBZoo navigation message.
  - `resolveRelative(dir, ref)` keeps its signature but now ignores a trailing `?query`/`#fragment` on `ref`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/viewer/test/preview-utils.test.ts`:

```ts
import { parseNavigationRequest, resolveRelative, splitRef } from '../src/lib/preview-utils.ts'

test('splitRef separates path, query and fragment', () => {
  expect(splitRef('page2.html')).toEqual({ path: 'page2.html', hash: '' })
  expect(splitRef('page2.html#deep')).toEqual({ path: 'page2.html', hash: '#deep' })
  expect(splitRef('page2.html?v=1#deep')).toEqual({ path: 'page2.html', hash: '#deep' })
  expect(splitRef('#top')).toEqual({ path: '', hash: '#top' })
})

test('resolveRelative drops query and fragment so a record can match', () => {
  expect(resolveRelative('/site/', 'page2.html#deep')).toBe('site/page2.html')
  expect(resolveRelative('/site/', '../other/page2.html?v=1')).toBe('other/page2.html')
})

test('parseNavigationRequest accepts only a well-formed MBZoo navigation message', () => {
  expect(parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: 'page2.html' })).toBe(
    'page2.html',
  )
})

test('parseNavigationRequest rejects hostile shapes', () => {
  expect(parseNavigationRequest(null)).toBeUndefined()
  expect(parseNavigationRequest('navigate')).toBeUndefined()
  expect(parseNavigationRequest(42)).toBeUndefined()
  expect(parseNavigationRequest([])).toBeUndefined()
  expect(parseNavigationRequest({ type: 'navigate', page: 'p.html' })).toBeUndefined()
  expect(parseNavigationRequest({ source: 'other', type: 'navigate', page: 'p.html' })).toBeUndefined()
  expect(parseNavigationRequest({ source: 'mbzoo', type: 'exec', page: 'p.html' })).toBeUndefined()
  expect(parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: 42 })).toBeUndefined()
  expect(parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: '' })).toBeUndefined()
  expect(
    parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: 'a'.repeat(513) }),
  ).toBeUndefined()
})

test('parseNavigationRequest is not fooled by a prototype-polluted payload', () => {
  const evil = JSON.parse('{"__proto__":{"source":"mbzoo","type":"navigate","page":"p.html"}}')
  expect(parseNavigationRequest(evil)).toBeUndefined()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test apps/viewer/test/preview-utils.test.ts`
Expected: FAIL — `splitRef` and `parseNavigationRequest` are not exported.

- [ ] **Step 3: Implement the helpers**

In `apps/viewer/src/lib/preview-utils.ts`, add above `resolveRelative`:

```ts
/** Longest page reference a navigation message may carry. */
const MAX_NAV_REF_LENGTH = 512

/** Splits a reference into the part that addresses a file and its fragment. */
export function splitRef(ref: string): { path: string; hash: string } {
  const hashAt = ref.indexOf('#')
  const hash = hashAt < 0 ? '' : ref.slice(hashAt)
  const head = hashAt < 0 ? ref : ref.slice(0, hashAt)
  const queryAt = head.indexOf('?')
  return { path: queryAt < 0 ? head : head.slice(0, queryAt), hash }
}

/**
 * Validates a navigation message posted by a sandboxed preview (ADR-0021).
 * The frame is hostile input: nothing here trusts the message beyond its
 * shape, and the returned reference is only ever used as a lookup key
 * against records the backup cannot extend.
 */
export function parseNavigationRequest(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const message = data as Record<string, unknown>
  if (!Object.hasOwn(message, 'page')) return undefined
  if (message.source !== 'mbzoo' || message.type !== 'navigate') return undefined
  const page = message.page
  if (typeof page !== 'string') return undefined
  if (page === '' || page.length > MAX_NAV_REF_LENGTH) return undefined
  return page
}
```

Then make `resolveRelative` ignore query and fragment by replacing its first line:

```ts
export function resolveRelative(dir: string, ref: string): string {
  const base = dir.replace(/^\//, '').replace(/\/$/, '')
  const { path } = splitRef(ref)
  const parts: string[] = []
  if (path.startsWith('/')) {
    parts.push(...path.split('/'))
  } else {
    parts.push(...base.split('/').filter(Boolean), ...path.split('/'))
  }
```

The rest of the function body is unchanged (it already iterates `parts`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/viewer/test/preview-utils.test.ts`
Expected: PASS, existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add apps/viewer/src/lib/preview-utils.ts apps/viewer/test/preview-utils.test.ts
git commit -m "Split query/fragment off archive references and validate navigation messages"
```

---

### Task 2: Inject the navigation script and honour a fragment

The script only reaches documents rendered as part of a multi-page site, so single-file HTML previews keep exactly today's bytes.

**Files:**
- Modify: `apps/viewer/src/lib/preview-utils.ts` (add `PAGE_NAV_SCRIPT`)
- Modify: `apps/viewer/src/renderers.ts` (`DEFUSED_LINK_STYLE`, `filePreview`, `renderSandboxedHtml`)
- Test: `apps/viewer/test/preview-utils.test.ts`

**Interfaces:**
- Consumes: `splitRef` from Task 1.
- Produces:
  - `PAGE_NAV_SCRIPT: string` — a `<script>` element source, injected into the head.
  - `filePreview(rec: BackupFileRecord, opts?: { pageNav?: boolean; hash?: string }): Promise<HTMLElement>`
  - `renderSandboxedHtml(data, rec, card, opts?: { pageNav?: boolean; hash?: string }): Promise<void>` (private)

- [ ] **Step 1: Write the failing test**

Append to `apps/viewer/test/preview-utils.test.ts`:

```ts
import { injectCsp, injectHead, PAGE_NAV_SCRIPT, SANDBOX_CSP } from '../src/lib/preview-utils.ts'

test('the navigation script never breaks out of its own script element', () => {
  // A literal </script> inside the source would end the element early and
  // spill the rest of the listener into the document as text.
  expect(PAGE_NAV_SCRIPT.match(/<\/script>/gi)).toHaveLength(1)
  expect(PAGE_NAV_SCRIPT.endsWith('</script>')).toBe(true)
})

test('the navigation script asks the parent instead of navigating itself', () => {
  expect(PAGE_NAV_SCRIPT).toContain('preventDefault')
  expect(PAGE_NAV_SCRIPT).toContain('postMessage')
  expect(PAGE_NAV_SCRIPT).toContain('data-mbz-page')
  // Capture phase: the author's own handlers must not swallow the click first.
  expect(PAGE_NAV_SCRIPT).toContain('true')
})

test('the CSP meta precedes any script we inject into a sandboxed page', () => {
  // injectHead prepends, so whatever is injected last ends up first. A script
  // placed before the CSP meta would run before the policy applied.
  const built = injectCsp(injectHead('<html><head></head><body></body></html>', PAGE_NAV_SCRIPT), SANDBOX_CSP)
  expect(built.indexOf('Content-Security-Policy')).toBeLessThan(built.indexOf('<script'))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/viewer/test/preview-utils.test.ts`
Expected: FAIL — `PAGE_NAV_SCRIPT` is not exported.

- [ ] **Step 3: Add the script constant**

In `apps/viewer/src/lib/preview-utils.ts`:

```ts
/**
 * Injected into a sandboxed page that belongs to a multi-page site
 * (ADR-0021). It turns a click on a defused page link into a request the
 * parent may refuse. It is a convenience for honest documents and carries no
 * authority: any script already in the frame can post the same message, so
 * the security of the feature lives entirely in the parent's validation.
 *
 * Written as one string with an escaped closing tag so it cannot terminate
 * its own <script> element early.
 */
export const PAGE_NAV_SCRIPT =
  '<script>(function(){document.addEventListener("click",function(e){' +
  'var t=e.target;if(!t||!t.closest)return;' +
  'var a=t.closest("[data-mbz-page]");if(!a)return;' +
  'e.preventDefault();e.stopPropagation();' +
  'try{parent.postMessage({source:"mbzoo",type:"navigate",' +
  'page:String(a.getAttribute("data-mbz-page")||"")},"*")}catch(err){}' +
  '},true)})()<\\/script>'
```

Note: the source ends with `<\/script>` written as `'<\\/script>'` in TypeScript, which evaluates to the string `</script>` — correct in the document, while the literal in the `.ts` file cannot close a script element if this file is ever inlined.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/viewer/test/preview-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the options through the renderer**

In `apps/viewer/src/renderers.ts`:

Replace the `DEFUSED_LINK_STYLE` constant (currently at ~line 1524) with:

```ts
/**
 * Page links used to be inert (ADR-0020) and were styled to say so. They
 * navigate again through the parent (ADR-0021), so they are styled as the
 * live links they now are; the attribute stays as the navigation hook.
 */
const PAGE_LINK_STYLE = '<style>[data-mbz-page]{cursor:pointer;text-decoration:underline}</style>'
```

Change the `filePreview` signature (~line 490) from

```ts
  async filePreview(rec: BackupFileRecord): Promise<HTMLElement> {
```

to

```ts
  async filePreview(
    rec: BackupFileRecord,
    opts?: { pageNav?: boolean; hash?: string },
  ): Promise<HTMLElement> {
```

and its sandboxed-HTML branch (~line 528) from

```ts
      await this.renderSandboxedHtml(data, rec, card)
```

to

```ts
      await this.renderSandboxedHtml(data, rec, card, opts)
```

Change `renderSandboxedHtml` (~line 586) to accept the options and reorder the head injections so the CSP lands first:

```ts
  private async renderSandboxedHtml(
    data: Uint8Array,
    rec: BackupFileRecord,
    card: HTMLElement,
    opts?: { pageNav?: boolean; hash?: string },
  ): Promise<void> {
    let html = new TextDecoder().decode(data)
    const dir = rec.filePath.replace(/[^/]+$/, '')
    html = await this.rewriteRelativeRefs(html, dir, rec)
    html = retargetExternalLinks(html)
    // injectHead prepends, so these run in reverse document order: the CSP
    // must be injected last to end up as the first head child, ahead of any
    // script we add (ADR-0021).
    if (opts?.pageNav) html = injectHead(html, PAGE_NAV_SCRIPT)
    html = injectHead(html, PAGE_LINK_STYLE)
    html = injectCsp(html, SANDBOX_CSP)
    const frame = document.createElement('iframe')
    const src = this.blobUrl(new TextEncoder().encode(html), 'text/html')
    // The fragment is applied by the browser on load, so the anchor survives
    // without anyone reaching into the frame's document (ADR-0021).
    frame.src = opts?.hash ? `${src}${opts.hash}` : src
```

The rest of `renderSandboxedHtml` (title, className, sandbox tokens, append) is unchanged.

Add `PAGE_NAV_SCRIPT` to the existing import block from `./lib/preview-utils.ts` at the top of `renderers.ts`, keeping the list alphabetical.

- [ ] **Step 6: Verify nothing regressed**

Run: `bun run check`
Expected: PASS. If Biome reports import order, let `bun run check` fix it and re-run.

- [ ] **Step 7: Commit**

```bash
git add apps/viewer/src/lib/preview-utils.ts apps/viewer/src/renderers.ts apps/viewer/test/preview-utils.test.ts
git commit -m "Inject a page-navigation script into site previews and honour link fragments"
```

---

### Task 3: Accept navigation requests in the viewer

**Files:**
- Modify: `apps/viewer/src/renderers.ts` (`Renderer.dispose`, `renderWebsite`)
- Modify: `apps/viewer/src/lib/i18n.ts` (`site.pagesHint`, both languages)

**Interfaces:**
- Consumes: `parseNavigationRequest`, `splitRef`, `resolveRelative` (Task 1); `filePreview(rec, opts)` (Task 2).
- Produces: nothing later tasks import; behaviour only.

- [ ] **Step 1: Add teardown state to the renderer**

In `apps/viewer/src/renderers.ts`, inside `class Renderer` next to `urls` (~line 67):

```ts
  /** Listeners registered by a render, torn down on the next one. */
  private readonly cleanups: Array<() => void> = []
```

and extend `dispose()` (~line 82):

```ts
  dispose(): void {
    for (const fn of this.cleanups) fn()
    this.cleanups.length = 0
    for (const u of this.urls) URL.revokeObjectURL(u)
    this.urls.length = 0
    this.blobSources.clear()
  }
```

- [ ] **Step 2: Wire the listener into `renderWebsite`**

Replace the body of the `if (pages.length > 1) { ... }` branch in `renderWebsite` (~line 424) so that `show` tracks the displayed page and a validated message can drive it:

```ts
    if (pages.length > 1) {
      const bar = document.createElement('div')
      bar.className = 'site-pages'
      const label = document.createElement('span')
      label.className = 'site-pages-label'
      label.textContent = `${t('site.pages')} (${pages.length})`
      bar.appendChild(label)

      let current = entry
      let lastNavigation = 0
      const show = async (rec: BackupFileRecord, hash = ''): Promise<void> => {
        current = rec
        for (const b of bar.querySelectorAll('button')) {
          b.classList.toggle('selected', b.dataset.page === rec.filePath + rec.fileName)
        }
        holder.replaceChildren(await this.filePreview(rec, { pageNav: true, hash }))
      }

      // Full archive path of a record, normalized the way resolveRelative
      // returns paths, so the two can be compared directly.
      const fullPath = (r: BackupFileRecord): string =>
        `${r.filePath}${r.fileName}`.replace(/^\/+/, '')

      // A page of this site asks to navigate (ADR-0021). Every check below is
      // load-bearing: the frame is hostile input.
      const onMessage = (event: MessageEvent): void => {
        const frame = holder.querySelector('iframe')
        // Window identity, not event.origin: the frame is an opaque origin,
        // so its origin is "null" and carries no authority.
        if (!frame || event.source === null || event.source !== frame.contentWindow) return
        const requested = parseNavigationRequest(event.data)
        if (requested === undefined) return
        const { hash } = splitRef(requested)
        const target = resolveRelative(current.filePath, requested)
        // Allowlist: only the HTML records of this very resource. A "../"
        // payload cannot escape it, because the resolved path must equal one
        // of these entries exactly.
        const rec = pages.find((p) => fullPath(p) === target)
        if (!rec) return
        if (rec === current && hash === '') return
        // A page can post in a loop; each render allocates blob URLs that
        // only dispose() reclaims, so refuse to be driven faster than a
        // reader could click.
        const now = performance.now()
        if (now - lastNavigation < 250) return
        lastNavigation = now
        void show(rec, hash)
      }
      window.addEventListener('message', onMessage)
      this.cleanups.push(() => window.removeEventListener('message', onMessage))

      for (const rec of pages) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'btn-outline'
        button.dataset.page = rec.filePath + rec.fileName
        button.textContent = rec.fileName
        button.addEventListener('click', () => void show(rec))
        bar.appendChild(button)
      }
      container.appendChild(bar)
      const hint = document.createElement('p')
      hint.className = 'fallback-note site-pages-hint'
      hint.textContent = t('site.pagesHint')
      container.appendChild(hint)
      container.appendChild(holder)
      await show(entry)
    } else {
```

Add `parseNavigationRequest` and `splitRef` to the `./lib/preview-utils.ts` import block.

- [ ] **Step 3: Update the hint in both languages**

In `apps/viewer/src/lib/i18n.ts`, replace the English `site.pagesHint` (~line 77):

```ts
    'site.pagesHint':
      'Links inside the page work; this list also reaches pages the entry page never links to.',
```

and the Spanish one (~line 203):

```ts
    'site.pagesHint':
      'Los enlaces dentro de la página funcionan; esta lista además llega a páginas que la portada no enlaza.',
```

- [ ] **Step 4: Verify the build and unit suite**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/viewer/src/renderers.ts apps/viewer/src/lib/i18n.ts
git commit -m "Navigate multi-page sites from validated in-frame requests"
```

---

### Task 4: End-to-end proof, including the attacks

Replaces the ADR-0020 assertion that the link is inert.

**Files:**
- Modify: `e2e/viewer.spec.ts` (`websiteFixture`, the multi-page test)

**Interfaces:**
- Consumes: the behaviour from Tasks 1-3.
- Produces: nothing.

- [ ] **Step 1: Extend the fixture with an anchor target and a forgery button**

In `e2e/viewer.spec.ts`, replace the `html` and `page2` constants inside `websiteFixture()` (~line 476):

```ts
  const html = `<!doctype html>
<html><head><link rel="stylesheet" href="site.css"></head>
<body><p id="site-marker">site</p><img id="rel-img" src="pic.png" alt="">
<a id="ext-link" href="https://example.com/docs">external</a>
<a id="to-page2" href="page2.html">page two</a>
<a id="to-page2-deep" href="page2.html#deep">page two, deep</a>
<button id="forge" onclick="parent.postMessage({source:'mbzoo',type:'navigate',page:'../../../secret.html'},'*')">forge</button>
<button id="forge-known" onclick="parent.postMessage({source:'evil',type:'navigate',page:'page2.html'},'*')">forge known</button>
</body></html>`
  // A second page of the same site, styled by the same relative stylesheet —
  // the shape every eXeLearning export has (SMR_SOR "Solución a la tarea").
  const page2 = `<!doctype html>
<html><head><link rel="stylesheet" href="site.css"></head>
<body><p id="page2-marker">page two</p>
<div style="height:200vh"></div>
<p id="deep">deep anchor</p>
<a id="back-home" href="index.html">home</a></body></html>`
```

- [ ] **Step 2: Replace the multi-page test**

Replace the whole `test('a multi-page site is navigated from MBZoo, not by breaking out of the frame', ...)` block (~line 547) with:

```ts
test('a link inside a multi-page site navigates through MBZoo (ADR-0021)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#site-marker')).toBeVisible()

  // The href stays defused: the document must never reach a sibling page
  // outside the render pipeline (ADR-0020's rule, carried forward).
  await expect(frame.locator('#to-page2')).not.toHaveAttribute('href', /./)
  await expect(frame.locator('#to-page2')).toHaveAttribute('data-mbz-page', 'page2.html')
  // The author's external link is untouched by that rule.
  await expect(frame.locator('#ext-link')).toHaveAttribute('href', 'https://example.com/docs')

  // Clicking it navigates, and the target arrives through the full pipeline —
  // stylesheet applied, which is exactly what inlining a data: document lost.
  await frame.locator('#to-page2').click()
  const second = page.frameLocator('.html-frame')
  await expect(second.locator('#page2-marker')).toBeVisible()
  await expect(second.locator('#page2-marker')).toHaveCSS('color', 'rgb(0, 128, 0)')

  // The page row follows the frame.
  await expect(page.locator('.site-pages button.selected')).toHaveText('page2.html')
})

test('a link fragment survives the navigation (ADR-0021)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  await page.frameLocator('.html-frame').locator('#to-page2-deep').click()
  const second = page.frameLocator('.html-frame')
  await expect(second.locator('#deep')).toBeVisible()
  // The anchor is 200vh down the page, so a non-zero scroll proves the
  // fragment was applied rather than the page merely being rendered.
  await expect
    .poll(async () => second.locator('#deep').evaluate(() => window.scrollY))
    .toBeGreaterThan(0)
})

test('a forged navigation request cannot leave the resource (ADR-0021)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#site-marker')).toBeVisible()

  // A path that climbs out of the resource resolves to nothing in the
  // allowlist, so the preview must not move.
  await frame.locator('#forge').click()
  // A message wearing the wrong source is ignored even though the page it
  // names is a legitimate one.
  await frame.locator('#forge-known').click()

  await expect(page.frameLocator('.html-frame').locator('#site-marker')).toBeVisible()
  await expect(page.locator('.site-pages button.selected')).toHaveText('index.html')
})
```

- [ ] **Step 3: Run the e2e suite**

Run: `bun run test:e2e`
Expected: PASS. If Playwright browsers are missing, run `npx playwright install chromium` first.

- [ ] **Step 4: Confirm the sandbox test still passes untouched**

Run: `bun run test:e2e -- -g "external links in a sandboxed site"`
Expected: PASS — proof that no sandbox token changed.

- [ ] **Step 5: Commit**

```bash
git add e2e/viewer.spec.ts
git commit -m "Prove in-frame navigation, fragments and forgery rejection end to end"
```

---

### Task 5: ADR-0021 and documentation

**Files:**
- Create: `research/decisions/adr/ADR-0021-in-frame-navigation-for-multi-page-sites.md`
- Modify: `research/decisions/adr/ADR-0020-multi-page-sites-navigated-from-mbzoo.md` (status only)
- Modify: `research/status.yaml` (append-only)

- [ ] **Step 1: Write ADR-0021**

Use the template in `research/templates/`. Front matter: `id: ADR-0021`, `status: Accepted`, `date: 2026-08-25`, `supersedes: [ADR-0020]`, `related: [ADR-0009, ADR-0014, ADR-0017, ADR-0020]`, `sources: [REPO-004]`, `ai_tool: claude-code`, `ai_model: claude-opus-5`.

The argument, in full, is in the spec at `docs/superpowers/specs/2026-08-25-site-page-navigation-design.md`. The ADR must state:
- the load-bearing insight, that the injected script is not the security boundary because any script in the frame can already call `parent.postMessage`, so validation must live in the parent and does;
- the threat model section from the spec, verbatim in substance;
- the standing rules carried forward from ADR-0020 (no HTML inlined as `data:`; nothing reaches the frame outside the pipeline);
- the new standing rule: a navigation request is authenticated by window identity and authorized against the current resource's own records, never by `event.origin`.

- [ ] **Step 2: Mark ADR-0020 superseded**

Change only its front matter `status: Accepted` to `status: Superseded by ADR-0021`. Do not rewrite its body — accepted ADR history is never rewritten.

- [ ] **Step 3: Append to `research/status.yaml`**

Add the tracked task/risk entry for this change. Append only; do not reorder existing entries.

- [ ] **Step 4: Regenerate the research indexes**

Run: `bun run research:indexes`
Expected: `research/indexes/*.yaml` updated. Never hand-edit them.

- [ ] **Step 5: Full verification**

Run: `bun run check && bun run test:e2e`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add research/
git commit -m "ADR-0021: navigate multi-page sites from validated in-frame requests"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: `resolveRelative` fragment handling and `parseNavigationRequest` -> Task 1; `PAGE_NAV_SCRIPT`, `DEFUSED_LINK_STYLE`, `filePreview`/`renderSandboxedHtml` threading and the hash-on-blob-URL -> Task 2; the `message` listener, `dispose()` teardown and `i18n` -> Task 3; the four e2e assertions -> Task 4; ADR-0021 and the supersede -> Task 5.

**Type consistency.** `splitRef` returns `{ path, hash }` in Task 1 and is destructured as such in Tasks 2 and 3. `parseNavigationRequest` returns `string | undefined` and Task 3 tests it with `=== undefined`. `filePreview(rec, opts?)` is defined in Task 2 and called with `{ pageNav: true, hash }` in Task 3. `cleanups` is declared and drained in Task 3 only.

**Additions beyond the spec, and why.** The spec did not mention two things this plan adds, both found while reading the code: the head-injection order (a script injected after `injectCsp` would land *before* the CSP meta, so it would run before the policy applied) and the navigation rate guard (`this.urls` in `renderers.ts:67` only shrinks in `dispose()`, so a frame posting in a loop would grow blob-URL allocations without bound). Both are recorded here rather than left to the implementer.
