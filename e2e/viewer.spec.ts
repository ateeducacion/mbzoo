import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, '..', 'fixtures', 'files', 'demo-course-zip.mbz')

function replaceTextEntry(
  entries: ReturnType<typeof unzipSync>,
  path: string,
  transform: (text: string) => string,
): void {
  const data = entries[path]
  if (!data) throw new Error(`Missing fixture entry: ${path}`)
  entries[path] = strToU8(transform(strFromU8(data)))
}

function mutatedFixture(
  mutate: (entries: ReturnType<typeof unzipSync>) => void,
  name: string,
): { name: string; mimeType: string; buffer: Buffer } {
  const entries = unzipSync(new Uint8Array(readFileSync(FIXTURE)))
  mutate(entries)
  return {
    name,
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(entries, { level: 6 })),
  }
}

function hostilePageFixture(): { name: string; mimeType: string; buffer: Buffer } {
  return mutatedFixture((entries) => {
    replaceTextEntry(entries, 'activities/page_3004/page.xml', (xml) =>
      xml.replace(
        /<content>[\s\S]*?<\/content>/,
        '<content>&lt;p id="safe-marker"&gt;Safe content remains.&lt;/p&gt;' +
          '&lt;script&gt;window.__mbzooXss=true&lt;/script&gt;' +
          '&lt;img id="hostile-img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" onerror="window.__mbzooXss=true"&gt;</content>',
      ),
    )
  }, 'hostile-page.mbz')
}

function sandboxHtmlFixture(): { name: string; mimeType: string; buffer: Buffer } {
  const html = `<!doctype html>
<html>
<body>
  <p id="sandbox-marker">Sandbox script executed.</p>
  <script>
    try {
      parent.document.body.dataset.mbzooSandboxEscape = '1'
      document.body.dataset.parentBlocked = 'false'
    } catch {
      document.body.dataset.parentBlocked = 'true'
    }
    fetch('https://example.invalid/mbzoo-probe')
      .then(() => { document.body.dataset.networkBlocked = 'false' })
      .catch(() => { document.body.dataset.networkBlocked = 'true' })
  </script>
</body>
</html>`
  const htmlBytes = strToU8(html)
  const newHash = createHash('sha1').update(htmlBytes).digest('hex')

  return mutatedFixture((entries) => {
    const filesData = entries['files.xml']
    if (!filesData) throw new Error('Missing fixture entry: files.xml')
    const filesXml = strFromU8(filesData)
    const records = filesXml.match(/<file>[\s\S]*?<\/file>/g) ?? []
    const oldRecord = records.find((record) => record.includes('<filename>guide.txt</filename>'))
    if (!oldRecord) throw new Error('Missing guide.txt record in fixture')

    const oldHash = oldRecord.match(/<contenthash>([^<]+)<\/contenthash>/)?.[1]
    if (!oldHash) throw new Error('Missing guide.txt content hash in fixture')

    const newRecord = oldRecord
      .replace(`<contenthash>${oldHash}</contenthash>`, `<contenthash>${newHash}</contenthash>`)
      .replace('<filename>guide.txt</filename>', '<filename>guide.html</filename>')
      .replace(/<filesize>\d+<\/filesize>/, `<filesize>${htmlBytes.byteLength}</filesize>`)
      .replace('<mimetype>text/plain</mimetype>', '<mimetype>text/html</mimetype>')

    entries['files.xml'] = strToU8(filesXml.replace(oldRecord, newRecord))
    delete entries[`files/${oldHash.slice(0, 2)}/${oldHash}`]
    entries[`files/${newHash.slice(0, 2)}/${newHash}`] = htmlBytes
  }, 'sandbox-html.mbz')
}

test('Docs nav points at the documentation site, not the GitHub README', async ({ page }) => {
  await page.goto('/')
  const docs = page.getByRole('link', { name: 'Docs' })
  await expect(docs).toHaveAttribute('href', './docs/')
  await docs.click()
  await expect(page).toHaveURL(/\/docs\/?$/)
  await expect(page.locator('.rp-home-hero__title-brand')).toHaveText('MBZoo')
})

