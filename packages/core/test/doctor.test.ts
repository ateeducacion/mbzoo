import { describe, expect, test } from 'bun:test'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { crc32 } from '../src/doctor/bytes.ts'
import { EVIDENCE_TEXT, fillEvidence } from '../src/doctor/evidence.ts'
import { analyzeBackup, applyRepairs, reportJson, reportText, TarGzReader } from '../src/index.ts'

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
  users?: string
  files?: string
  course?: string
  activities?: string
  sections?: string
}): string {
  const release = options.release ?? '4.5'
  const version = options.version ?? '2024100700'
  const activities =
    options.activities ??
    `<activity><moduleid>20</moduleid><sectionid>10</sectionid><modulename>quiz</modulename><title>Quiz</title><directory>activities/quiz_20</directory></activity>`
  const sections =
    options.sections ??
    `<section><sectionid>10</sectionid><title>Topic</title><directory>sections/section_10</directory></section>`
  return `${XML}
<moodle_backup><information>
  <name>Demo</name>
  <moodle_version>${version}</moodle_version>
  <moodle_release>${release}</moodle_release>
  <backup_version>${version}</backup_version>
  <backup_release>${release}</backup_release>
  <backup_date>1700000000</backup_date>
  <contents>
    <course><courseid>1</courseid><title>${options.course ?? 'Demo course'}</title><directory>course</directory></course>
    <sections>${sections}</sections>
    <activities>${activities}</activities>
  </contents>
  <settings>
    <setting><level>root</level><name>users</name><value>${options.users ?? '0'}</value></setting>
    <setting><level>root</level><name>files</name><value>${options.files ?? '1'}</value></setting>
  </settings>
</information></moodle_backup>`
}

const sectionXml = `${XML}<section id="10"><number>1</number><name>Topic</name><sequence>20</sequence></section>`
const moduleXml = `${XML}<module id="20" version="2024100700"><modulename>quiz</modulename><sectionid>10</sectionid></module>`

function questionsXml(randomText = '0'): string {
  return `${XML}<question_categories>
  <question_category id="5">
    <name>Default</name>
    <contextid>99</contextid>
    <parent>0</parent>
    <question_bank_entries>
      <question_bank_entry id="50">
        <questioncategoryid>5</questioncategoryid>
        <question_version><question_versions id="7"><version>1</version><questions>
          <question id="70"><name>Real</name><questiontext>What is kept?</questiontext><qtype>shortanswer</qtype></question>
        </questions></question_versions></question_version>
      </question_bank_entry>
      <question_bank_entry id="51">
        <questioncategoryid>5</questioncategoryid>
        <question_version><question_versions id="8"><version>1</version><questions>
          <question id="71"><name>Random</name><questiontext>${randomText}</questiontext><qtype>random</qtype></question>
        </questions></question_versions></question_version>
      </question_bank_entry>
    </question_bank_entries>
    <plugin_local_keepme>keep-this</plugin_local_keepme>
  </question_category>
</question_categories>`
}

const quizXml = `${XML}<activity id="20" moduleid="20" modulename="quiz" contextid="15">
  <quiz id="3"><name>Quiz</name>
    <!-- keep-me -->
    <question_instances>
      <question_instance id="9">
        <slot>1</slot><page>1</page><maxmark>1.0000000</maxmark>
        <question_reference id="4">
          <usingcontextid>15</usingcontextid>
          <component>mod_quiz</component>
          <questionarea>slot</questionarea>
          <questionbankentryid>51</questionbankentryid>
          <version>$@NULL@$</version>
        </question_reference>
      </question_instance>
    </question_instances>
  </quiz>
</activity>`

function modernRandom(randomText = '0'): Blob {
  return zip({
    'moodle_backup.xml': manifest({}),
    'sections/section_10/section.xml': sectionXml,
    'activities/quiz_20/module.xml': moduleXml,
    'activities/quiz_20/quiz.xml': quizXml,
    'questions.xml': questionsXml(randomText),
    'course/course.xml': `${XML}<course><fullname>Demo course</fullname><shortname>demo</shortname><!-- untouched --></course>`,
  })
}

