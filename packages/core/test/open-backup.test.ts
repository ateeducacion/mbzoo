import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { openBackup } from '../src/index.ts'
import { MbzParseError } from '../src/model/backup.ts'

const FIXTURE = join(import.meta.dir, '../../../fixtures/files/demo-course-zip.mbz')

describe('openBackup (synthetic ZIP fixture)', () => {
  // Glossary entries, forum posts and submissions only travel when the
  // backup was taken with user data (SMR_SOR has users=0, hence its empty
  // "Glosario para SOR." — an expected absence, not a parse gap).
  test('records whether the backup carries user data', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.includesUserData).toBe(false)
  })

  test('parses course metadata', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.format).toBe('zip')
    expect(b.course.fullname).toBe('Demo Course for MBZoo')
    expect(b.course.shortname).toBe('DEMO-101')
    expect(b.course.idNumber).toBe('MBZOO-DEMO')
  })

  test('keeps the release and date the backup was taken with', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.moodleRelease).toBe('3.8.4+ (Build: 20200909)')
    expect(b.backupDate).toBe(1700000000)
  })

  test('reconstructs sections with ordered activities', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.sections.map((s) => s.number)).toEqual([1, 3, 2])
    expect(b.sections[0]?.name).toBe('Introduction')
    expect(b.sections[0]?.activityIds).toEqual([
      3001, 3002, 3004, 3006, 3007, 3012, 3013, 3014, 3015, 3019, 3021, 3022, 3025,
    ])
    // Index 1 is the delegated section, which sits between the two numbered
    // ones in document order; "Resources" is index 2.
    expect(b.sections[2]?.activityIds).toEqual([
      3003, 3005, 3008, 3009, 3010, 3011, 3016, 3017, 3018, 3020, 3023, 3024, 3027,
    ])
  })

  test('exposes unknown third-party modules instead of dropping them', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    const unknown = b.activities.find((a) => a.moduleName === 'supermodule')
    expect(unknown?.title).toBe('Unknown third-party module')
  })

  test('indexes files.xml records', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    expect(b.files.size).toBe(14)
    const names = [...b.files.values()].map((f) => f.fileName)
    expect(names).toContain('readme.txt')
    expect(names).toContain('dot.svg')
    expect(names).toContain('guide.txt')
    const h5p = [...b.files.values()].find((f) => f.fileName === 'demo-text.h5p')
    expect(h5p?.component).toBe('mod_h5pactivity')
    expect(h5p?.fileArea).toBe('package')
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

describe('user-data flag', () => {
  test('reads users=1 as a backup that carries user-generated content', async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())
    const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate')
    const entries = unzipSync(bytes)
    const xml = entries['moodle_backup.xml']
    if (!xml) throw new Error('fixture has no moodle_backup.xml')
    entries['moodle_backup.xml'] = strToU8(
      strFromU8(xml).replace(
        '<setting><level>root</level><name>users</name><value>0</value></setting>',
        '<setting><level>root</level><name>users</name><value>1</value></setting>',
      ),
    )
    const b = await openBackup(new Blob([zipSync(entries)]))
    expect(b.includesUserData).toBe(true)
  })

  test('an activity-level setting named users does not flip the flag', async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())
    const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate')
    const entries = unzipSync(bytes)
    const xml = entries['moodle_backup.xml']
    if (!xml) throw new Error('fixture has no moodle_backup.xml')
    entries['moodle_backup.xml'] = strToU8(
      strFromU8(xml).replace(
        '</settings>',
        '<setting><level>activity</level><name>users</name><value>1</value></setting></settings>',
      ),
    )
    const b = await openBackup(new Blob([zipSync(entries)]))
    expect(b.includesUserData).toBe(false)
  })
})