test('opens the synthetic .mbz and renders the course structure', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#landing .brand-logo')).toBeVisible()

  await page.setInputFiles('#file-input', FIXTURE)

  await expect(page.locator('#course-title')).toHaveText('Demo Course for MBZoo')
  const meta = await page.locator('#course-meta').textContent()
  expect(meta).toContain('2 sections')
  expect(meta).toContain('22 activities')

  await expect(page.locator('#sections li h3').first()).toHaveText('Introduction')
  await expect(page.getByText('Welcome page')).toBeVisible()
  // Unknown third-party module is exposed, not dropped.
  await expect(page.getByText('Unknown third-party module')).toBeVisible()

  // Page content renders (sanitized HTML from activities/page_3004/page.xml).
  await page.getByRole('button', { name: /About this demo/ }).click()
  await expect(page.locator('.activity-content')).toContainText(
    'Hello from the MBZoo synthetic page',
  )

  // Resource module shows a file card for its stored content.
  await page.getByRole('button', { name: /Synthetic guide/ }).click()
  await expect(page.locator('.file-head')).toContainText('guide.txt')
  await expect(page.locator('.text-preview')).toContainText('synthetic guide')
})

test('sanitizes hostile Page HTML before insertion', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await page.setInputFiles('#file-input', hostilePageFixture())
  await expect(page.locator('#course-title')).toHaveText('Demo Course for MBZoo')

  await page.getByRole('button', { name: /About this demo/ }).click()
  await expect(page.locator('#safe-marker')).toBeVisible()
  await expect(page.locator('.activity-content script')).toHaveCount(0)
  await expect(page.locator('#hostile-img')).not.toHaveAttribute('onerror', /.+/)
  expect(await page.evaluate(() => Reflect.get(window, '__mbzooXss') === true)).toBe(false)
  expect(pageErrors).toEqual([])
})

test('isolates executable HTML resources and blocks network access', async ({ page }) => {
  const probeRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('https://example.invalid/mbzoo-probe')) {
      probeRequests.push(request.url())
    }
  })

  await page.goto('/')
  await page.setInputFiles('#file-input', sandboxHtmlFixture())
  await expect(page.locator('#course-title')).toHaveText('Demo Course for MBZoo')

  await page.getByRole('button', { name: /Synthetic guide/ }).click()
  await expect(page.locator('.file-head')).toContainText('guide.html')

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#sandbox-marker')).toBeVisible()
  await expect(frame.locator('body')).toHaveAttribute('data-parent-blocked', 'true')
  await expect(frame.locator('body')).toHaveAttribute('data-network-blocked', 'true')

  await expect(page.locator('body')).not.toHaveAttribute('data-mbzoo-sandbox-escape', '1')
  // Pin the exact grant list: this is the trust boundary, so any widening
  // must fail here and be argued for in an ADR rather than slip through.
  expect((await page.locator('.html-frame').getAttribute('sandbox'))?.split(/\s+/).sort()).toEqual([
    'allow-popups',
    'allow-popups-to-escape-sandbox',
    'allow-scripts',
  ])
  expect(probeRequests).toEqual([])
})

test('quiz navigation, glossary entries and assignment summary', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)

  // Quiz: Moodle-like inputs + navigation + reveal answers.
  await page.getByRole('button', { name: /Self-assessment quiz/ }).click()
  await expect(page.locator('.quiz-nav')).toBeVisible()
  await expect(page.locator('.quiz-counter')).toHaveText(/1 .* 2/)
  await expect(page.locator('.quiz-card input[type="radio"]')).toHaveCount(2)
  await page.locator('.quiz-nav .btn-outline').nth(1).click()
  await expect(page.locator('.quiz-counter')).toContainText('2')
  await page.getByRole('button', { name: /Reveal answers/ }).click()
  await expect(page.locator('.quiz-card .q-correct').first()).toBeVisible()

  // Glossary: entries rendered.
  await page.getByRole('button', { name: /Demo glossary/ }).click()
  await expect(page.locator('.glossary-list dt').first()).toHaveText('MBZ')
  await expect(page.locator('.glossary-list dd').first()).toContainText('Moodle Backup')

  // Assignment: intro + dates + submission type.
  await page.getByRole('button', { name: /Demo assignment/ }).click()
  await expect(page.locator('#detail .activity-intro')).toContainText('Upload a short report')
  const summary = page.locator('.summary-grid')
  await expect(summary).toContainText('Due')
  await expect(page.locator('.summary-row')).toContainText('File')
})

test('book chapters, hidden activity indicator and availability', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)

  // Book: TOC + chapter navigation.
  await page.getByRole('button', { name: /Demo book/ }).click()
  await expect(page.locator('.book-toc-item')).toHaveCount(3)
  await expect(page.locator('.book-chapter .activity-content')).toContainText('demo book')
  await page.locator('.book-toc li').nth(2).locator('.book-toc-item').click()
  await expect(page.locator('.book-chapter .activity-content')).toContainText('Subchapter body')

  // Hidden activity: struck through in the tree.
  const hidden = page.locator('.hidden-activity .name')
  await expect(hidden).toHaveText(/Restricted page/)

  // Info tab carries visibility, human availability and identifiers.
  await page.getByRole('button', { name: /Restricted page/ }).click()
  await expect(page.locator('.hidden-pill')).toHaveText('Hidden')
  await page.getByRole('tab', { name: 'Info' }).click()
  const info = page.locator('.detail-panel-info')
  await expect(info).toContainText('hidden from students')
  await expect(info).toContainText('Available from')
  await expect(info).toContainText('Member of group #7')
  await expect(info).toContainText('RESTRICTED-1')
})

