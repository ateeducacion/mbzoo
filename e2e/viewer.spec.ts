import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, '..', 'fixtures', 'files', 'demo-course-zip.mbz')

test('opens the synthetic .mbz and renders the course structure', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'MBZoo' })).toBeVisible()

  await page.setInputFiles('#file-input', FIXTURE)

  await expect(page.locator('#course-title')).toHaveText('Demo Course for MBZoo')
  const meta = await page.locator('#course-meta').textContent()
  expect(meta).toContain('2 sections')
  expect(meta).toContain('5 activities')

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
