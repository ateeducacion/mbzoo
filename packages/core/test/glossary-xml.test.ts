import { describe, expect, test } from 'bun:test'
import { parseGlossaryXml } from '../src/moodle/glossary-xml.ts'

const GLOSSARY = `<?xml version="1.0"?>
<activity id="7" moduleid="7" modulename="glossary" contextid="107">
  <glossary id="7">
    <entries>
      <entry id="9001">
        <concept>MBZ</concept>
        <definition>&lt;p&gt;Moodle Backup.&lt;/p&gt;</definition>
      </entry>
      <entry id="9002">
        <concept>Contenthash</concept>
        <definition>SHA1 of file contents.</definition>
      </entry>
    </entries>
  </glossary>
</activity>`

describe('parseGlossaryXml', () => {
  test('reads concept and definition', async () => {
    const entries = await parseGlossaryXml(GLOSSARY)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.concept).toBe('MBZ')
    expect(entries[0]?.definition).toContain('Moodle Backup')
  })

  // The itemid of its mod_glossary/entry files (REPO-005).
  test('entries expose their id', async () => {
    const entries = await parseGlossaryXml(GLOSSARY)
    expect(entries.map((e) => e.id)).toEqual([9001, 9002])
  })

  test('an entry with no concept is skipped', async () => {
    const odd = GLOSSARY.replace('<concept>MBZ</concept>', '<concept></concept>')
    expect(await parseGlossaryXml(odd)).toHaveLength(1)
  })
})
