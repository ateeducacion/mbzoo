import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { openBackup } from '../src/index.ts'
import { MbzParseError } from '../src/model/backup.ts'

const FIXTURE = join(import.meta.dir, '../../../fixtures/files/demo-course-zip.mbz')

describe('openBackup (synthetic ZIP fixture)', () => {
  test('parses course metadata', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.format).toBe('zip')
    expect(b.course.fullname).toBe('Demo Course for MBZoo')
    expect(b.course.shortname).toBe('DEMO-101')
    expect(b.course.idNumber).toBe('MBZOO-DEMO')
  })

  test('reconstructs sections with ordered activities', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.sections.map((s) => s.number)).toEqual([1, 2])
    expect(b.sections[0]?.name).toBe('Introduction')
    expect(b.sections[0]?.activityIds).toEqual([3001, 3002, 3004])
    expect(b.sections[1]?.activityIds).toEqual([3003, 3005])
  })

  test('exposes unknown third-party modules instead of dropping them', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    const unknown = b.activities.find((a) => a.moduleName === 'supermodule')
    expect(unknown?.title).toBe('Unknown third-party module')
  })

  test('indexes files.xml records', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.files.size).toBe(3)
    const names = [...b.files.values()].map((f) => f.fileName)
    expect(names).toContain('readme.txt')
    expect(names).toContain('dot.svg')
    expect(names).toContain('guide.txt')
  })
})

describe('format detection and error handling', () => {
  test('rejects non-backup files with a clear error', async () => {
    const notMbz = new Blob([new TextEncoder().encode('definitely not an mbz')])
    expect(openBackup(notMbz)).rejects.toBeInstanceOf(MbzParseError)
  })

  test('rejects empty input', async () => {
    expect(openBackup(new Blob([]))).rejects.toBeInstanceOf(MbzParseError)
  })
})