test('example link opens the demo course with all activity types', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /demo course/ }).click()
  await expect(page.locator('#course-title')).toHaveText('Demo Course for MBZoo')
  // All types present in the tree.
  for (const mod of [
    'page',
    'label',
    'quiz',
    'glossary',
    'resource',
    'assign',
    'book',
    'supermodule',
    'h5pactivity',
  ]) {
    await expect(page.locator(`.mod-badge`, { hasText: mod }).first()).toBeVisible()
  }
})

test('plays the synthetic H5P package inside the opaque-origin sandbox', async ({ page }) => {
  const probeRequests: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1')) {
      probeRequests.push(request.url())
    }
  })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo H5P content/ }).click()

  await expect(page.locator('.h5p-note')).toContainText(/Experimental|experimental/)
  await expect(page.locator('.h5p-frame')).toHaveAttribute('sandbox', 'allow-scripts')

  // The synthetic text library rendered its content inside the frame.
  const frame = page.frameLocator('.h5p-frame')
  await expect(frame.locator('.h5p-mbzoo-text')).toContainText('Synthetic H5P', { timeout: 15000 })

  // The nested dependency loaded before the content type that needs it, and
  // its string version ("1.8") resolved (REPO-009: both broke real packages).
  await expect(frame.locator('.h5p-mbzoo-text')).toHaveAttribute('data-dependency', 'base-loaded')

  // A content/ image assigned with new Image() through H5P.getPath() resolves
  // to an in-frame blob and actually decodes.
  const image = frame.locator('img.h5p-mbzoo-image')
  await expect(image).toBeVisible()
  expect(await image.evaluate((el: HTMLImageElement) => el.src)).toMatch(/^blob:/)
  expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(16)

  expect(pageErrors).toEqual([])
  expect(probeRequests).toEqual([])
})

test('steps are hidden on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await page.goto('/')
  await expect(page.locator('.steps')).toBeHidden()
})

test('logo returns home and global drop hint is available', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await expect(page.locator('#course-title')).toBeVisible()
  await expect(page.locator('.explorer-topbar .btn-choose')).toHaveCount(0) // replaced by global drag & drop
  await page.locator('#home-btn').click()
  await expect(page.locator('#landing')).toBeVisible()
})

test('book prev/next navigation works', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo book/ }).click()
  await expect(page.locator('.book-chapter .activity-content')).toContainText('demo book')
  await page.locator('.quiz-nav .btn-outline').nth(1).click()
  await expect(page.locator('.book-chapter .activity-content')).toContainText('Chapter two body')
  await page.locator('.quiz-nav .btn-outline').nth(1).click()
  await expect(page.locator('.book-chapter .activity-content')).toContainText('Subchapter body')
  await page.locator('.quiz-nav .btn-outline').nth(0).click()
  await expect(page.locator('.book-chapter .activity-content')).toContainText('Chapter two body')
})

test('the Content HTML export carries the rendered content, standalone', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /About this demo/ }).click()

  await page.getByRole('button', { name: /Export/ }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /Content \(\.html\)/ }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^page-\d+-about-this-demo\.html$/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const html = Buffer.concat(chunks).toString('utf8')

  expect(html).toContain('<!doctype html>')
  expect(html).toContain('About this demo')
  expect(html).toContain('Hello from the MBZoo synthetic page')
  // Standalone: no live object URLs may survive into the exported file.
  expect(html).not.toContain('blob:')
})

test('an activity with no authored content offers XML but no HTML export', async ({ page }) => {
  // Strip the only content the unknown module has: what remains in the
  // preview is inspector chrome, which must not count as exportable.
  const emptyIntro = mutatedFixture((entries) => {
    replaceTextEntry(entries, 'activities/supermodule_3003/supermodule.xml', (xml) =>
      xml.replace(/<intro>[\s\S]*?<\/intro>/, '<intro></intro>'),
    )
  }, 'empty-intro.mbz')

  await page.goto('/')
  await page.setInputFiles('#file-input', emptyIntro)
  await page.getByRole('button', { name: /Unknown third-party module/ }).click()

  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.getByRole('menuitem', { name: /Activity XML/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Content \(\.html\)/ })).toHaveCount(0)
})

