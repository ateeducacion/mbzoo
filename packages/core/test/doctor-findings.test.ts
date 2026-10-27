import { describe, expect, test } from 'bun:test'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { analyzeBackup, type DiagnosticReport } from '../src/index.ts'

const XML = '<?xml version="1.0" encoding="UTF-8"?>'

function zip(
  entries: Record<string, string | Uint8Array>,
  level: 0 | 6 = 6,
): Uint8Array<ArrayBuffer> {
  const files: Record<string, Uint8Array> = {}
  for (const [name, value] of Object.entries(entries)) {
    files[name] = typeof value === 'string' ? strToU8(value) : value
  }
  return new Uint8Array(zipSync(files, { level }))
}

function manifest(options: { users?: string; files?: string; activities?: string }): string {
  return `${XML}
<moodle_backup><information>
  <name>Demo</name>
  <moodle_version>2024100700</moodle_version>
  <moodle_release>4.5</moodle_release>
  <backup_version>2024100700</backup_version>
  <backup_release>4.5</backup_release>
  <backup_date>1700000000</backup_date>
  <contents>
    <course><courseid>1</courseid><title>Demo course</title><directory>course</directory></course>
    <sections><section><sectionid>10</sectionid><title>Topic</title><directory>sections/section_10</directory></section></sections>
    <activities>${options.activities ?? ''}</activities>
  </contents>
  <settings>
    <setting><level>root</level><name>users</name><value>${options.users ?? '0'}</value></setting>
    <setting><level>root</level><name>files</name><value>${options.files ?? '1'}</value></setting>
  </settings>
</information></moodle_backup>`
}

const sectionXml = `${XML}<section id="10"><number>1</number><name>Topic</name><sequence></sequence></section>`

function base(
  extra: Record<string, string | Uint8Array> = {},
): Record<string, string | Uint8Array> {
  return {
    'moodle_backup.xml': manifest({}),
    'sections/section_10/section.xml': sectionXml,
    ...extra,
  }
}

async function sha1(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new Uint8Array(bytes))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function filesXml(records: { hash: string; name: string; component?: string; size: number }[]) {
  const body = records
    .map(
      (r, i) =>
        `<file id="${i + 1}"><contenthash>${r.hash}</contenthash><contextid>1</contextid><component>${r.component ?? 'mod_page'}</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>${r.name}</filename><filesize>${r.size}</filesize><mimetype>text/plain</mimetype></file>`,
    )
    .join('')
  return `${XML}<files>${body}</files>`
}

function rules(report: DiagnosticReport): string[] {
  return report.findings.map((finding) => finding.ruleId)
}

function finding(report: DiagnosticReport, ruleId: string) {
  return report.findings.find((f) => f.ruleId === ruleId)
}

describe('analyzeBackup archive checks', () => {
  test('reports a stored entry whose bytes no longer match the ZIP CRC', async () => {
    const bytes = zip(base({ 'course/notes.txt': 'checksum-target' }), 0)
    const marker = strToU8('checksum-target')
    const at = indexOf(bytes, marker)
    expect(at).toBeGreaterThan(0)
    bytes[at] = 'C'.charCodeAt(0)
    const report = await analyzeBackup(new Blob([bytes]), { filename: 'course.mbz' })
    const crc = finding(report, 'archive.crc')
    expect(crc?.params).toEqual({ count: 1 })
    expect(crc?.evidence[0]?.entry).toBe('course/notes.txt')
  })

  test('flags a highly compressed large entry as a possible archive bomb', async () => {
    const report = await analyzeBackup(
      new Blob([zip(base({ 'course/zeros.bin': new Uint8Array(8 * 1024 * 1024) }))]),
      { filename: 'course.mbz' },
    )
    const ratio = finding(report, 'archive.ratio')
    expect(ratio?.params).toEqual({ count: 1 })
    expect(ratio?.evidence[0]?.entry).toBe('course/zeros.bin')
  })

  test('a small, well-compressed entry is not a ratio finding', async () => {
    const report = await analyzeBackup(
      new Blob([zip(base({ 'course/zeros.bin': new Uint8Array(64 * 1024) }))]),
      { filename: 'course.mbz' },
    )
    expect(rules(report)).not.toContain('archive.ratio')
  })

  test('reports duplicate names and bad header checksums in a TAR.GZ backup', async () => {
    const tar = tarArchive([
      { name: 'moodle_backup.xml', data: manifest({}) },
      { name: 'sections/section_10/section.xml', data: sectionXml },
      { name: 'course/a.txt', data: 'one' },
      { name: 'course/a.txt', data: 'two' },
      { name: 'course/b.txt', data: 'three', corruptChecksum: true },
    ])
    const report = await analyzeBackup(new Blob([gzipSync(tar)]), { filename: 'course.mbz' })
    expect(finding(report, 'archive.duplicate-path')?.evidence).toEqual([
      { detail: 'course/a.txt' },
    ])
    expect(finding(report, 'archive.checksum')?.evidence).toEqual([{ detail: 'course/b.txt' }])
  })
})