describe('crc32', () => {
  test('matches the ZIP check value for 123456789', () => {
    expect(crc32(strToU8('123456789'))).toBe(0xcbf43926)
  })
})

describe('analyzeBackup', () => {
  test('reports a modern random question and leaves a legacy one alone', async () => {
    const modern = await analyzeBackup(modernRandom(), {
      filename: 'course.mbz',
      now: '2026-10-14T00:00:00.000Z',
    })
    expect(modern.moodleRestoreVerified).toBe(false)
    expect(modern.facts.courseName).toBe('Demo course')
    expect(modern.facts.moodleRelease).toBe('4.5')
    expect(modern.facts.format).toBe('zip')
    const repair = modern.findings.find((finding) => finding.ruleId === 'questions.random-modern')
    expect(repair?.repairability).toBe('confirmation-required')
    expect(repair?.activityId).toBe(20)
    expect(repair?.repair?.entries).toContain('questions.xml')
    expect(modern.findings.some((finding) => finding.ruleId === 'archive.crc')).toBe(false)

    const legacy = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({ release: '3.11', version: '2021051700' }),
        'sections/section_10/section.xml': sectionXml,
        'questions.xml': `${XML}<question_categories><question_category id="5"><contextid>9</contextid><parent>0</parent>
          <questions>
            <question id="71"><questiontext>1</questiontext><qtype>random</qtype></question>
            <question id="70"><questiontext>Kept</questiontext><qtype>essay</qtype></question>
          </questions>
        </question_category></question_categories>`,
      }),
      { filename: 'old.mbz' },
    )
    expect(legacy.findings.some((finding) => finding.ruleId === 'questions.legacy-random')).toBe(
      true,
    )
    expect(legacy.findings.some((finding) => finding.ruleId === 'questions.random-modern')).toBe(
      false,
    )
  })

  test('does not offer a repair for an ambiguous random question', async () => {
    const odd = await analyzeBackup(modernRandom('draw anything'), { filename: 'course.mbz' })
    const blocked = odd.findings.find((finding) => finding.ruleId === 'questions.random-blocked')
    expect(blocked).toBeDefined()
    expect(blocked?.repair).toBeUndefined()
    const olderTarget = await analyzeBackup(modernRandom(), {
      filename: 'course.mbz',
      targetRelease: '3.9',
    })
    const older = olderTarget.findings.find((finding) => finding.ruleId === 'metadata.target-older')
    expect(older?.severity).toBe('warning')
    expect(older?.repairability).toBe('not-repairable')
    expect(older?.repair).toBeUndefined()
    expect(older?.explanation).toContain('noticenewerbackup')
    expect(older?.explanation).not.toContain('fails even when')
    expect(
      olderTarget.findings.some((finding) => finding.ruleId === 'questions.random-modern'),
    ).toBe(false)
  })

  test('evidence carries a stable code and values next to the English detail (#41)', async () => {
    const report = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({
          activities: `<activity><moduleid>2</moduleid><sectionid>10</sectionid><modulename>scheduler</modulename><title>Book a slot</title></activity>`,
        }),
        'sections/section_10/section.xml': sectionXml,
      }),
      { filename: 'course.mbz' },
    )
    const evidence = report.findings.find(
      (finding) => finding.id === 'plugins.unknown-module:scheduler',
    )?.evidence[0]
    expect(evidence?.code).toBe('plugins.not-core-module')
    expect(evidence?.params).toEqual({ module: 'scheduler' })
    expect(evidence?.detail).toBe("scheduler is not in MBZoo's core module list")
    for (const finding of report.findings) {
      for (const item of finding.evidence) {
        if (item.code === undefined) continue
        expect(fillEvidence(EVIDENCE_TEXT[item.code], item.params ?? {})).toBe(item.detail)
      }
    }
  })

  test('distinguishes removed core modules from unknown plugins', async () => {
    const report = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({
          activities: `<activity><moduleid>1</moduleid><sectionid>10</sectionid><modulename>chat</modulename><title>Chat</title></activity>
            <activity><moduleid>2</moduleid><sectionid>10</sectionid><modulename>mymod</modulename><title>Mine</title></activity>`,
        }),
        'sections/section_10/section.xml': sectionXml,
      }),
      { filename: 'course.mbz', targetRelease: '5.1' },
    )
    expect(report.findings.find((finding) => finding.id === 'plugins.removed:chat')?.severity).toBe(
      'warning',
    )
    expect(
      report.findings.find((finding) => finding.id === 'plugins.unknown-module:mymod')?.severity,
    ).toBe('info')
    const oldTarget = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({
          release: '3.9',
          version: '2020061500',
          activities: `<activity><moduleid>1</moduleid><sectionid>10</sectionid><modulename>chat</modulename><title>Chat</title></activity>`,
        }),
        'sections/section_10/section.xml': sectionXml,
      }),
      { filename: 'course.mbz', targetRelease: '3.11' },
    )
    expect(
      oldTarget.findings.find((finding) => finding.id === 'plugins.removed:chat')?.severity,
    ).toBe('info')
  })

  test('checks file size, hash, exclusion, and directory records', async () => {
    const bytes = strToU8('note')
    const hash = await crypto.subtle.digest('SHA-1', bytes)
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const filesXml = (size: string) => `${XML}<files>
      <file id="1"><contenthash>${hex}</contenthash><contextid>1</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>note.txt</filename><filesize>${size}</filesize><mimetype>text/plain</mimetype></file>
      <file id="2"><contenthash>da39a3ee5e6b4b0d3255bfef95601890afd80709</contenthash><contextid>1</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/dir/</filepath><filename>.</filename><filesize>0</filesize><mimetype>$@NULL@$</mimetype></file>
    </files>`
    const wrong = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({ activities: '' }),
        'sections/section_10/section.xml': sectionXml,
        'files.xml': filesXml('999'),
        [`files/${hex.slice(0, 2)}/${hex}`]: bytes,
      }),
      { filename: 'course.mbz' },
    )
    const size = wrong.findings.find((finding) => finding.ruleId === 'files.size')
    expect(size?.repairability).toBe('automatic')
    expect(wrong.findings.some((finding) => finding.ruleId === 'files.missing')).toBe(false)

    const clash = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({ activities: '' }),
        'sections/section_10/section.xml': sectionXml,
        'files.xml': filesXml('4'),
        [`files/${hex.slice(0, 2)}/${hex}`]: strToU8('nope'),
      }),
      { filename: 'course.mbz' },
    )
    expect(clash.findings.some((finding) => finding.ruleId === 'files.hash')).toBe(true)
    expect(clash.findings.some((finding) => finding.ruleId === 'files.size')).toBe(false)

    const excluded = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({ activities: '', files: '0' }),
        'sections/section_10/section.xml': sectionXml,
        'files.xml': filesXml('4'),
      }),
      { filename: 'course.mbz' },
    )
    expect(excluded.findings.some((finding) => finding.ruleId === 'files.excluded')).toBe(true)
    expect(excluded.findings.some((finding) => finding.ruleId === 'files.missing')).toBe(false)
  })

  test('reports missing structure, bad references, and archive failures', async () => {
    const missing = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({
          activities: `<activity><moduleid>7</moduleid><sectionid>99</sectionid><modulename>page</modulename><title>Gone</title></activity>`,
          sections: `<section><sectionid>10</sectionid><title>Topic</title></section>`,
        }),
      }),
      { filename: 'course.mbz' },
    )
    expect(missing.findings.some((finding) => finding.id === 'activities.missing:7')).toBe(true)
    expect(missing.findings.some((finding) => finding.id === 'activities.bad-section:7')).toBe(true)
    expect(missing.findings.some((finding) => finding.id === 'sections.missing:10')).toBe(true)

    const empty = await analyzeBackup(zip({ 'readme.txt': 'no manifest' }), {
      filename: 'course.mbz',
    })
    expect(empty.findings.some((finding) => finding.ruleId === 'archive.missing-root')).toBe(true)

    const broken = await analyzeBackup(new Blob([Uint8Array.from([0x50, 0x4b, 0x03, 0x04])]), {
      filename: 'broken.mbz',
    })
    expect(broken.findings.some((finding) => finding.ruleId === 'archive.unreadable')).toBe(true)

    const unsafe = await analyzeBackup(
      zip({ 'moodle_backup.xml': manifest({ activities: '' }), '../evil.txt': 'x' }),
      { filename: 'course.mbz' },
    )
    expect(unsafe.findings.some((finding) => finding.ruleId === 'archive.unsafe-path')).toBe(true)
  })

  test('flags illegal characters, users, empty pools, and a section cycle', async () => {
    const illegal = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({ activities: '', course: 'A\u0001B' }),
        'sections/section_10/section.xml': sectionXml,
      }),
      { filename: 'course.mbz' },
    )
    expect(illegal.findings.some((finding) => finding.ruleId === 'xml.illegal-chars')).toBe(true)
    expect(illegal.facts.courseName).toContain('A')

    const users = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({ activities: '', users: '1' }),
        'sections/section_10/section.xml': sectionXml,
      }),
      { filename: 'course.mbz' },
    )
    expect(users.findings.some((finding) => finding.ruleId === 'userdata.missing')).toBe(true)

    const pool = await analyzeBackup(modernRandom(), { filename: 'course.mbz' })
    expect(pool.findings.some((finding) => finding.id === 'questions.empty-pool:5')).toBe(false)
    const emptyPool = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({ release: '3.9', version: '2020061500' }),
        'sections/section_10/section.xml': sectionXml,
        'questions.xml': `${XML}<question_categories><question_category id="5"><parent>9</parent><contextid>1</contextid>
          <questions><question id="1"><qtype>random</qtype><questiontext>0</questiontext></question></questions>
        </question_category></question_categories>`,
      }),
      { filename: 'course.mbz' },
    )
    expect(emptyPool.findings.some((finding) => finding.ruleId === 'questions.empty-pool')).toBe(
      true,
    )
    expect(
      emptyPool.findings.some((finding) => finding.ruleId === 'questions.missing-parent'),
    ).toBe(true)

    const cycled = await analyzeBackup(
      zip({
        'moodle_backup.xml': manifest({
          activities: '',
          sections: `<section><sectionid>10</sectionid><title>A</title></section><section><sectionid>11</sectionid><title>B</title></section>`,
        }),
        'sections/section_10/section.xml': `${XML}<section id="10"><number>1</number><name>A</name><course_format_options id="1"><format>flexsections</format><name>parent</name><value>2</value></course_format_options></section>`,
        'sections/section_11/section.xml': `${XML}<section id="11"><number>2</number><name>B</name><course_format_options id="2"><format>flexsections</format><name>parent</name><value>1</value></course_format_options></section>`,
      }),
      { filename: 'course.mbz' },
    )
    expect(cycled.findings.some((finding) => finding.ruleId === 'sections.cycle')).toBe(true)
  })
})