test('an unknown module still exports the intro its author wrote', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Unknown third-party module/ }).click()

  await page.getByRole('button', { name: /Export/ }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /Content \(\.html\)/ }).click()
  const download = await downloadPromise

  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const html = Buffer.concat(chunks).toString('utf8')
  expect(html).toContain('Content of Unknown third-party module')
  // Inspector chrome stays out of the exported document.
  expect(html).not.toContain('Moodle metadata')
})

test('detail pane exposes Preview, Info and Raw tabs', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /About this demo/ }).click()

  // Preview is the landing tab and holds the rendered content.
  await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.activity-content')).toContainText('Hello from the MBZoo')

  // Info: identifiers come from the parsed module XML.
  await page.getByRole('tab', { name: 'Info' }).click()
  await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.detail-panel-preview')).toBeHidden()
  await expect(page.locator('.detail-panel-info')).toContainText('moduleid')
  await expect(page.locator('.detail-panel-info')).toContainText('Visibility and access')

  // Raw: source path plus the module XML, coloured by the tokenizer.
  await page.getByRole('tab', { name: 'Raw' }).click()
  // Every inactive panel must actually hide, including ones whose CSS
  // sets its own `display` and would otherwise beat the UA [hidden] rule.
  await expect(page.locator('.detail-panel-preview')).toBeHidden()
  await expect(page.locator('.detail-panel-info')).toBeHidden()
  await expect(page.locator('.raw-path')).toHaveText(/activities\/page_\d+\/page\.xml/)
  await expect(page.locator('.raw-xml')).toContainText('<page')
  await expect(page.locator('.raw-xml .x-tag').first()).toBeVisible()
})

test('tabs are keyboard navigable with arrow keys', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /About this demo/ }).click()

  await page.getByRole('tab', { name: 'Preview' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
})

test('Raw tab shows backup XML as text and never executes it', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await page.setInputFiles('#file-input', hostilePageFixture())
  await page.getByRole('button', { name: /About this demo/ }).click()
  await page.getByRole('tab', { name: 'Raw' }).click()

  // The escaped <script> in the backup is displayed, not parsed into a node.
  await expect(page.locator('.raw-xml')).toContainText('script')
  expect(await page.locator('.raw-xml script').count()).toBe(0)
  expect(await page.evaluate(() => Reflect.get(window, '__mbzooXss') === true)).toBe(false)
  expect(pageErrors).toEqual([])
})

test('exports the activity XML through the Export menu', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /About this demo/ }).click()

  await page.getByRole('button', { name: /Export/ }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /Activity XML/ }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^page-\d+-about-this-demo\.xml$/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf8')).toContain('<page')
})

test('a single-file resource offers a direct download and a files ZIP', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download/ }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('guide.txt')

  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.getByRole('menuitem', { name: /Files \(\.zip\)/ })).toBeVisible()
})

test('the Export menu closes on Escape and on an outside click', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /About this demo/ }).click()

  const exportButton = page.getByRole('button', { name: /Export/ })
  await exportButton.click()
  await expect(page.locator('.export-list')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.export-list')).toBeHidden()

  await exportButton.click()
  await expect(page.locator('.export-list')).toBeVisible()
  await page.locator('#course-title').click()
  await expect(page.locator('.export-list')).toBeHidden()
})