describe('analyzeBackup XML checks', () => {
  test('stops after a manifest that is not well formed', async () => {
    const report = await analyzeBackup(
      new Blob([zip({ 'moodle_backup.xml': `${XML}<moodle_backup><information>` })]),
      { filename: 'course.mbz' },
    )
    const malformed = finding(report, 'xml.malformed')
    expect(malformed?.id).toBe('xml.malformed:moodle_backup.xml')
    expect(rules(report)).not.toContain('sections.missing')
  })

  test('a malformed section is reported and the scan carries on', async () => {
    const report = await analyzeBackup(
      new Blob([zip(base({ 'sections/section_10/section.xml': `${XML}<section id="10">` }))]),
      { filename: 'course.mbz' },
    )
    expect(report.findings.map((f) => f.id)).toContain(
      'xml.malformed:sections/section_10/section.xml',
    )
  })

  test('an XML entry over the hash budget is not read', async () => {
    const padded = `${XML}<section id="10"><!--${'x'.repeat(6000)}--><number>1</number></section>`
    const report = await analyzeBackup(
      new Blob([zip(base({ 'sections/section_10/section.xml': padded }))]),
      { filename: 'course.mbz', hashBudgetBytes: 5000 },
    )
    const limit = report.findings.find((f) => f.id === 'xml.limit:sections/section_10/section.xml')
    expect(limit?.evidence[0]?.entry).toBe('sections/section_10/section.xml')
  })

  test('a users.xml that cannot be parsed is reported', async () => {
    const report = await analyzeBackup(
      new Blob([
        zip({
          ...base(),
          'moodle_backup.xml': manifest({ users: '1' }),
          'users.xml': `${XML}<users><user id="1">`,
        }),
      ]),
      { filename: 'course.mbz' },
    )
    expect(rules(report)).toContain('userdata.malformed')
    expect(rules(report)).not.toContain('userdata.missing')
  })

  test('a well-formed users.xml is accepted', async () => {
    const report = await analyzeBackup(
      new Blob([
        zip({
          ...base(),
          'moodle_backup.xml': manifest({ users: '1' }),
          'users.xml': `${XML}<users><user id="1"><username>a</username></user></users>`,
        }),
      ]),
      { filename: 'course.mbz' },
    )
    expect(rules(report)).not.toContain('userdata.malformed')
  })

  test('a malformed files.xml is reported', async () => {
    const report = await analyzeBackup(
      new Blob([zip(base({ 'files.xml': `${XML}<files><file id="1">` }))]),
      { filename: 'course.mbz' },
    )
    expect(report.findings.map((f) => f.id)).toContain('xml.malformed:files.xml')
  })
})

