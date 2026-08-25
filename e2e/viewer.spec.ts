import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, '..', 'fixtures', 'files', 'demo-course-zip.mbz')

/** Host of a request URL, or '' for anything unparseable. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

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

/**
 * A Page whose content embeds a stored image through @@PLUGINFILE@@ — the
 * shape every real course uses and that the synthetic fixture never had.
 */
/**
 * A Page that embeds a stored PDF with <object>, the way a teacher does it
 * from the HTML source view. Moodle stores page content with noclean, so the
 * markup survives into the backup verbatim.
 */
function pagePdfFixture(): { name: string; mimeType: string; buffer: Buffer } {
  const pdf = Buffer.from(
    'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0MSA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDIwIDQwIFRkIChNQlpPTyBFTUJFRCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzMzIgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MDIKJSVFT0YK',
    'base64',
  )
  return mutatedFixture((entries) => {
    const bytes = new Uint8Array(pdf)
    const hash = createHash('sha1').update(bytes).digest('hex')
    entries[`files/${hash.slice(0, 2)}/${hash}`] = bytes

    replaceTextEntry(entries, 'files.xml', (xml) => {
      const record = `  <file>
    <contenthash>${hash}</contenthash>
    <contextid>104</contextid>
    <component>mod_page</component>
    <filearea>content</filearea>
    <itemid>0</itemid>
    <filepath>/</filepath>
    <filename>notes.pdf</filename>
    <userid>2</userid>
    <filesize>${bytes.byteLength}</filesize>
    <mimetype>application/pdf</mimetype>
    <status>0</status>
    <timecreated>1700000000</timecreated>
    <timemodified>1700000000</timemodified>
    <source>$@NULL@$</source>
    <author>$@NULL@$</author>
    <license>$@NULL@$</license>
    <sortorder>0</sortorder>
    <repositorytype>$@NULL@$</repositorytype>
    <repositoryid>$@NULL@$</repositoryid>
    <reference>$@NULL@$</reference>
  </file>`
      return xml.replace('</files>', `${record}\n</files>`)
    })

    replaceTextEntry(entries, 'activities/page_3004/page.xml', (xml) =>
      xml.replace(
        /<content>[\s\S]*?<\/content>/,
        '<content>&lt;p id="pdf-text"&gt;See the notes below.&lt;/p&gt;' +
          '&lt;object data="@@PLUGINFILE@@/notes.pdf" type="application/pdf"&gt;fallback&lt;/object&gt;' +
          '&lt;iframe id="remote" src="https://evil.example/x"&gt;&lt;/iframe&gt;</content>',
      ),
    )
  }, 'page-pdf.mbz')
}

function pageImageFixture(): { name: string; mimeType: string; buffer: Buffer } {
  // 1x1 red PNG.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  return mutatedFixture((entries) => {
    const bytes = new Uint8Array(png)
    const hash = createHash('sha1').update(bytes).digest('hex')
    entries[`files/${hash.slice(0, 2)}/${hash}`] = bytes

    replaceTextEntry(entries, 'files.xml', (xml) => {
      const record = `  <file>
    <contenthash>${hash}</contenthash>
    <contextid>104</contextid>
    <component>mod_page</component>
    <filearea>content</filearea>
    <itemid>0</itemid>
    <filepath>/</filepath>
    <filename>diagram.png</filename>
    <userid>2</userid>
    <filesize>${bytes.byteLength}</filesize>
    <mimetype>image/png</mimetype>
    <status>0</status>
    <timecreated>1700000000</timecreated>
    <timemodified>1700000000</timemodified>
    <source>$@NULL@$</source>
    <author>$@NULL@$</author>
    <license>$@NULL@$</license>
    <sortorder>0</sortorder>
    <repositorytype>$@NULL@$</repositorytype>
    <repositoryid>$@NULL@$</repositoryid>
    <reference>$@NULL@$</reference>
  </file>`
      return xml.replace('</files>', `${record}\n</files>`)
    })

    replaceTextEntry(entries, 'activities/page_3004/page.xml', (xml) =>
      xml.replace(
        /<content>[\s\S]*?<\/content>/,
        '<content>&lt;p id="page-text"&gt;Body text.&lt;/p&gt;' +
          '&lt;img id="page-img" src="@@PLUGINFILE@@/diagram.png" alt="diagram"&gt;' +
          '&lt;a id="page-link" href="@@PLUGINFILE@@/diagram.png"&gt;download&lt;/a&gt;</content>',
      ),
    )
  }, 'page-image.mbz')
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
  expect(meta).toContain('3 sections')
  expect(meta).toContain('27 activities')

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
  // The grade item adds a second facts grid, so scope to the dates one.
  const summary = page.locator('.summary-grid').first()
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
<a id="to-page2" href="page2.html">page two</a>
<a id="to-page2-deep" href="page2.html#deep">page two, deep</a>
<button id="forge" onclick="parent.postMessage({source:'mbzoo',type:'navigate',page:'../../../secret.html'},'*')">forge</button>
<button id="forge-known" onclick="parent.postMessage({source:'evil',type:'navigate',page:'page2.html'},'*')">forge known</button>
<button id="forge-notoken" onclick="parent.postMessage({source:'mbzoo',type:'navigate',page:'page2.html'},'*')">forge no token</button>
<button id="forge-badtoken" onclick="parent.postMessage({source:'mbzoo',type:'navigate',token:'guessed',page:'page2.html'},'*')">forge bad token</button>
</body></html>`
  // A second page of the same site, styled by the same relative stylesheet —
  // the shape every eXeLearning export has (SMR_SOR "Solución a la tarea").
  const page2 = `<!doctype html>