/** A multi-file HTML site: an entry page plus a relative image and stylesheet. */
function websiteFixture(): { name: string; mimeType: string; buffer: Buffer } {
  const html = `<!doctype html>
<html><head><link rel="stylesheet" href="site.css"></head>
<body><p id="site-marker">site</p><img id="rel-img" src="pic.png" alt="">
<a id="ext-link" href="https://example.com/docs">external</a>
<a id="to-page2" href="page2.html">page two</a></body></html>`
  // A second page of the same site, styled by the same relative stylesheet —
  // the shape every eXeLearning export has (SMR_SOR "Solución a la tarea").
  const page2 = `<!doctype html>
<html><head><link rel="stylesheet" href="site.css"></head>
<body><p id="page2-marker">page two</p>
<a id="back-home" href="index.html">home</a></body></html>`
  // 1x1 red PNG.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const css = strToU8('#site-marker,#page2-marker{color:rgb(0,128,0)}')
  const htmlBytes = strToU8(html)

  return mutatedFixture((entries) => {
    const filesData = entries['files.xml']
    if (!filesData) throw new Error('Missing fixture entry: files.xml')
    const filesXml = strFromU8(filesData)
    const records = filesXml.match(/<file>[\s\S]*?<\/file>/g) ?? []
    const base = records.find((r) => r.includes('<filename>guide.txt</filename>'))
    if (!base) throw new Error('Missing guide.txt record in fixture')
    const oldHash = base.match(/<contenthash>([^<]+)<\/contenthash>/)?.[1]
    if (!oldHash) throw new Error('Missing guide.txt content hash')

    const make = (bytes: Uint8Array, filename: string, mime: string): string => {
      const hash = createHash('sha1').update(bytes).digest('hex')
      entries[`files/${hash.slice(0, 2)}/${hash}`] = bytes
      return base
        .replace(`<contenthash>${oldHash}</contenthash>`, `<contenthash>${hash}</contenthash>`)
        .replace('<filename>guide.txt</filename>', `<filename>${filename}</filename>`)
        .replace(/<filesize>\d+<\/filesize>/, `<filesize>${bytes.byteLength}</filesize>`)
        .replace('<mimetype>text/plain</mimetype>', `<mimetype>${mime}</mimetype>`)
    }

    const replacement = [
      make(htmlBytes, 'index.html', 'text/html'),
      make(strToU8(page2), 'page2.html', 'text/html'),
      make(new Uint8Array(png), 'pic.png', 'image/png'),
      make(css, 'site.css', 'text/css'),
    ].join('\n')

    entries['files.xml'] = strToU8(filesXml.replace(base, replacement))
    delete entries[`files/${oldHash.slice(0, 2)}/${oldHash}`]
  }, 'website.mbz')
}

test('a sandboxed site loads its relative image and stylesheet', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#site-marker')).toBeVisible()

  // The iframe is an opaque origin, so parent-created blob: URLs are not
  // loadable inside it — assets must travel as data: URIs.
  const imgOk = await frame
    .locator('#rel-img')
    .evaluate(
      (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
    )
  expect(imgOk).toBe(true)

  await expect(frame.locator('#site-marker')).toHaveCSS('color', 'rgb(0, 128, 0)')
})

test('a multi-page site is navigated from MBZoo, not by breaking out of the frame', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#site-marker')).toBeVisible()

  // Inlining a sibling page as a raw data: document strands it: its own
  // relative stylesheet cannot resolve against a data: base, and the
  // injected CSP never reaches it. So the in-frame link must not navigate.
  await expect(frame.locator('#to-page2')).not.toHaveAttribute('href', /./)
  await expect(frame.locator('#to-page2')).toHaveAttribute('data-mbz-page', 'page2.html')
  // The author's external link is untouched by that rule.
  await expect(frame.locator('#ext-link')).toHaveAttribute('href', 'https://example.com/docs')

  // MBZoo offers the pages instead, and each renders through the full
  // pipeline — stylesheet included.
  const pages = page.locator('.site-pages button')
  await expect(pages).toHaveCount(2)
  await pages.filter({ hasText: 'page2.html' }).click()

  const second = page.frameLocator('.html-frame')
  await expect(second.locator('#page2-marker')).toBeVisible()
  await expect(second.locator('#page2-marker')).toHaveCSS('color', 'rgb(0, 128, 0)')
})

test('external links in a sandboxed site open in a new tab (ADR-0017)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  // The frame may open a tab, but must not gain same-origin access.
  const sandbox = await page.locator('.html-frame').getAttribute('sandbox')
  expect(sandbox).toContain('allow-scripts')
  expect(sandbox).toContain('allow-popups')
  expect(sandbox).toContain('allow-popups-to-escape-sandbox')
  expect(sandbox).not.toContain('allow-same-origin')
  expect(sandbox).not.toContain('allow-top-navigation')

  const link = page.frameLocator('.html-frame').locator('#ext-link')
  await expect(link).toHaveAttribute('target', '_blank')
  const rel = (await link.getAttribute('rel')) ?? ''
  expect(rel).toContain('noopener')
  expect(rel).toContain('noreferrer')
  expect(rel).toContain('nofollow')
  // The href is left alone: it is the author's link, not ours to rewrite.
  await expect(link).toHaveAttribute('href', 'https://example.com/docs')
})

/**
 * A match question keeps its pairs in <plugin_qtype_match_question>, so a
 * renderer that only reads <answers> shows the stem with nothing under it
 * (SMR_SOR "Relaciona:").
 */
