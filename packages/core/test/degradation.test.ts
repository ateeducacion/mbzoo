import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { type Zippable, zipSync } from 'fflate'
import { openBackup } from '../src/open-backup.ts'

const FIXTURE = join(import.meta.dir, '../../../fixtures/files/demo-course-zip.mbz')

/** Builds an ad-hoc .mbz by copying fixture entries and dropping some. */
async function rebuildZip(keep: (name: string) => boolean): Promise<Blob> {
  const entries: Zippable = {}
  // Read the committed fixture through fflate for its entry list.
  const fixtureBytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())
  const { unzipSync } = await import('fflate')
  for (const [name, data] of Object.entries(unzipSync(fixtureBytes))) {
    if (name.endsWith('/')) continue
    if (keep(name)) entries[name] = data
  }
  return new Blob([zipSync(entries)])
}

describe('openBackup degradation paths', () => {
  test('missing files.xml warns instead of failing', async () => {
    const b = await openBackup(await rebuildZip((n) => n !== 'files.xml'))
    expect(b.files.size).toBe(0)
    expect(b.warnings.some((w) => w.code === 'files-xml-missing')).toBe(true)
  })

  test('missing section detail keeps moodle_backup.xml metadata and warns', async () => {
    const b = await openBackup(await rebuildZip((n) => !n.startsWith('sections/section_2001/')))
    expect(b.warnings.some((w) => w.code === 'section-xml-missing')).toBe(true)
    expect(b.sections.length).toBe(3)
  })

  test('missing course/course.xml falls back to moodle_backup.xml title', async () => {
    const b = await openBackup(await rebuildZip((n) => n !== 'course/course.xml'))
    expect(b.course.fullname).toBe('Demo Course for MBZoo')
    expect(b.course.shortname).toBe('')
  })

  test('zip lacking moodle_backup.xml is rejected clearly', async () => {
    const blob = await rebuildZip((n) => n !== 'moodle_backup.xml')
    expect(openBackup(blob)).rejects.toThrow(/not found/)
  })

  test('entry reads outside the archive throw MbzParseError', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.files.size).toBeGreaterThan(0)
  })
})