<html><head><link rel="stylesheet" href="site.css"></head>
<body><p id="page2-marker">page two</p>
<div style="height:200vh"></div>
<p id="deep">deep anchor</p>
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

test('a link inside a multi-page site navigates through MBZoo (ADR-0022)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#site-marker')).toBeVisible()

  // The href stays defused: a document must never reach a sibling page
  // outside the render pipeline. That rule of ADR-0020 is carried forward.
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

test('a link fragment survives the navigation (ADR-0022)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  await page.frameLocator('.html-frame').locator('#to-page2-deep').click()
  await expect(page.frameLocator('.html-frame').locator('#deep')).toBeVisible()
  // MBZoo's half of the contract is putting the fragment on the document
  // URL; the browser does the scrolling. Asserting the URL is what makes
  // this deterministic — a scroll-position assertion races the frame reload.
  await expect(page.locator('.html-frame')).toHaveAttribute('src', /^blob:.*#deep$/)
})

test('a forged navigation request cannot leave the resource (ADR-0022)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', websiteFixture())
  await page.getByRole('button', { name: /Synthetic guide/ }).click()

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#site-marker')).toBeVisible()

  // A path climbing out of the resource resolves to nothing in the allowlist.
  await frame.locator('#forge').click()
  // A message wearing the wrong source is refused even though the page it
  // names is a legitimate one.
  await frame.locator('#forge-known').click()
  // And a well-formed message that cannot echo this document's token is
  // refused too — that is what stops a document the frame navigated itself
  // to from driving the preview (ADR-0022).
  await frame.locator('#forge-notoken').click()
  await frame.locator('#forge-badtoken').click()

  await expect(page.frameLocator('.html-frame').locator('#site-marker')).toBeVisible()
  await expect(page.locator('.site-pages button.selected')).toHaveText('index.html')
})

test('an image embedded in a Page renders (@@PLUGINFILE@@)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', pageImageFixture())
  await page.getByRole('button', { name: /About this demo/ }).click()

  await expect(page.locator('#page-text')).toBeVisible()
  // resolveHtml swaps @@PLUGINFILE@@ for a managed blob: URL before the HTML
  // is sanitized, so the sanitizer has to let blob: through or the reference
  // is deleted and the reader gets a broken image.
  const img = page.locator('#page-img')
  await expect(img).toHaveAttribute('src', /^blob:/)
  const loaded = await img.evaluate(
    (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
  )
  expect(loaded).toBe(true)
  // The same applies to a link pointing at a stored file.
  await expect(page.locator('#page-link')).toHaveAttribute('href', /^blob:/)
})

test('a PDF embedded in a Page renders instead of vanishing', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))

  await page.goto('/')
  await page.setInputFiles('#file-input', pagePdfFixture())
  await page.getByRole('button', { name: /About this demo/ }).click()

  await expect(page.locator('#pdf-text')).toBeVisible()
  // DOMPurify unwraps <object> and drops <iframe> with its subtree, so the
  // reference has to be promoted before sanitizing or there is nothing left
  // to render. It comes back as a real pdf.js canvas.
  await expect(page.locator('.activity-content canvas')).toBeVisible()
  await expect(page.locator('[data-mbz-embed]')).toHaveCount(0)

  // An embed pointing anywhere but a resolved backup file stays dropped —
  // this must not become a way to load remote content (ADR-0009).
  await expect(page.locator('#remote')).toHaveCount(0)
  expect(requests.filter((u) => u.includes('evil.example'))).toEqual([])
})