describe('backup provenance', () => {
  async function withInformation(
    mutate: (xml: string) => string,
  ): Promise<Awaited<ReturnType<typeof openBackup>>> {
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())
    const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate')
    const entries = unzipSync(bytes)
    const xml = entries['moodle_backup.xml']
    if (!xml) throw new Error('fixture has no moodle_backup.xml')
    entries['moodle_backup.xml'] = strToU8(mutate(strFromU8(xml)))
    return await openBackup(new Blob([zipSync(entries)]))
  }

  test('a missing release reads as empty, never as a placeholder', async () => {
    const b = await withInformation((xml) =>
      xml.replace(/<moodle_release>[^<]*<\/moodle_release>/, ''),
    )
    expect(b.moodleRelease).toBe('')
  })

  test('a backup date that is not a positive number is absent', async () => {
    const garbage = await withInformation((xml) =>
      xml.replace('<backup_date>1700000000</backup_date>', '<backup_date>soon</backup_date>'),
    )
    expect(garbage.backupDate).toBeUndefined()
    const zero = await withInformation((xml) =>
      xml.replace('<backup_date>1700000000</backup_date>', '<backup_date>0</backup_date>'),
    )
    expect(zero.backupDate).toBeUndefined()
    const missing = await withInformation((xml) =>
      xml.replace('<backup_date>1700000000</backup_date>', ''),
    )
    expect(missing.backupDate).toBeUndefined()
  })
})

// PRDV103-2017-07-21 (REPO-004) opens with Moodle's unnamed section 0:
// section.xml names it $@NULL@$ and moodle_backup.xml titles it "0". Neither
// is a name, and both reached the sidebar as a heading.
describe('unnamed sections', () => {
  test('a NULL name and a number-as-title both resolve to no name', async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())
    const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate')
    const entries = unzipSync(bytes)
    const backup = entries['moodle_backup.xml']
    const section = entries['sections/section_2001/section.xml']
    if (!backup || !section) throw new Error('fixture is missing section 2001')
    entries['moodle_backup.xml'] = strToU8(
      strFromU8(backup).replace('<title>Introduction</title>', '<title>1</title>'),
    )
    entries['sections/section_2001/section.xml'] = strToU8(
      strFromU8(section).replace('<name>Introduction</name>', '<name>$@NULL@$</name>'),
    )
    const b = await openBackup(new Blob([zipSync(entries)]))
    expect(b.sections[0]?.name).toBe('')
    expect(b.sections[0]?.number).toBe(1)
  })

  test('a section genuinely named after its number keeps that name', async () => {
    // SMR_SOR names its sections "1".."6"; section.xml is the authority.
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())
    const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate')
    const entries = unzipSync(bytes)
    const section = entries['sections/section_2001/section.xml']
    if (!section) throw new Error('fixture is missing section 2001')
    entries['sections/section_2001/section.xml'] = strToU8(
      strFromU8(section).replace('<name>Introduction</name>', '<name>1</name>'),
    )
    const b = await openBackup(new Blob([zipSync(entries)]))
    expect(b.sections[0]?.name).toBe('1')
  })
})

// Moodle 4.5+ lets a module own a section. Verified against two real backups:
// Moodle's own mod_subsection test fixture and a Moodle 5.2.2 course built for
// this purpose. The section names its owner by *instance* id, which only the
// activity payload carries.
describe('delegated sections', () => {
  test('ordinary sections are not delegated', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    const plain = b.sections.filter((s) => s.number === 1 || s.number === 2)
    expect(plain).toHaveLength(2)
    expect(plain.every((s) => s.delegatedTo === undefined)).toBe(true)
  })

  test('a delegated section resolves to the course-module that owns it', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    const delegated = b.sections.find((s) => s.delegatedTo !== undefined)
    expect(delegated?.name).toBe('Demo subsection')
    expect(delegated?.delegatedTo?.component).toBe('mod_subsection')
    // <itemid> is the instance id (25); this resolves it to the cmid.
    expect(delegated?.delegatedTo?.activityId).toBe(3025)
    expect(delegated?.activityIds).toEqual([3026])
  })
})
