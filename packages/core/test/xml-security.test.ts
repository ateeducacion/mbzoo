import { describe, expect, test } from 'bun:test'
import { parseFilesXml } from '../src/moodle/files-xml.ts'
import { parseXmlEvents } from '../src/moodle/xml.ts'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<files>
  <file id="1">
    <contenthash>da39a3ee5e6b4b0d3255bfef95601890afd80709</contenthash>
    <contextid>101</contextid>
    <component>mod_page</component>
    <filearea>content</filearea>
    <itemid>0</itemid>
    <filepath>/docs/</filepath>
    <filename>.</filename>
    <userid>2</userid>
    <filesize>0</filesize>
    <mimetype>$@NULL@$</mimetype>
  </file>
  <file id="2">
    <contenthash>abc123</contenthash>
    <contextid>101</contextid>
    <component>mod_page</component>
    <filearea>content</filearea>
    <itemid>0</itemid>
    <filepath>/docs/</filepath>
    <filename>guide.pdf</filename>
    <userid>2</userid>
    <filesize>4096</filesize>
    <mimetype>application/pdf</mimetype>
  </file>
</files>`

describe('parseFilesXml', () => {
  test('indexes records and resolves Moodle NULL sentinels', async () => {
    const files = await parseFilesXml(SAMPLE)
    expect(files.size).toBe(2)
    const pdf = [...files.values()].find((f) => f.fileName === 'guide.pdf')
    expect(pdf?.mimeType).toBe('application/pdf')
    expect(pdf?.fileSize).toBe(4096)
    const dot = [...files.values()].find((f) => f.fileName === '.')
    expect(dot?.mimeType).toBe('') // $@NULL@$ → ''
  })
})

describe('parseXmlEvents security limits', () => {
  test('rejects DOCTYPE (XXE / entity-expansion surface)', async () => {
    const evil = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>`
    expect(parseXmlEvents(evil, () => {})).rejects.toThrow()
  })

  test('rejects malformed XML', async () => {
    expect(parseXmlEvents('<a><b></a></b>', () => {})).rejects.toThrow()
  })
})