test('a match question shows the pairs it asks you to relate', async ({ page }) => {
  const fixture = mutatedFixture((entries) => {
    replaceTextEntry(entries, 'questions.xml', (xml) =>
      xml.replace(
        '<questions>',
        `<questions>
      <question id="4003">
        <qtype>match</qtype>
        <name>Relate these</name>
        <questiontext>Relate these</questiontext>
        <plugin_qtype_match_question>
          <matches>
            <match id="1"><questiontext>.mbz</questiontext><answertext>Moodle backup</answertext></match>
            <match id="2"><questiontext>.h5p</questiontext><answertext>Interactive package</answertext></match>
          </matches>
        </plugin_qtype_match_question>
      </question>`,
      ),
    )
    replaceTextEntry(entries, 'activities/quiz_3006/quiz.xml', (xml) =>
      xml.replace(/<questionid>\d+<\/questionid>/, '<questionid>4003</questionid>'),
    )
  }, 'match-quiz.mbz')

  await page.goto('/')
  await page.setInputFiles('#file-input', fixture)
  await page.getByRole('button', { name: /Self-assessment quiz/ }).click()

  const card = page.locator('.quiz-card')
  await expect(card).toContainText('Relate these')
  await expect(card.locator('.q-match-list dt')).toHaveCount(2)
  await expect(card.locator('.q-match-list dt').first()).toHaveText('.mbz')
  // The responses are the answer, so they stay hidden until revealed.
  await expect(card.locator('.q-match-list dd').first()).toBeHidden()
  await page.getByRole('button', { name: /Mostrar respuestas|Reveal answers/ }).click()
  await expect(card.locator('.q-match-list dd').first()).toHaveText('Moodle backup')
})

test('a folder lists its files and plays the audio one in place', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo folder/ }).click()

  // contentKind() labelled audio long before filePreview() could show it.
  const audio = page.locator('audio.media-preview')
  await expect(audio).toBeVisible()
  await expect(audio).toHaveAttribute('controls', '')
  const playable = await audio.evaluate(
    (el) => (el as HTMLAudioElement).readyState > 0 || (el as HTMLAudioElement).duration > 0,
  )
  expect(playable).toBe(true)
  // The download stays available next to the player, not instead of it.
  await expect(page.locator('.file-card', { has: audio }).getByText('Download')).toBeVisible()
})

test('a url activity offers the link without ever following it', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo external link/ }).click()

  await expect(page.locator('#detail a[href="https://example.org/mbzoo"]')).toBeVisible()
  expect(requests.filter((u) => u.includes('example.org'))).toHaveLength(0)
})

test('chat and wiki name their settings and say where the content went', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)

  await page.getByRole('button', { name: /Demo chat/ }).click()
  await expect(page.locator('#detail .fallback-note')).toContainText(
    /without user data|sin datos de usuario/,
  )
  // mod_chat is gone from Moodle core, so reading it is the whole point.
  await expect(page.locator('.legacy-pill')).toBeVisible()
  await expect(page.locator('.legacy-notice')).toContainText('5.0')
  await expect(page.locator('.legacy-notice')).toContainText('MDL-82457')

  // A module that still exists carries no such label.
  await page.getByRole('button', { name: /Demo forum/ }).click()
  await expect(page.locator('.legacy-pill')).toHaveCount(0)

  await page.getByRole('button', { name: /Demo wiki/ }).click()
  await expect(page.locator('#detail')).toContainText(/Collaborative wiki|Wiki colaborativo/)
  await expect(page.locator('#detail')).toContainText('Home')
})

/**
 * Two reads in flight at once used to clobber each other's worker handler, so
 * the first promise never settled and the renderer stopped half-way with no
 * error to show for it.
 */
test('concurrent activity opens both finish', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)

  await Promise.all([
    page.getByRole('button', { name: /Demo lesson/ }).click(),
    page.getByRole('button', { name: /Demo book/ }).click(),
  ])
  await expect(page.locator('#detail-title')).toHaveText('Demo book')
  await expect(page.locator('.book-chapter')).toBeVisible()

  // And the one that lost the race still renders when reopened.
  await page.getByRole('button', { name: /Demo lesson/ }).click()
  await expect(page.locator('.quiz-counter')).toHaveText(/1 .* 2/)
})

/**
 * A lesson is the one unhandled module that ships complete: mod_lesson writes
 * pages and answers unconditionally and gates only attempts behind userinfo.
 */