test('a SCORM package plays inside the opaque-origin sandbox (ADR-0023)', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))

  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo SCORM package/ }).click()

  // The table of contents comes from scorm.xml, where Moodle already
  // flattened the package manifest — MBZoo never reads imsmanifest.xml.
  const items = page.locator('.site-pages button')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toHaveText('First step')
  await expect(items.nth(1)).toHaveText('Second step')

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#sco-title')).toHaveText('First step')
  // The SCO finds the API with the ADL findAPI(window) walk and drives it.
  // Runtime and SCO share one document precisely so that walk succeeds.
  await expect(frame.locator('#sco-api')).toHaveText('api-found')
  await expect(frame.locator('#sco-value')).toHaveText('completed')

  // The sandbox is unchanged: opaque origin, no same-origin access.
  const sandbox = await page.locator('.html-frame').getAttribute('sandbox')
  expect(sandbox).toContain('allow-scripts')
  expect(sandbox).not.toContain('allow-same-origin')

  // Nothing the runtime does may reach the network (ADR-0009).
  expect(requests.filter((u) => /^https?:\/\/(?!127\.0\.0\.1|localhost)/.test(u))).toEqual([])

  // Second item, through MBZoo's own chrome.
  await items.nth(1).click()
  await expect(page.frameLocator('.html-frame').locator('#sco-title')).toHaveText('Second step')
})

test('a link between SCOs navigates through MBZoo (ADR-0022 + ADR-0023)', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo SCORM package/ }).click()

  const frame = page.frameLocator('.html-frame')
  await expect(frame.locator('#sco-title')).toHaveText('First step')
  // The same validated bridge the multi-page site uses, reused unchanged.
  await expect(frame.locator('#sco-next')).toHaveAttribute('data-mbz-page', 'sco2.html')
  await frame.locator('#sco-next').click()
  await expect(page.frameLocator('.html-frame').locator('#sco-title')).toHaveText('Second step')
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
  // Compare the host, not a substring: "example.org" appearing anywhere in a
  // URL would also match https://elsewhere.test/?ref=example.org, so the
  // substring form both over-matches and fails to assert what it claims.
  expect(requests.filter((u) => hostOf(u) === 'example.org')).toHaveLength(0)
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

  // All three retirements are in the fixture, each with its own release.
  await page.getByRole('button', { name: /Demo survey/ }).click()
  await expect(page.locator('.legacy-notice')).toContainText('5.0')
  await page.getByRole('button', { name: /Demo 2.2 assignment/ }).click()
  await expect(page.locator('.legacy-notice')).toContainText('4.2')
  await expect(page.locator('.legacy-notice')).toContainText('MDL-72350')

  // A module that still exists carries no such label.
  await page.getByRole('button', { name: /Demo forum/ }).click()
  await expect(page.locator('.legacy-pill')).toHaveCount(0)

  await page.getByRole('button', { name: /Demo wiki/ }).click()
  await expect(page.locator('#detail')).toContainText(/Collaborative wiki|Wiki colaborativo/)
  await expect(page.locator('#detail')).toContainText('Home')
})

// Spanish folds "drop.file" into "drop.title", so its translation is an empty
// string on purpose. Treating empty as missing printed the key itself on the
// landing page and warned on every load.
test.describe('Spanish locale', () => {
  test.use({ locale: 'es-ES' })

  test('an intentionally empty translation renders as empty, not as its key', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text())
    })
    await page.goto('/')

    const title = page.locator('.dz-title')
    await expect(title).toContainText('Arrastra aquí tu archivo')
    await expect(title).not.toContainText('drop.file')
    expect(warnings.filter((w) => w.includes('missing key'))).toEqual([])
  })
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
 * A backup taken with users=1 carries names, emails, usernames and addresses.
 * The demo fixture is content-only on purpose — the public demo should not
 * ship a personal-data warning — so this builds one that is not.
 */
