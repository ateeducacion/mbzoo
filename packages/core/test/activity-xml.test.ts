import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import {
  contentHashPath,
  extractPluginFileRefs,
  matchFileRecord,
  parseActivityXml,
} from '../src/moodle/activity-xml.ts'
import { openBackup } from '../src/open-backup.ts'

const FIXTURE = join(import.meta.dir, '../../../fixtures/files/demo-course-zip.mbz')

describe('parseActivityXml', () => {
  test('captures root attributes and depth-2 fields', async () => {
    const xml = `<?xml version="1.0"?>
<activity id="4" moduleid="4" modulename="page" contextid="104">
  <page id="4">
    <name>About</name>
    <content>&lt;p&gt;Hello&lt;/p&gt;</content>
    <contentformat>1</contentformat>
  </page>
</activity>`
    const a = await parseActivityXml(xml)
    expect(a.contextId).toBe('104')
    expect(a.moduleName).toBe('page')
    expect(a.fields.get('name')).toBe('About')
    expect(a.fields.get('content')).toContain('Hello')
    expect(a.fields.get('contentformat')).toBe('1')
  })

  // Moodle serializes SQL NULL as a literal string; renderers print field
  // values, so it must never survive the parse (observed in every REPO-004
  // backup — CS401 alone carries 448 of them).
  test('drops the $@NULL@$ sentinel instead of exposing it as content', async () => {
    const xml = `<?xml version="1.0"?>
<activity id="4" moduleid="4" modulename="url" contextid="104">
  <url id="4">
    <name>Link</name>
    <intro>$@NULL@$</intro>
    <externalurl>https://example.org</externalurl>
  </url>
</activity>`
    const a = await parseActivityXml(xml)
    expect(a.fields.get('intro')).toBe('')
    expect(a.fields.get('externalurl')).toBe('https://example.org')
  })
})

describe('@@PLUGINFILE@@ handling', () => {
  test('extracts references', () => {
    const html = '<img src="@@PLUGINFILE@@/pic.png" alt="a">@@PLUGINFILE@@doc.pdf'
    expect(extractPluginFileRefs(html).sort()).toEqual(['doc.pdf', 'pic.png'])
  })

  test('matches records with scope priority', async () => {
    const b = await openBackup(Bun.file(FIXTURE))
    const rec = matchFileRecord(b.files, {
      fileName: 'guide.txt',
      componentName: 'mod_resource',
      fileArea: 'content',
    })
    expect(rec?.component).toBe('mod_resource')
    expect(matchFileRecord(b.files, { fileName: 'missing.bin' })).toBeUndefined()
  })

  test('maps content hashes to archive paths', () => {
    expect(contentHashPath('abcdef1234')).toBe('files/ab/abcdef1234')
  })
})

// PRDV103-2017-07-21 (REPO-004) has an unnamed section 0, serialized as
// <name>$@NULL@$</name>. It reached the sidebar verbatim as a heading.
describe('$@NULL@$ never becomes content', () => {
  test('a section whose name is NULL parses as unnamed', async () => {
    const { parseSectionXml } = await import('../src/moodle/course-xml.ts')
    const section = await parseSectionXml(
      '<section id="579"><number>0</number><name>$@NULL@$</name><sequence>1,2</sequence></section>',
    )
    expect(section.name).toBe('')
    expect(section.number).toBe(0)
  })

  test('course fields carry the sentinel through as absence', async () => {
    const { parseCourseXml } = await import('../src/moodle/course-xml.ts')
    const course = await parseCourseXml(
      '<course id="1"><fullname>Real</fullname><shortname>$@NULL@$</shortname>' +
        '<idnumber>$@NULL@$</idnumber><summary>$@NULL@$</summary></course>',
      { fullname: 'fallback', originalWwwroot: '' },
    )
    expect(course.shortname).toBe('')
    expect(course.idNumber).toBe('')
    expect(course.summary).toBe('')
    expect(course.fullname).toBe('Real')
  })
})

