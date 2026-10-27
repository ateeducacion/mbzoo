import { describe, expect, test } from 'bun:test'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { rewriteArchive } from '../src/archive/rewrite.ts'
import { sameBytes, sha1Hex } from '../src/doctor/bytes.ts'
import { EMPTY_QUESTIONS_XML, EMPTY_ROLES_XML } from '../src/doctor/restore.ts'
import {
  analyzeBackup,
  applyRepairs,
  inspect,
  LazyZipReader,
  reportJson,
  TarGzReader,
} from '../src/index.ts'

const XML = '<?xml version="1.0" encoding="UTF-8"?>'

function zip(entries: Record<string, string | Uint8Array>): Blob {
  const files: Record<string, Uint8Array> = {}
  for (const [name, value] of Object.entries(entries)) {
    files[name] = typeof value === 'string' ? strToU8(value) : value
  }
  return new Blob([zipSync(files)])
}

function manifest(options: {
  release?: string
  version?: string
  activities?: string
  files?: string
  users?: string
}): string {
  const release = options.release ?? '4.5'
  const version = options.version ?? '2024100700'
  return `${XML}
<moodle_backup><information>
  <name>Demo</name>
  <moodle_version>${version}</moodle_version>
  <moodle_release>${release}</moodle_release>
  <backup_version>${version}</backup_version>
  <backup_release>${release}</backup_release>
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

const sectionXml = `${XML}<section id="10"><number>1</number><name>Topic</name></section>`
const courseXml = `${XML}<course><fullname>Demo course</fullname><shortname>demo</shortname></course>`

function base(
  extra: Record<string, string | Uint8Array> = {},
): Record<string, string | Uint8Array> {
  return {
    'moodle_backup.xml': manifest({}),
    'course/course.xml': courseXml,
    'sections/section_10/section.xml': sectionXml,
    'roles.xml': EMPTY_ROLES_XML,
    'questions.xml': EMPTY_QUESTIONS_XML,
    ...extra,
  }
}

function wrap(
  prefix: string,
  entries: Record<string, string | Uint8Array>,
): Record<string, string | Uint8Array> {
  const wrapped: Record<string, string | Uint8Array> = {}
  for (const [name, value] of Object.entries(entries)) wrapped[`${prefix}${name}`] = value
  return wrapped
}

function tarArchive(entries: Array<{ name: string; data: string | Uint8Array }>): Uint8Array {
  const blocks: Uint8Array[] = []
  const enc = new TextEncoder()
  for (const entry of entries) {
    const data = typeof entry.data === 'string' ? enc.encode(entry.data) : entry.data
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

function tarBlob(entries: Record<string, string | Uint8Array>): Blob {
  return new Blob([
    gzipSync(tarArchive(Object.entries(entries).map(([name, data]) => ({ name, data })))),
  ])
}

async function namesOf(blob: Blob): Promise<string[]> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const reader = head[0] === 0x1f ? await TarGzReader.open(blob) : await LazyZipReader.open(blob)
  try {
    return (await reader.listEntries()).map((entry) => entry.name)
  } finally {
    await reader.close()
  }
}

async function entryOf(blob: Blob, name: string): Promise<Uint8Array> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const reader = head[0] === 0x1f ? await TarGzReader.open(blob) : await LazyZipReader.open(blob)
  try {
    return await reader.readEntry(name)
  } finally {
    await reader.close()
  }
}

function filesXml(hash: string, extra = ''): string {
  return `${XML}<files>
    <file id="1"><contenthash>${hash}</contenthash><contextid>15</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>note.txt</filename><filesize>4</filesize><mimetype>text/plain</mimetype></file>
    ${extra}
  </files>`
}

describe('archive unwrap', () => {
  test('unwraps one directory in ZIP and TAR.GZ and leaves the original untouched', async () => {
    const plugin = strToU8('plugin-bytes')
    const binary = new Uint8Array(256 * 1024)
    for (let i = 0; i < binary.length; i++) binary[i] = i % 251
    const entries = base({
      'activities/local_foo_3/foo.xml': plugin,
      'files/kept.bin': binary,
    })
    for (const source of [zip(wrap('my-course/', entries)), tarBlob(wrap('my-course/', entries))]) {
      const before = new Uint8Array(await source.arrayBuffer())
      const report = await inspect(source, { filename: 'course.mbz' })
      const finding = report.report.findings.find((item) => item.ruleId === 'archive.unwrap-root')
      expect(finding?.repair?.safety).toBe('automatic')
      expect(finding?.repair?.contentLoss).toBe(false)
      expect(report.report.findings.some((item) => item.ruleId === 'archive.enclosed')).toBe(false)
      const outcome = await applyRepairs(source, [finding?.id ?? ''], { filename: 'course.mbz' })
      expect(outcome.after.moodleRestoreVerified).toBe(false)
      expect(outcome.note).toContain('has not been verified')
      const after = new Uint8Array(await source.arrayBuffer())
      expect(sameBytes(before, after)).toBe(true)
      const names = await namesOf(outcome.blob)
      expect(names).toContain('moodle_backup.xml')
      expect(names.some((name) => name.startsWith('my-course/'))).toBe(false)
      expect(names).toContain('activities/local_foo_3/foo.xml')
      const reopened = await analyzeBackup(outcome.blob, { filename: 'course.mbz' })
      expect(reopened.findings.some((item) => item.ruleId === 'archive.unwrap-root')).toBe(false)
      expect(reopened.findings.some((item) => item.ruleId === 'archive.enclosed')).toBe(false)
      const text = new TextDecoder().decode(await entryOf(outcome.blob, 'moodle_backup.xml'))
      expect(text).toContain('<moodle_release>4.5</moodle_release>')
      expect(text).toContain('<backup_version>2024100700</backup_version>')
    }
    const zipOnly = zip(wrap('my-course/', entries))
    const repaired = await applyRepairs(
      zipOnly,
      [
        (await inspect(zipOnly, { filename: 'course.mbz' })).report.findings.find(
          (item) => item.id === 'archive.unwrap-root',
        )?.id ?? '',
      ],
      { filename: 'course.mbz' },
    )
    expect(sameBytes(await entryOf(repaired.blob, 'activities/local_foo_3/foo.xml'), plugin)).toBe(
      true,
    )
    expect(sameBytes(await entryOf(repaired.blob, 'files/kept.bin'), binary)).toBe(true)
    await expect(
      applyRepairs(repaired.blob, ['archive.unwrap-root'], { filename: 'course.mbz' }),
    ).rejects.toThrow(/not available/)
  })

  test('previews a long unwrap with a sample and a count of the rest', async () => {
    const extra: Record<string, string> = {}
    for (let i = 0; i < 12; i++) extra[`course/extra_${i}.txt`] = `${i}`
    const report = await inspect(zip(wrap('my-course/', base(extra))), { filename: 'course.mbz' })
    const repair = report.report.findings.find(
      (item) => item.ruleId === 'archive.unwrap-root',
    )?.repair
    expect(repair?.entries).toHaveLength(8)
    expect(repair?.preview.at(-1)).toEqual({
      entry: 'my-course/',
      before: '9 further paths stay under my-course/',
      after: '9 further paths move with the same suffix',
    })
  })

  test('unwraps two nested directories in one step', async () => {
    const source = zip(wrap('outer/inner/', base()))
    const outcome = await applyRepairs(source, ['archive.unwrap-root'], { filename: 'course.mbz' })
    expect(await namesOf(outcome.blob)).toContain('moodle_backup.xml')
    expect((await namesOf(outcome.blob)).some((name) => name.startsWith('outer/'))).toBe(false)
  })

  test('does not unwrap an already-correct root, several manifests, outside files, or a dot segment', async () => {
    const correct = await analyzeBackup(zip(base()), { filename: 'course.mbz' })
    expect(correct.findings.some((item) => item.ruleId === 'archive.unwrap-root')).toBe(false)
    expect(correct.findings.some((item) => item.ruleId === 'archive.enclosed')).toBe(false)

    const many = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({}),
        'other/moodle_backup.xml': manifest({}),
      }),
      { filename: 'course.mbz' },
    )
    expect(many.findings.some((item) => item.ruleId === 'archive.multiple-roots')).toBe(true)
    expect(many.findings.some((item) => item.ruleId === 'archive.unwrap-root')).toBe(false)

    const outside = await analyzeBackup(
      zip({ ...wrap('my-course/', base()), 'readme.txt': 'outside' }),
      { filename: 'course.mbz' },
    )
    expect(outside.findings.some((item) => item.ruleId === 'archive.enclosed')).toBe(true)
    expect(outside.findings.some((item) => item.ruleId === 'archive.unwrap-root')).toBe(false)

    const dotted = await analyzeBackup(
      zip({ 'wrapper/./moodle_backup.xml': manifest({ activities: '' }) }),
      { filename: 'course.mbz' },
    )
    expect(dotted.findings.some((item) => item.ruleId === 'archive.unwrap-root')).toBe(false)

    const unsafe = await analyzeBackup(zip({ ...wrap('my-course/', base()), '../evil.txt': 'x' }), {
      filename: 'course.mbz',
    })
    expect(unsafe.findings.some((item) => item.ruleId === 'archive.unsafe-path')).toBe(true)
    expect(unsafe.findings.some((item) => item.ruleId === 'archive.unwrap-root')).toBe(false)
  })

  test('refuses colliding or unsafe output paths before writing', async () => {
    const source = zip({ 'a.txt': 'a', 'b.txt': 'b' })
    await expect(
      rewriteArchive(source, {
        renames: new Map([
          ['a.txt', 'c.txt'],
          ['b.txt', 'c.txt'],
        ]),
      }),
    ).rejects.toThrow(/collides/)
    await expect(rewriteArchive(source, { renames: new Map([['a.txt', '../x']]) })).rejects.toThrow(
      /Refusing archive output path/,
    )
    await expect(
      rewriteArchive(source, { additions: new Map([['a.txt', strToU8('no')]]) }),
    ).rejects.toThrow(/collides/)
    await expect(rewriteArchive(source, { omit: new Set(['a.txt']) })).rejects.toThrow(/non-empty/)
  })
})

describe('empty roles.xml and questions.xml', () => {
  test('offers an empty roles document only when no role id is required', async () => {
    const entries = base()
    delete entries['roles.xml']
    const open = await inspect(zip(entries), { filename: 'course.mbz' })
    const finding = open.report.findings.find((item) => item.id === 'metadata.create-empty-roles')
    expect(finding?.repairability).toBe('confirmation-required')
    expect(finding?.repair?.safety).toBe('confirmation-required')
    expect(finding?.repair?.contentLoss).toBe(false)
    expect(finding?.repair?.why).toContain('TASK-017')
    expect(finding?.repair?.why).toContain('missing_roles_xml_file')
    expect(
      open.report.findings.some(
        (item) => item.repair?.safety === 'automatic' && item.id === 'metadata.create-empty-roles',
      ),
    ).toBe(false)
    await expect(
      applyRepairs(zip(entries), ['metadata.create-empty-roles'], { filename: 'course.mbz' }),
    ).rejects.toThrow(/confirmation/)
    const outcome = await applyRepairs(zip(entries), ['metadata.create-empty-roles'], {
      filename: 'course.mbz',
      confirmed: true,
    })
    const roles = new TextDecoder().decode(await entryOf(outcome.blob, 'roles.xml'))
    expect(roles).toContain('<roles_definition>')
    expect(roles).not.toContain('<roles>')
    expect(outcome.after.moodleRestoreVerified).toBe(false)
    expect(outcome.after.findings.some((item) => item.ruleId === 'metadata.missing-roles')).toBe(
      false,
    )
    const course = await entryOf(outcome.blob, 'course/course.xml')
    expect(sameBytes(course, strToU8(courseXml))).toBe(true)

    const referenced = base()
    delete referenced['roles.xml']
    referenced['activities/page_4/inforef.xml'] =
      `${XML}<inforef><roleref><role><id>5</id></role></roleref></inforef>`
    const blocked = await inspect(zip(referenced), { filename: 'course.mbz' })
    expect(
      blocked.report.findings.find((item) => item.ruleId === 'metadata.missing-roles')?.repair,
    ).toBeUndefined()
    expect(blocked.archiveEdits.some((step) => step.id === 'metadata.create-empty-roles')).toBe(
      false,
    )
  })

  test('offers an empty question bank only when nothing references it', async () => {
    const entries = base({
      'activities/lesson_8/lesson.xml': `${XML}<activity><page><answers><answer>Stay</answer></answers></page></activity>`,
    })
    delete entries['questions.xml']
    const open = await inspect(zip(entries), { filename: 'course.mbz' })
    const finding = open.report.findings.find((item) => item.id === 'questions.create-empty-bank')
    expect(finding?.repair?.safety).toBe('confirmation-required')
    expect(finding?.repair?.contentLoss).toBe(false)
    const outcome = await applyRepairs(zip(entries), ['questions.create-empty-bank'], {
      filename: 'course.mbz',
      confirmed: true,
    })
    const questions = new TextDecoder().decode(await entryOf(outcome.blob, 'questions.xml'))
    expect(questions).toContain('<question_categories>')
    expect(questions).not.toContain('<question_bank_entry>')
    expect(
      outcome.after.findings.some((item) => item.ruleId === 'questions.missing-bank-file'),
    ).toBe(false)

    const referenced = base({
      'activities/quiz_20/quiz.xml': `${XML}<activity><question_instance><question_reference><questionbankentryid>51</questionbankentryid></question_reference></question_instance></activity>`,
    })
    delete referenced['questions.xml']
    const blocked = await inspect(zip(referenced), { filename: 'course.mbz' })
    expect(
      blocked.report.findings.find((item) => item.ruleId === 'questions.missing-bank-file')
        ?.repairability,
    ).toBe('not-repairable')
    expect(blocked.archiveEdits.some((step) => step.id === 'questions.create-empty-bank')).toBe(
      false,
    )

    const plugin = base()
    delete plugin['questions.xml']
    plugin['activities/local_foo_3/foo.xml'] =
      `${XML}<activity><question id="9"><qtype>local</qtype></question></activity>`
    const unknown = await inspect(zip(plugin), { filename: 'course.mbz' })
    expect(unknown.archiveEdits.some((step) => step.id === 'questions.create-empty-bank')).toBe(
      false,
    )
  })

  test('does not replace a roles.xml whose root is not roles_definition', async () => {
    const source = zip(
      base({ 'roles.xml': `${XML}<roles><role><shortname>student</shortname></role></roles>` }),
    )
    const report = await inspect(source, { filename: 'course.mbz' })
    expect(
      report.report.findings.find((item) => item.id === 'metadata.missing-roles')?.repairability,
    ).toBe('manual')
    expect(report.archiveEdits.some((step) => step.id === 'metadata.create-empty-roles')).toBe(
      false,
    )
  })

  test('does not replace a questions.xml whose root is not question_categories', async () => {
    const source = zip(base({ 'questions.xml': `${XML}<questions><question id="1"/></questions>` }))
    const report = await inspect(source, { filename: 'course.mbz' })
    const finding = report.report.findings.find((item) => item.id === 'questions.missing-bank-file')
    expect(finding?.repairability).toBe('manual')
    expect(finding?.evidence[0]?.entry).toBe('questions.xml')
    expect(report.archiveEdits.some((step) => step.id === 'questions.create-empty-bank')).toBe(
      false,
    )
  })
})

describe('misplaced file payloads', () => {
  test('copies a verified payload to the canonical path and keeps the original', async () => {
    const bytes = strToU8('note')
    const hash = await sha1Hex(bytes)
    const wrongPrefix = `files/ff/${hash}`
    const unrelated = 'lost/note.txt'
    const source = zip(
      base({
        'files.xml': filesXml(hash),
        [unrelated]: bytes,
        'activities/page_4/module.xml': `${XML}<module id="4" contextid="15"><modulename>page</modulename></module>`,
      }),
    )
    const open = await inspect(source, { filename: 'course.mbz' })
    const finding = open.report.findings.find((item) => item.id === `files.recover:${hash}`)
    expect(finding?.repair?.safety).toBe('automatic')
    expect(finding?.repair?.preview[0]?.before).toBe('(not in the archive)')
    expect(open.report.findings.some((item) => item.ruleId === 'files.missing')).toBe(false)
    const outcome = await applyRepairs(source, [`files.recover:${hash}`], {
      filename: 'course.mbz',
    })
    const canonical = `files/${hash.slice(0, 2)}/${hash}`
    expect(sameBytes(await entryOf(outcome.blob, canonical), bytes)).toBe(true)
    expect(sameBytes(await entryOf(outcome.blob, unrelated), bytes)).toBe(true)
    expect(sameBytes(await entryOf(outcome.blob, 'files.xml'), strToU8(filesXml(hash)))).toBe(true)
    const filesText = new TextDecoder().decode(await entryOf(outcome.blob, 'files.xml'))
    expect(filesText).toContain(hash)
    expect(outcome.after.findings.some((item) => item.id === `files.recover:${hash}`)).toBe(false)
    expect(wrongPrefix).not.toBe(canonical)

    const prefixed = zip(base({ 'files.xml': filesXml(hash), [wrongPrefix]: bytes }))
    const moved = await applyRepairs(prefixed, [`files.recover:${hash}`], {
      filename: 'course.mbz',
    })
    expect(sameBytes(await entryOf(moved.blob, canonical), bytes)).toBe(true)
    expect(await namesOf(moved.blob)).toContain(wrongPrefix)
  })

  test('blocks a hash mismatch, an existing canonical file, aliases, and directory records', async () => {
    const bytes = strToU8('note')
    const hash = await sha1Hex(bytes)
    const wrong = await analyzeBackup(
      zip(base({ 'files.xml': filesXml(hash), 'lost/note.txt': strToU8('nope') })),
      { filename: 'course.mbz' },
    )
    expect(wrong.findings.some((item) => item.ruleId === 'files.recover-misplaced-content')).toBe(
      false,
    )
    expect(wrong.findings.some((item) => item.ruleId === 'files.missing')).toBe(true)

    const canonical = `files/${hash.slice(0, 2)}/${hash}`
    const present = await analyzeBackup(
      zip(base({ 'files.xml': filesXml(hash), [canonical]: bytes, 'lost/note.txt': bytes })),
      { filename: 'course.mbz' },
    )
    expect(present.findings.some((item) => item.ruleId === 'files.recover-misplaced-content')).toBe(
      false,
    )

    const alias = await analyzeBackup(
      zip(
        base({
          'files.xml': `${XML}<files><file id="9"><contenthash>${hash}</contenthash><contextid>15</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>remote.txt</filename><filesize>4</filesize><repositoryid>8</repositoryid></file></files>`,
        }),
      ),
      { filename: 'course.mbz' },
    )
    expect(alias.findings.some((item) => item.ruleId === 'files.missing')).toBe(false)
    expect(alias.findings.some((item) => item.ruleId === 'files.recover-misplaced-content')).toBe(
      false,
    )

    const directory = await analyzeBackup(
      zip(
        base({
          'files.xml': `${XML}<files><file id="2"><contenthash>${hash}</contenthash><contextid>15</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/dir/</filepath><filename>.</filename><filesize>0</filesize></file></files>`,
        }),
      ),
      { filename: 'course.mbz' },
    )
    expect(directory.findings.some((item) => item.ruleId === 'files.missing')).toBe(false)
    expect(
      directory.findings.some((item) => item.ruleId === 'files.recover-misplaced-content'),
    ).toBe(false)
  })

  test('adds one canonical copy when several records share a hash or several entries match', async () => {
    const bytes = strToU8('note')
    const hash = await sha1Hex(bytes)
    const second = `${XML}<files>
      <file id="1"><contenthash>${hash}</contenthash><contextid>15</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>a.txt</filename><filesize>4</filesize></file>
      <file id="2"><contenthash>${hash}</contenthash><contextid>15</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>b.txt</filename><filesize>4</filesize></file>
    </files>`
    const source = zip(base({ 'files.xml': second, 'lost/a.txt': bytes, 'lost/b.txt': bytes }))
    const outcome = await applyRepairs(source, [`files.recover:${hash}`], {
      filename: 'course.mbz',
    })
    const names = await namesOf(outcome.blob)
    expect(names.filter((name) => name.endsWith(hash))).toHaveLength(1)
    expect(names).toContain('lost/a.txt')
    expect(names).toContain('lost/b.txt')
  })

  test('reports an oversized candidate as not searched', async () => {
    const bytes = new Uint8Array(4000)
    bytes.fill(7)
    const hash = await sha1Hex(bytes)
    const report = await analyzeBackup(
      zip(base({ 'files.xml': filesXml(hash), 'lost/big.bin': bytes })),
      { filename: 'course.mbz', hashBudgetBytes: 1500 },
    )
    expect(report.findings.some((item) => item.ruleId === 'files.recovery-incomplete')).toBe(true)
    expect(report.findings.some((item) => item.ruleId === 'files.missing')).toBe(false)
    expect(report.findings.some((item) => item.ruleId === 'files.recover-misplaced-content')).toBe(
      false,
    )
  })
})

describe('restore diagnostics', () => {
  test('reports multiple top-level categories only inside the Moodle version gate', async () => {
    const bank = (release: string, version: string) =>
      zip({
        'moodle_backup.xml': manifest({ release, version }),
        'course/course.xml': courseXml,
        'sections/section_10/section.xml': sectionXml,
        'roles.xml': EMPTY_ROLES_XML,
        'questions.xml': `${XML}<question_categories>
          <question_category id="5"><contextid>99</contextid><parent>0</parent></question_category>
          <question_category id="6"><contextid>99</contextid><parent>0</parent></question_category>
          <question_category id="7"><contextid>99</contextid><parent>5</parent></question_category>
        </question_categories>`,
      })
    const modern = await inspect(bank('4.5', '2024100700'), { filename: 'course.mbz' })
    const finding = modern.report.findings.find(
      (item) => item.ruleId === 'questions.multiple-top-categories',
    )
    expect(finding?.repair).toBeUndefined()
    expect(finding?.repairability).toBe('manual')
    expect(finding?.evidence.some((item) => item.detail.includes('Category 5'))).toBe(true)
    expect(modern.steps.some((step) => step.id.includes('multiple-top'))).toBe(false)
    expect(modern.archiveEdits.some((step) => step.id.includes('multiple-top'))).toBe(false)

    const oldRelease = await analyzeBackup(bank('3.4', '2017111300'), { filename: 'course.mbz' })
    expect(
      oldRelease.findings.some((item) => item.ruleId === 'questions.multiple-top-categories'),
    ).toBe(false)
    const oldStamp = await analyzeBackup(bank('4.5', '2018020500'), { filename: 'course.mbz' })
    expect(
      oldStamp.findings.some((item) => item.ruleId === 'questions.multiple-top-categories'),
    ).toBe(false)
    const questions = `${XML}<question_categories>
          <question_category id="5"><contextid>99</contextid><parent>0</parent></question_category>
          <question_category id="6"><contextid>99</contextid><parent>0</parent></question_category>
        </question_categories>`
    const withManifest = (xml: string) =>
      analyzeBackup(
        zip({
          'moodle_backup.xml': xml,
          'course/course.xml': courseXml,
          'sections/section_10/section.xml': sectionXml,
          'roles.xml': EMPTY_ROLES_XML,
          'questions.xml': questions,
        }),
        { filename: 'course.mbz' },
      )
    const missingBackupVersion = await withManifest(
      manifest({ release: '3.5', version: '2018051700' }).replace(
        '<backup_version>2018051700</backup_version>',
        '<backup_version></backup_version>',
      ),
    )
    expect(
      missingBackupVersion.findings.some(
        (item) => item.ruleId === 'questions.multiple-top-categories',
      ),
    ).toBe(true)
    const oldMoodleVersion = await withManifest(
      manifest({ release: '4.5', version: '2024100700' }).replace(
        '<moodle_version>2024100700</moodle_version>',
        '<moodle_version>2017111300</moodle_version>',
      ),
    )
    expect(
      oldMoodleVersion.findings.some((item) => item.ruleId === 'questions.multiple-top-categories'),
    ).toBe(false)
    const missingRelease = await withManifest(
      manifest({ release: '4.5', version: '2024100700' }).replace(
        '<backup_release>4.5</backup_release>',
        '<backup_release></backup_release>',
      ),
    )
    expect(
      missingRelease.findings.some((item) => item.ruleId === 'questions.multiple-top-categories'),
    ).toBe(false)
  })

  test('keeps legacy attempt problems diagnostic and does not flag ordinary questions', async () => {
    const attempt = `${XML}<activity id="20" moduleid="20">
      <states><state><question>70</question><answer>kept</answer></state><state><question>99</question></state></states>
      <sessions><session><questionid>99</questionid></session></sessions>
    </activity>`
    const source = zip(
      base({
        'questions.xml': `${XML}<question_categories><question_category id="5"><contextid>99</contextid><parent>0</parent>
          <questions><question id="70"><qtype>shortanswer</qtype><questiontext>Kept</questiontext></question></questions>
        </question_category></question_categories>`,
        'activities/quiz_20/quiz.xml': attempt,
      }),
    )
    const report = await inspect(source, { filename: 'course.mbz' })
    const missing = report.report.findings.find(
      (item) => item.id === 'questions.attempt-missing-question:99',
    )
    const data = report.report.findings.find(
      (item) => item.id === 'questions.attempt-data-missing:70',
    )
    expect(missing?.repair).toBeUndefined()
    expect(missing?.repairability).toBe('not-repairable')
    expect(data?.repair).toBeUndefined()
    expect(report.steps.some((step) => step.id.includes('attempt'))).toBe(false)
    expect(reportJson(report.report)).not.toContain('kept')

    const plain = await analyzeBackup(
      zip(
        base({
          'questions.xml': `${XML}<question_categories><question_category id="5"><contextid>99</contextid><parent>0</parent>
            <questions><question id="70"><qtype>shortanswer</qtype><answer>Yes</answer></question></questions>
          </question_category></question_categories>`,
        }),
      ),
      { filename: 'course.mbz' },
    )
    expect(plain.findings.some((item) => item.ruleId.includes('attempt'))).toBe(false)
    expect(
      plain.findings.some((item) => item.ruleId.includes('answer') || item.ruleId.includes('hint')),
    ).toBe(false)
    expect(plain.limitations.join('\n')).toContain('answer or hint text')
  })

  test('reports an unknown file context and a dangling inforef without inventing either', async () => {
    const hash = await sha1Hex(strToU8('note'))
    const source = zip(
      base({
        'course/course.xml': `${XML}<course><fullname>Demo</fullname><contextid>10</contextid></course>`,
        'files.xml': filesXml(hash),
        [`files/${hash.slice(0, 2)}/${hash}`]: strToU8('note'),
        'activities/page_4/inforef.xml': `${XML}<inforef>
          <fileref><file><id>1</id></file><file><id>1</id></file><file><id>404</id></file></fileref>
          <questionref><question><id>70</id></question></questionref>
        </inforef>`,
      }),
    )
    const report = await inspect(source, { filename: 'course.mbz' })
    expect(
      report.report.findings.find((item) => item.ruleId === 'references.unknown-context')?.repair,
    ).toBeUndefined()
    expect(
      report.report.findings.some((item) => item.ruleId === 'references.inforef-missing-target'),
    ).toBe(true)
    expect(
      report.report.findings.some((item) => item.ruleId === 'references.inforef-duplicate'),
    ).toBe(true)
    expect(report.archiveEdits.some((step) => step.id.startsWith('references.'))).toBe(false)

    const noInforef = await analyzeBackup(zip(base()), { filename: 'course.mbz' })
    expect(noInforef.findings.some((item) => item.ruleId.startsWith('references.inforef'))).toBe(
      false,
    )
  })

  test('keeps a personal-data value out of the unwrap report', async () => {
    const email = 'student@example.com'
    const source = zip(
      wrap('my-course/', {
        ...base({
          'users.xml': `${XML}<users><user id="3"><email>${email}</email></user></users>`,
        }),
      }),
    )
    const report = await analyzeBackup(source, { filename: 'course.mbz' })
    const json = reportJson(report)
    expect(json).not.toContain(email)
    expect(report.findings.some((item) => item.ruleId === 'archive.unwrap-root')).toBe(true)
  })

  test('a newer backup is a warning and a size repair does not rewrite the version', async () => {
    const bytes = strToU8('note')
    const hash = await sha1Hex(bytes)
    const xml = filesXml(hash).replace('<filesize>4</filesize>', '<filesize>9</filesize>')
    const source = zip(
      base({
        'moodle_backup.xml': manifest({ release: '4.5', version: '2024100700' }),
        'files.xml': xml,
        [`files/${hash.slice(0, 2)}/${hash}`]: bytes,
      }),
    )
    const open = await inspect(source, { filename: 'course.mbz', targetRelease: '3.9' })
    const older = open.report.findings.find((item) => item.ruleId === 'metadata.target-older')
    expect(older?.severity).toBe('warning')
    expect(older?.repairability).toBe('not-repairable')
    expect(open.steps.some((step) => step.entry === 'moodle_backup.xml')).toBe(false)
    const outcome = await applyRepairs(source, [`files.size:${hash}`], {
      filename: 'course.mbz',
      targetRelease: '3.9',
    })
    const text = new TextDecoder().decode(await entryOf(outcome.blob, 'moodle_backup.xml'))
    expect(text).toContain('<moodle_release>4.5</moodle_release>')
    expect(text).toContain('<backup_version>2024100700</backup_version>')
    expect(outcome.after.findings.some((item) => item.ruleId === 'metadata.target-older')).toBe(
      true,
    )
  })
})