function withUsersFixture(): { name: string; mimeType: string; buffer: Buffer } {
  return mutatedFixture((entries) => {
    replaceTextEntry(entries, 'moodle_backup.xml', (xml) =>
      xml.replace(
        '<setting><level>root</level><name>users</name><value>0</value></setting>',
        '<setting><level>root</level><name>users</name><value>1</value></setting>',
      ),
    )
    entries['users.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
<users>
  <user id="9001" contextid="900">
    <username>demo.teacher</username>
    <idnumber>T-001</idnumber>
    <email>teacher@example.invalid</email>
    <city>Las Palmas</city>
    <country>ES</country>
    <lastip>203.0.113.7</lastip>
    <auth>manual</auth>
    <firstname>Demo</firstname>
    <lastname>Teacher</lastname>
    <deleted>0</deleted>
  </user>
  <user id="9002" contextid="901">
    <username>demo.student</username>
    <email>student@example.invalid</email>
    <auth>manual</auth>
    <firstname>Demo</firstname>
    <lastname>Student</lastname>
    <deleted>1</deleted>
  </user>
</users>
`,
    )
  }, 'with-users.mbz')
}

test('a backup carrying people says so, and does not spill the names by default', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', withUsersFixture())

  const box = page.locator('#personal-data')
  await expect(box).toBeVisible()
  await expect(box).toContainText('2')
  // Which kinds are present, so the warning is specific rather than vague.
  await expect(box).toContainText(/email addresses|correos/)
  await expect(box).toContainText(/IP addresses|direcciones IP/)

  // The names are there, but reading them is a deliberate act.
  await expect(page.locator('.user-list')).toBeHidden()
  await box.locator('summary').click()
  await expect(page.locator('.user-list li').first()).toContainText('Demo Teacher')
  await expect(page.locator('.user-list li').first()).toContainText('teacher@example.invalid')
  await expect(page.locator('.user-list li').nth(1)).toContainText(
    /deleted account|cuenta eliminada/,
  )
})

test('a content-only backup shows no personal-data warning', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await expect(page.locator('#personal-data')).toBeHidden()
})

test('an activity shows what it is worth and the rubric that judges it', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)
  await page.getByRole('button', { name: /Demo assignment/ }).click()

  // grades.xml: authored, and present without any user data.
  const detail = page.locator('#detail')
  await expect(detail).toContainText(/Out of|Sobre/)
  await expect(detail).toContainText('100')
  await expect(detail).toContainText(/Pass mark|Nota para aprobar/)
  await expect(detail).toContainText('50')

  // grading.xml: the rubric is often the clearest statement of the task.
  await expect(page.locator('#rubric-desc')).toBeVisible()
  const criteria = page.locator('.rubric-criterion')
  await expect(criteria).toHaveCount(2)
  await expect(criteria.first()).toContainText('Clarity')
  const scores = criteria.first().locator('.rubric-score')
  await expect(scores).toHaveCount(2)
  await expect(scores.first()).toHaveText('0')
})

test('the course gradebook shows its structure, never anyone marks', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)

  const book = page.locator('.course-gradebook')
  await expect(book).toBeVisible()
  await book.locator('summary').click()
  await expect(book).toContainText('Coursework')
  await expect(book).toContainText(/weighted mean|media ponderada/)
  await expect(book).toContainText(/natural|suma/)
  await expect(book.locator('.gradebook-letters')).toContainText('A ≥ 90')
})

// Moodle 4.5+ delegated sections: the section belongs under the module that
// owns it, so the tree must nest rather than list it as a sibling. Verified
// additionally against Moodle's own mod_subsection fixture and a Moodle 5.2.2
// course built for this purpose.
test('a delegated section nests under the module that owns it', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', FIXTURE)

  // Three sections exist, but only the two numbered ones head the tree.
  const headings = page.locator('#sections > li > h3')
  await expect(headings).toHaveCount(2)
  await expect(headings.nth(0)).toHaveText('Introduction')
  await expect(headings.nth(1)).toHaveText('Resources')

  const owner = page.locator('li.has-subsection', {
    has: page.getByRole('button', { name: /Demo subsection/ }),
  })
  await expect(owner).toHaveCount(1)
  const nested = owner.locator('.subsection-list .activity-button')
  await expect(nested).toHaveCount(1)
  await expect(nested).toContainText('Page inside the subsection')

  // And it is a real activity, not just a label in the tree.
  await nested.click()
  await expect(page.locator('#in-subsection')).toBeVisible()
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