// choice options, data fields and workshop example submissions all use the
// same shape: repeated records one level below the module element.
describe('parseNestedRecords', () => {
  const CHOICE = `<?xml version="1.0"?>
<activity id="1" moduleid="1" modulename="choice" contextid="1">
  <choice id="1">
    <name>Pick one</name>
    <options>
      <option id="7"><text>Morning</text><maxanswers>10</maxanswers></option>
      <option id="8"><text>Afternoon</text><maxanswers>0</maxanswers></option>
    </options>
  </choice>
</activity>`

  test('reads each record with its id and leaf fields', async () => {
    const { parseNestedRecords } = await import('../src/moodle/activity-xml.ts')
    const options = await parseNestedRecords(CHOICE, 'options', 'option')
    expect(options).toHaveLength(2)
    expect(options[0]?.get('id')).toBe('7')
    expect(options[0]?.get('text')).toBe('Morning')
    expect(options[1]?.get('maxanswers')).toBe('0')
  })

  test('the NULL sentinel is absence here too', async () => {
    const { parseNestedRecords } = await import('../src/moodle/activity-xml.ts')
    const options = await parseNestedRecords(
      CHOICE.replace('<text>Morning</text>', '<text>$@NULL@$</text>'),
      'options',
      'option',
    )
    expect(options[0]?.get('text')).toBe('')
  })

  test('a container that is not there yields no records', async () => {
    const { parseNestedRecords } = await import('../src/moodle/activity-xml.ts')
    expect(await parseNestedRecords(CHOICE, 'fields', 'field')).toEqual([])
  })

  test('only direct children of the container count as records', async () => {
    const { parseNestedRecords } = await import('../src/moodle/activity-xml.ts')
    const nested = CHOICE.replace(
      '<maxanswers>0</maxanswers>',
      '<maxanswers>0</maxanswers><options><option id="9"><text>Nested</text></option></options>',
    )
    const options = await parseNestedRecords(nested, 'options', 'option')
    expect(options.map((o) => o.get('text'))).toContain('Morning')
    expect(options.map((o) => o.get('id'))).toContain('9')
  })
})

// mod/UPGRADING.md names 5.0 for chat and survey; the commit removing
// mod_assignment first ships in v4.2.0 (REPO-005).
describe('legacyModule', () => {
  test('names the release that dropped each retired module', async () => {
    const { legacyModule } = await import('../src/moodle/legacy-modules.ts')
    expect(legacyModule('chat')).toEqual({ removedIn: '5.0', issue: 'MDL-82457' })
    expect(legacyModule('survey')?.removedIn).toBe('5.0')
    expect(legacyModule('assignment')?.removedIn).toBe('4.2')
  })

  test('a module that still exists is not labelled', async () => {
    const { legacyModule } = await import('../src/moodle/legacy-modules.ts')
    expect(legacyModule('assign')).toBeUndefined()
    expect(legacyModule('forum')).toBeUndefined()
  })

  // Third-party plugins are none of our business: we cannot know whether one
  // was retired, and guessing would put a false label on someone's module.
  test('an unknown third-party module is not labelled', async () => {
    const { legacyModule } = await import('../src/moodle/legacy-modules.ts')
    expect(legacyModule('supermodule')).toBeUndefined()
  })
})

// Moodle scopes several file areas per row: mod_lesson/page_contents by page
// id, mod_glossary/entry by entry id, question/questiontext by question id
// (REPO-005). Without itemid, two pages that each embed a pic.png are
// indistinguishable and the first record found wins for both.
describe('matchFileRecord itemid scoping', () => {
  const files = new Map(
    [
      { itemId: '10', contentHash: 'aaa' },
      { itemId: '11', contentHash: 'bbb' },
    ].map((f, i) => [
      String(i),
      {
        contentHash: f.contentHash,
        filePath: '/',
        fileName: 'pic.png',
        mimeType: 'image/png',
        fileSize: 1,
        component: 'mod_lesson',
        fileArea: 'page_contents',
        itemId: f.itemId,
        contextId: '120',
      },
    ]),
  )

  test('picks the record belonging to the row that asked', () => {
    const ref = { fileName: 'pic.png', componentName: 'mod_lesson', fileArea: 'page_contents' }
    expect(matchFileRecord(files, { ...ref, itemId: '11' })?.contentHash).toBe('bbb')
    expect(matchFileRecord(files, { ...ref, itemId: '10' })?.contentHash).toBe('aaa')
  })

  // Guessing here would show one page's image on another page, which is worse
  // than showing none: it looks correct and is not.
  test('a pinned itemid that matches nothing returns nothing', () => {
    const hit = matchFileRecord(files, {
      fileName: 'pic.png',
      componentName: 'mod_lesson',
      fileArea: 'page_contents',
      itemId: '999',
    })
    expect(hit).toBeUndefined()
  })

  test('without an itemid the old fallback still applies', () => {
    expect(matchFileRecord(files, { fileName: 'pic.png' })?.contentHash).toBe('aaa')
  })
})