describe('analyzeBackup file pool checks', () => {
  test('skips hashing a file over the budget and names it', async () => {
    const big = new Uint8Array(6000).fill(65)
    const hash = await sha1(big)
    const report = await analyzeBackup(
      new Blob([
        zip(
          base({
            'files.xml': filesXml([{ hash, name: 'big.txt', size: big.length }]),
            [`files/${hash.slice(0, 2)}/${hash}`]: big,
          }),
        ),
      ]),
      { filename: 'course.mbz', hashBudgetBytes: 5000 },
    )
    const skipped = finding(report, 'files.hash-skipped')
    expect(skipped?.params).toEqual({ count: 1 })
    expect(skipped?.evidence[0]?.detail).toBe(`files/${hash.slice(0, 2)}/${hash}`)
  })

  test('reports pool files that no files.xml record points at', async () => {
    const used = strToU8('used')
    const orphan = strToU8('orphan')
    const usedHash = await sha1(used)
    const orphanHash = await sha1(orphan)
    const report = await analyzeBackup(
      new Blob([
        zip(
          base({
            'files.xml': filesXml([{ hash: usedHash, name: 'used.txt', size: used.length }]),
            [`files/${usedHash.slice(0, 2)}/${usedHash}`]: used,
            [`files/${orphanHash.slice(0, 2)}/${orphanHash}`]: orphan,
          }),
        ),
      ]),
      { filename: 'course.mbz' },
    )
    const unreferenced = finding(report, 'files.unreferenced')
    expect(unreferenced?.params).toEqual({ count: 1 })
    expect(unreferenced?.evidence[0]?.entry).toBe(`files/${orphanHash.slice(0, 2)}/${orphanHash}`)
  })

  test('a package activity without its package bytes is reported', async () => {
    const report = await analyzeBackup(
      new Blob([
        zip({
          ...base(),
          'moodle_backup.xml': manifest({
            activities: `<activity><moduleid>30</moduleid><sectionid>10</sectionid><modulename>scorm</modulename><title>Pkg</title><directory>activities/scorm_30</directory></activity>`,
          }),
          'sections/section_10/section.xml': `${XML}<section id="10"><number>1</number><name>Topic</name><sequence>30</sequence></section>`,
          'activities/scorm_30/module.xml': `${XML}<module id="30" version="2024100700"><modulename>scorm</modulename><sectionid>10</sectionid></module>`,
          'activities/scorm_30/scorm.xml': `${XML}<activity id="1" moduleid="30" modulename="scorm" contextid="5"><scorm id="1"><name>Pkg</name></scorm></activity>`,
        }),
      ]),
      { filename: 'course.mbz' },
    )
    const pkg = report.findings.find((f) => f.id === 'embedded.package:30')
    expect(pkg?.activityId).toBe(30)
  })

  test('package findings are suppressed when the backup excludes files', async () => {
    const report = await analyzeBackup(
      new Blob([
        zip({
          ...base(),
          'moodle_backup.xml': manifest({
            files: '0',
            activities: `<activity><moduleid>30</moduleid><sectionid>10</sectionid><modulename>h5pactivity</modulename><title>Pkg</title></activity>`,
          }),
        }),
      ]),
      { filename: 'course.mbz' },
    )
    expect(rules(report)).not.toContain('embedded.package')
  })
})

describe('analyzeBackup reference checks', () => {
  test('reports a link token that points at an activity not in the backup', async () => {
    const report = await analyzeBackup(
      new Blob([
        zip(
          base({
            'course/course.xml': `${XML}<course><fullname>Demo</fullname><summary>See $@PAGEVIEWBYID*999@$ and $@PAGEVIEWBYID*999@$ and $@NULL@$</summary></course>`,
          }),
        ),
      ]),
      { filename: 'course.mbz' },
    )
    const token = finding(report, 'references.token')
    expect(token?.params).toEqual({ count: 1 })
    expect(token?.evidence[0]?.entry).toBe('course/course.xml')
  })

  test('a link token to an activity in the backup is fine', async () => {
    const report = await analyzeBackup(
      new Blob([
        zip({
          ...base(),
          'moodle_backup.xml': manifest({
            activities: `<activity><moduleid>20</moduleid><sectionid>10</sectionid><modulename>page</modulename><title>P</title><directory>activities/page_20</directory></activity>`,
          }),
          'activities/page_20/module.xml': `${XML}<module id="20" version="2024100700"><modulename>page</modulename><sectionid>10</sectionid></module>`,
          'course/course.xml': `${XML}<course><summary>$@PAGEVIEWBYID*20@$</summary></course>`,
        }),
      ]),
      { filename: 'course.mbz' },
    )
    expect(rules(report)).not.toContain('references.token')
  })
})

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

function tarArchive(
  entries: Array<{ name: string; data: string; corruptChecksum?: boolean }>,
): Uint8Array {
  const blocks: Uint8Array[] = []
  const enc = new TextEncoder()
  for (const entry of entries) {
    const data = enc.encode(entry.data)
    const header = new Uint8Array(512)
    header.set(enc.encode(entry.name).slice(0, 100), 0)
    header.set(enc.encode('0000644\0'), 100)
    header.set(enc.encode('0000000\0'), 108)
    header.set(enc.encode('0000000\0'), 116)
    header.set(enc.encode(`${data.length.toString(8).padStart(11, '0')}\0`), 124)
    header[156] = 0x30
    header.set(enc.encode('ustar\0'), 257)
    header.set(enc.encode('00'), 263)
    header.set(enc.encode('        '), 148)
    let sum = 0
    for (const byte of header) sum += byte
    if (entry.corruptChecksum) sum += 1
    header.set(enc.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148)
    blocks.push(header, data)
    const pad = (512 - (data.length % 512)) % 512
    if (pad > 0) blocks.push(new Uint8Array(pad))
  }
  blocks.push(new Uint8Array(1024))
  const total = blocks.reduce((sum, block) => sum + block.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const block of blocks) {
    out.set(block, offset)
    offset += block.byteLength
  }
  return out
}