test('a lesson walks its branching pages in chain order', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo lesson/ }).click()

  // Page 501 is written second in the file; the prevpageid chain puts it first.
  await expect(page.locator('.quiz-counter')).toHaveText(/1 .* 2/)
  await expect(page.locator('#lesson-start')).toBeVisible()
  await expect(page.locator('.quiz-card')).toContainText('Start here')

  // On a content page the answers are branch buttons, so the jump is the point.
  await expect(page.locator('.lesson-jump').first()).toContainText('Which container is an .mbz?')

  await page.locator('.quiz-nav .btn-outline').nth(1).click()
  await expect(page.locator('#lesson-q')).toBeVisible()
  const answers = page.locator('.lesson-answers li')
  await expect(answers).toHaveCount(2)
  await expect(answers.first()).toHaveClass(/q-correct/)
  // LESSON_EOL (-9) and LESSON_THISPAGE (0) are named, not printed raw.
  await expect(answers.first().locator('.lesson-jump')).toContainText(
    /end of lesson|fin de la lección/,
  )
  await expect(answers.nth(1).locator('.lesson-jump')).toContainText(/this page|esta página/)
})

test('a choice shows the options it offered', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo choice/ }).click()

  const options = page.locator('.q-answers li')
  await expect(options).toHaveCount(2)
  await expect(options.first()).toContainText('ZIP')
  // limitanswers is on, so the per-option capacity is worth showing.
  await expect(options.first()).toContainText('20')
  await expect(page.locator('.q-answers input[type="radio"]')).toHaveCount(2)
})

test('a database shows the fields it collected, and says why there are no entries', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo database/ }).click()

  await expect(page.locator('.glossary-list dt')).toHaveCount(2)
  await expect(page.locator('.glossary-list dt').first()).toContainText('Backup name')
  await expect(page.locator('.glossary-list dt').first()).toContainText('text')
  await expect(page.locator('#detail .quiz-notice')).toContainText(/without user data|sin datos/)
})

test('a workshop shows its instructions and example submission', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo workshop/ }).click()

  await expect(page.locator('#ws-authors')).toBeVisible()
  await expect(page.locator('#ws-reviewers')).toBeVisible()
  await expect(page.locator('#ws-example')).toBeVisible()
  await expect(page.locator('#detail')).toContainText(/Submission|Envío/)
})

test('an IMS package shows the table of contents from its serialized structure', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo content package/ }).click()

  const toc = page.locator('.imscp-toc')
  await expect(toc.first()).toContainText('Overview')
  await expect(toc.first()).toContainText('overview.html')
  // A nested entry stays nested, and a heading with no file is still listed.
  await expect(toc.locator('.imscp-toc')).toContainText('Details')
  await expect(toc.first()).toContainText('Appendix')
})

test('a forum names its type and says its discussions are user data', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo forum/ }).click()

  await expect(page.locator('#detail')).toContainText(/Question and answer|pregunta y respuesta/)
  await expect(page.locator('#detail .fallback-note')).toContainText(
    /without user data|sin datos de usuario/,
  )
})

/**
 * A feedback activity is a questionnaire whose items pack their options into
 * one `presentation` string (SMR_SOR "Encuesta sobre la asignatura"); before
 * this it fell through to the generic intro-plus-metadata renderer.
 */
test('a feedback questionnaire renders every item', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo questionnaire/ }).click()

  const items = page.locator('.feedback-item')
  await expect(items).toHaveCount(3) // label + multichoice + textarea
  await expect(page.locator('#fb-label')).toContainText('About this demo')

  // Moodle numbers only the items that collect an answer, so the label and
  // the page break do not consume a number.
  await expect(items.nth(1)).toContainText('1. Did the fixture open?')
  await expect(items.nth(1)).toContainText('Yes')
  await expect(items.nth(1)).toContainText('No')
  await expect(items.nth(1).locator('input[type="radio"]')).toHaveCount(2)
  await expect(items.nth(2)).toContainText('2. Anything else?')
  await expect(items.nth(2).locator('textarea')).toBeVisible()

  // "30|5" is the textarea's width|height, never two options.
  await expect(items.nth(2).locator('input[type="radio"]')).toHaveCount(0)
  await expect(page.locator('.feedback-pagebreak')).toHaveCount(1)
})

/**
 * Glossary entries are user-generated, so a backup taken without user data
 * has none by construction — SMR_SOR's "Glosario para SOR." is empty for
 * exactly that reason, and "no entries" alone reads like a parse gap.
 */
test('an empty glossary says why when the backup carries no user data', async ({ page }) => {
  const fixture = mutatedFixture((entries) => {
    replaceTextEntry(entries, 'activities/glossary_3007/glossary.xml', (xml) =>
      xml.replace(/<entries>[\s\S]*?<\/entries>/, '<entries>\n    </entries>'),
    )
  }, 'no-user-data-glossary.mbz')

  await page.goto('/')
  await page.setInputFiles('#file-input', fixture)
  await page.getByRole('button', { name: /Demo glossary/ }).click()

  const note = page.locator('#detail .fallback-note')
  await expect(note).toContainText('without user data')
})

