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
