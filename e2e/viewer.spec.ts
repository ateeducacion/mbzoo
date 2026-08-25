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
  expect(meta).toContain('10 activities')

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
  await expect(page.locator('.html-frame')).toHaveAttribute('sandbox', 'allow-scripts')
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
  ]) {
    await expect(page.locator(`.mod-badge`, { hasText: mod }).first()).toBeVisible()
  }
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