/** Turns the quiz's first slot into a random draw from the bank category. */
function randomQuizFixture(): { name: string; mimeType: string; buffer: Buffer } {
  return mutatedFixture((entries) => {
    replaceTextEntry(entries, 'questions.xml', (xml) =>
      xml.replace(
        '<questions>',
        `<questions>
      <question id="4099">
        <qtype>random</qtype>
        <name>Organizado al azar (Default)</name>
        <questiontext>1</questiontext>
      </question>`,
      ),
    )
    replaceTextEntry(entries, 'activities/quiz_3006/quiz.xml', (xml) =>
      xml.replace(/<questionid>\d+<\/questionid>/, '<questionid>4099</questionid>'),
    )
  }, 'random-quiz.mbz')
}

test('a random quiz slot pages through the pool it draws from', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', randomQuizFixture())
  await page.getByRole('button', { name: /Self-assessment quiz/ }).click()

  // One random slot over a two-question category, plus one fixed slot: the
  // reader must reach both bank questions, not a placeholder card.
  const summary = page.locator('.quiz-random-summary')
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('2')
  await expect(page.locator('.quiz-counter')).toHaveText(/1 .* 2/)

  const card = page.locator('.quiz-card')
  await expect(card).toContainText('Pool layout')
  await expect(card.locator('.q-pool-chip')).toContainText('Default')
  // The pool ships in the backup, so we must not claim the opposite.
  await expect(card).not.toContainText('not included in the backup')
  await expect(card).not.toContainText('not present in this backup')
  // A real question, not the placeholder standing in for it.
  await expect(card.locator('input[type="radio"]')).toHaveCount(2)
  await expect(card).not.toContainText('Organizado al azar')

  await page.locator('.quiz-nav .btn-outline').nth(1).click()
  await expect(card).toContainText('Container formats')
})

/**
 * Moodle rewrites internal links as $@CODE*arg@$ at backup time. Untouched,
 * they resolve against MBZoo's own origin (ADR-0019).
 */
function encodedLinkFixture(): { name: string; mimeType: string; buffer: Buffer } {
  return mutatedFixture((entries) => {
    replaceTextEntry(entries, 'activities/page_3004/page.xml', (xml) =>
      xml.replace(
        /<content>[\s\S]*?<\/content>/,
        '<content>' +
          '&lt;a id="to-other-course" href="$@COURSEVIEWBYID*62@$"&gt;Other course&lt;/a&gt;' +
          '&lt;a id="to-welcome" href="$@PAGEVIEWBYID*3001@$"&gt;Welcome page&lt;/a&gt;' +
          '&lt;a id="to-nowhere" href="$@NOSUCHCODE*1@$"&gt;Unknown&lt;/a&gt;' +
          '&lt;img id="token-img" src="$@COURSEVIEWBYID*62@$" alt="x"&gt;' +
          '</content>',
      ),
    )
  }, 'encoded-links.mbz')
}

test('backup link tokens resolve instead of pointing at MBZoo', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', encodedLinkFixture())
  await page.getByRole('button', { name: /About this demo/ }).click()

  // Another course on the original site: a real link, opened in a new tab.
  const other = page.locator('#to-other-course')
  await expect(other).toHaveAttribute('href', 'https://demo.example.invalid/course/view.php?id=62')
  await expect(other).toHaveAttribute('target', '_blank')
  expect(await other.getAttribute('rel')).toContain('noopener')

  // An activity travelling in this same backup navigates inside MBZoo.
  await expect(page.locator('#to-welcome')).toHaveAttribute('data-mbz-activity', '3001')

  // A code MBZoo cannot decode must not pretend to lead anywhere — but it
  // must still be visible as a link that led somewhere once, and say which.
  await expect(page.locator('#to-nowhere')).not.toHaveAttribute('href', /./)
  await expect(page.locator('#to-nowhere')).toHaveClass(/mbz-link-dead/)
  await expect(page.locator('#to-nowhere')).toHaveAttribute('title', /NOSUCHCODE/)

  // No token may survive in a URL attribute: it would be requested from us.
  const hrefs = await page.locator('.activity-content [href], .activity-content [src]').all()
  for (const el of hrefs) {
    expect((await el.getAttribute('href')) ?? '').not.toContain('$@')
    expect((await el.getAttribute('src')) ?? '').not.toContain('$@')
  }

  await page.locator('#to-welcome').click()
  await expect(page.locator('#detail-title')).toContainText('Welcome page')
})
