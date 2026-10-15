import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, '..', 'fixtures', 'files', 'demo-course-zip.mbz')

function mutatedFixture(
  mutate: (entries: Record<string, Uint8Array>) => void,
  name: string,
): { name: string; mimeType: string; buffer: Buffer } {
  const entries = unzipSync(new Uint8Array(readFileSync(FIXTURE)))
  mutate(entries)
  return {
    name,
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(entries)),
  }
}

function sizeMismatchFixture(): { name: string; mimeType: string; buffer: Buffer } {
  return mutatedFixture((entries) => {
    const filesData = entries['files.xml']
    if (!filesData) throw new Error('Missing files.xml')
    const filesXml = strFromU8(filesData)
    const records = filesXml.match(/<file\b[^>]*>[\s\S]*?<\/file>/g) ?? []
    const record = records.find((item) => item.includes('<filename>guide.txt</filename>'))
    if (!record) throw new Error('Missing guide.txt record')
    const next = record.replace(/<filesize>\d+<\/filesize>/, '<filesize>999999</filesize>')
    entries['files.xml'] = strToU8(filesXml.replace(record, next))
  }, 'size-mismatch.mbz')
}

const XML = '<?xml version="1.0" encoding="UTF-8"?>'

function illegalCharFixture(): { name: string; mimeType: string; buffer: Buffer } {
  const title = `A\u0001&lt;img src=x onerror=&quot;window.__pwned=1&quot;&gt;`
  const manifest = `${XML}
<moodle_backup><information>
  <name>Demo</name>
  <moodle_release>4.5</moodle_release>
  <backup_version>2024100700</backup_version>
  <contents>
    <course><courseid>1</courseid><title>${title}</title><directory>course</directory></course>
    <sections><section><sectionid>10</sectionid><title>Topic</title><directory>sections/section_10</directory></section></sections>
    <activities></activities>
  </contents>
  <settings>
    <setting><level>root</level><name>users</name><value>0</value></setting>
    <setting><level>root</level><name>files</name><value>0</value></setting>
  </settings>
</information></moodle_backup>`
  const entries = {
    'moodle_backup.xml': strToU8(manifest),
    'course/course.xml': strToU8(
      `${XML}<course><fullname>Demo course</fullname><shortname>demo</shortname></course>`,
    ),
    'sections/section_10/section.xml': strToU8(
      `${XML}<section id="10"><number>1</number><name>Topic</name></section>`,
    ),
  }
  return {
    name: 'illegal.mbz',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(entries)),
  }
}

test('MBZ Doctor analyzes a backup and repairs a file size', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', sizeMismatchFixture())
  await expect(page.locator('#course-title')).toHaveText('Demo Course for MBZoo')

  const open = page.getByRole('button', { name: 'MBZ Doctor', exact: true })
  await open.click()
  const dialog = page.locator('#doctor')
  await expect(dialog).toBeVisible()
  await expect(page.locator('#doctor-title')).toHaveText('MBZ Doctor')

  await page.getByRole('button', { name: 'Analyze Backup' }).click()
  await expect(page.locator('#doctor-status')).toContainText('Analysis finished')
  await expect(page.locator('#doctor-findings')).toContainText(
    'Declared file size does not match the bytes',
  )
  await expect(page.locator('#doctor-findings')).toContainText('No target Moodle version selected')

  await page.locator('#doctor-filter-severity').selectOption('critical')
  await expect(page.locator('#doctor-findings')).not.toContainText(
    'No target Moodle version selected',
  )
  await page.locator('#doctor-filter-severity').selectOption('')
  await page.locator('#doctor-filter-repair').selectOption('automatic')
  const card = page.locator('.doctor-finding', { hasText: '999999' })
  await expect(card).toHaveCount(1)
  await card.locator('input[type="checkbox"]').check()
  await page.getByRole('button', { name: 'Preview Changes' }).click()
  await expect(page.locator('#doctor-preview')).toContainText('Before')
  await expect(page.locator('#doctor-preview')).toContainText('999999')

  await page.getByRole('button', { name: 'Repair All Safe Issues' }).click()
  await expect(page.locator('#doctor-status')).toContainText(
    'Successful restoration in Moodle has not been verified',
  )

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Repaired MBZ' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('size-mismatch-repaired.mbz')
  const saved = await download.path()
  if (!saved) throw new Error('Download has no path')
  const repaired = unzipSync(new Uint8Array(readFileSync(saved)))
  const filesXml = strFromU8(repaired['files.xml'] ?? new Uint8Array())
  expect(filesXml).not.toContain('<filesize>999999</filesize>')
  expect(repaired['moodle_backup.xml']).toBeTruthy()
  expect(repaired['course/course.xml']).toBeTruthy()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()
})