describe('applyRepairs', () => {
  test('converts a modern random question and keeps everything else', async () => {
    const source = modernRandom()
    const original = new Uint8Array(await source.arrayBuffer())
    await expect(applyRepairs(source, [])).rejects.toThrow(/No repairs selected/)
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(original)

    const before = await analyzeBackup(source, {
      filename: 'course.mbz',
      now: '2026-10-14T00:00:00.000Z',
    })
    const id = before.findings.find((finding) => finding.ruleId === 'questions.random-modern')?.id
    if (!id) throw new Error('missing repair')
    await expect(applyRepairs(source, [id], { filename: 'course.mbz' })).rejects.toThrow(
      /confirmation/,
    )

    const outcome = await applyRepairs(source, [id], {
      filename: 'course.mbz',
      confirmed: true,
      now: '2026-10-14T00:00:00.000Z',
    })
    expect(outcome.note).toContain('Successful restoration in Moodle has not been verified')
    expect(outcome.after.moodleRestoreVerified).toBe(false)
    expect(
      outcome.after.findings.some((finding) => finding.ruleId === 'questions.random-modern'),
    ).toBe(false)
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(original)

    const reader = await (await import('../src/archive/lazy-zip-reader.ts')).LazyZipReader.open(
      outcome.blob,
    )
    const quiz = new TextDecoder().decode(await reader.readEntry('activities/quiz_20/quiz.xml'))
    const questions = new TextDecoder().decode(await reader.readEntry('questions.xml'))
    const course = new TextDecoder().decode(await reader.readEntry('course/course.xml'))
    const backup = new TextDecoder().decode(await reader.readEntry('moodle_backup.xml'))
    await reader.close()
    expect(quiz).toContain('<question_set_reference>')
    expect(quiz).toContain('<usingcontextid>15</usingcontextid>')
    expect(quiz).toContain('<questionscontextid>99</questionscontextid>')
    expect(quiz).toContain('"questioncategoryid":5')
    expect(quiz).toContain('"includingsubcategories":0')
    expect(quiz).not.toContain('questionbankentryid')
    expect(quiz).toContain('keep-me')
    expect(quiz).toContain('<maxmark>1.0000000</maxmark>')
    expect(questions).toContain('keep-this')
    expect(questions).toContain('<qtype>shortanswer</qtype>')
    expect(questions).not.toContain('<qtype>random</qtype>')
    expect(questions).not.toContain('id="51"')
    expect(course).toContain('untouched')
    expect(backup).toContain('<moodle_release>4.5</moodle_release>')
    expect(backup).toContain('<backup_version>2024100700</backup_version>')

    await expect(
      applyRepairs(outcome.blob, [id], { filename: 'course-repaired.mbz', confirmed: true }),
    ).rejects.toThrow(/not available/)
    expect(reportJson(outcome.after)).not.toContain('What is kept?')
    expect(reportText(outcome.after, { applied: outcome.applied, note: outcome.note })).toContain(
      'MBZ Doctor report',
    )
  })

  test('corrects a verified file size and is idempotent', async () => {
    const bytes = strToU8('note')
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const source = zip({
      'moodle_backup.xml': manifest({ activities: '' }),
      'sections/section_10/section.xml': sectionXml,
      'files.xml': `${XML}<files><file id="1"><contenthash>${hash}</contenthash><contextid>1</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>note.txt</filename><filesize>999</filesize><mimetype>text/plain</mimetype></file></files>`,
      [`files/${hash.slice(0, 2)}/${hash}`]: bytes,
    })
    const before = await analyzeBackup(source, { filename: 'files.mbz' })
    const id = before.findings.find((finding) => finding.ruleId === 'files.size')?.id
    if (!id) throw new Error('missing size repair')
    const outcome = await applyRepairs(source, [id], { filename: 'files.mbz' })
    const reader = await (await import('../src/archive/lazy-zip-reader.ts')).LazyZipReader.open(
      outcome.blob,
    )
    const files = new TextDecoder().decode(await reader.readEntry('files.xml'))
    const payload = await reader.readEntry(`files/${hash.slice(0, 2)}/${hash}`)
    await reader.close()
    expect(files).toContain('<filesize>4</filesize>')
    expect(new TextDecoder().decode(payload)).toBe('note')
    expect(outcome.after.findings.some((finding) => finding.ruleId === 'files.size')).toBe(false)
    await expect(
      applyRepairs(outcome.blob, [id], { filename: 'files-repaired.mbz' }),
    ).rejects.toThrow(/not available/)
  })

  test('strips only illegal control characters after confirmation', async () => {
    const source = zip({
      'moodle_backup.xml': manifest({ activities: '', course: 'A\u0001B' }),
      'sections/section_10/section.xml': sectionXml,
    })
    const before = await analyzeBackup(source, { filename: 'chars.mbz' })
    const id = before.findings.find((finding) => finding.ruleId === 'xml.illegal-chars')?.id
    if (!id) throw new Error('missing character repair')
    await expect(applyRepairs(source, [id], { filename: 'chars.mbz' })).rejects.toThrow(
      /confirmation/,
    )
    const outcome = await applyRepairs(source, [id], { filename: 'chars.mbz', confirmed: true })
    const reader = await (await import('../src/archive/lazy-zip-reader.ts')).LazyZipReader.open(
      outcome.blob,
    )
    const backup = new TextDecoder().decode(await reader.readEntry('moodle_backup.xml'))
    await reader.close()
    expect(backup).toContain('<title>AB</title>')
    expect(backup).not.toContain('\u0001')
    expect(backup).toContain('<moodle_release>4.5</moodle_release>')
  })

  test('round-trips a TAR.GZ repair without dropping entries', async () => {
    const bytes = strToU8('note')
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const tar = tarArchive([
      { name: 'moodle_backup.xml', data: manifest({ activities: '' }) },
      { name: 'sections/section_10/section.xml', data: sectionXml },
      {
        name: 'files.xml',
        data: `${XML}<files><file id="1"><contenthash>${hash}</contenthash><contextid>1</contextid><component>mod_page</component><filearea>content</filearea><itemid>0</itemid><filepath>/</filepath><filename>note.txt</filename><filesize>1</filesize><mimetype>text/plain</mimetype></file></files>`,
      },
      { name: `files/${hash.slice(0, 2)}/${hash}`, data: bytes },
    ])
    const source = new Blob([gzipSync(tar)])
    const before = await analyzeBackup(source, { filename: 'course.tar.gz' })
    expect(before.facts.format).toBe('targz')
    expect(before.findings.some((finding) => finding.ruleId === 'archive.checksum')).toBe(false)
    const id = before.findings.find((finding) => finding.ruleId === 'files.size')?.id
    if (!id) throw new Error('missing size repair')
    const outcome = await applyRepairs(source, [id], { filename: 'course.tar.gz' })
    const reader = await TarGzReader.open(outcome.blob)
    expect(reader.anomalies().checksumFailures).toEqual([])
    const names = (await reader.listEntries()).map((entry) => entry.name).sort()
    expect(names).toEqual(
      [
        'files.xml',
        `files/${hash.slice(0, 2)}/${hash}`,
        'moodle_backup.xml',
        'sections/section_10/section.xml',
      ].sort(),
    )
    expect(new TextDecoder().decode(await reader.readEntry('files.xml'))).toContain(
      '<filesize>4</filesize>',
    )
    expect(
      new TextDecoder().decode(await reader.readEntry(`files/${hash.slice(0, 2)}/${hash}`)),
    ).toBe('note')
    await reader.close()
  })

  test('refuses to rebuild an archive with an unsafe path', async () => {
    const source = zip({
      'moodle_backup.xml': manifest({ activities: '', course: 'A\u0001B' }),
      '../evil.txt': 'x',
    })
    const before = await analyzeBackup(source, { filename: 'course.mbz' })
    const id =
      before.findings.find((finding) => finding.ruleId === 'xml.illegal-chars')?.id ?? 'missing'
    await expect(
      applyRepairs(source, [id], { filename: 'course.mbz', confirmed: true }),
    ).rejects.toThrow(/not safe to rebuild/)
  })
})

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