test('MBZ Doctor stays usable on a narrow viewport and does not execute backup text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  await page.setInputFiles('#file-input', illegalCharFixture())
  await expect(page.locator('#error')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze archive' }).click()
  const box = await page.locator('#doctor').boundingBox()
  expect(box?.width ?? 999).toBeLessThanOrEqual(390)

  await page.getByRole('button', { name: 'Analyze Backup' }).click()
  await expect(page.locator('#doctor-findings')).toContainText('Illegal XML control characters')
  await expect(page.locator('#doctor-facts')).toContainText('onerror')
  await expect(page.locator('#doctor img')).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as Window & { __pwned?: number }).__pwned),
  ).toBeUndefined()

  await page.locator('#doctor-filter-repair').selectOption('confirmation-required')
  const illegalCard = page.locator('.doctor-finding', {
    hasText: 'Illegal XML control characters',
  })
  await illegalCard.locator('input[type="checkbox"]').check()
  await page.getByRole('button', { name: 'Repair Selected' }).click()
  await expect(page.locator('#doctor-confirm')).toBeVisible()
  await page.locator('#doctor-confirm-check').check()
  await page.getByRole('button', { name: 'Apply confirmed repairs' }).click()
  await expect(page.locator('#doctor-status')).toContainText(
    'Successful restoration in Moodle has not been verified',
  )

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Repaired MBZ' }).click()
  const download = await downloadPromise
  const saved = await download.path()
  if (!saved) throw new Error('Download has no path')
  await page.setInputFiles('#file-input', saved)
  await expect(page.locator('#doctor')).toBeHidden()
  await expect(page.locator('#course-title')).toHaveText('Demo course')
  await page.getByRole('button', { name: 'MBZ Doctor', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze Backup' }).click()
  await expect(page.locator('#doctor-findings')).not.toContainText('Illegal XML control characters')
  await expect(page.locator('#doctor-facts')).toContainText('onerror')
  await expect(page.locator('#doctor img')).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as Window & { __pwned?: number }).__pwned),
  ).toBeUndefined()
})

test('a truncated archive can be diagnosed without a course model', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('#file-input', {
    name: 'broken.mbz',
    mimeType: 'application/zip',
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  })
  await expect(page.locator('#error')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze archive' }).click()
  await page.getByRole('button', { name: 'Analyze Backup' }).click()
  await expect(page.locator('#doctor-findings')).toContainText('Archive cannot be opened safely')
  await expect(page.getByRole('button', { name: 'Repair All Safe Issues' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Download Repaired MBZ' })).toBeDisabled()
})

test.describe('French doctor', () => {
  test.use({ locale: 'fr-FR' })

  test('doctor chrome uses the French dictionary', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text())
    })
    await page.goto('/')
    await page.setInputFiles('#file-input', FIXTURE)
    await page.getByRole('button', { name: 'MBZ Doctor', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Analyser la sauvegarde' })).toBeVisible()
    await page.getByRole('button', { name: 'Analyser la sauvegarde' }).click()
    await expect(page.locator('#doctor-status')).toContainText('Analyse terminée')
    expect(warnings.filter((warning) => warning.includes('missing key'))).toEqual([])
  })
})
