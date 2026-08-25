import { describe, expect, test } from 'bun:test'
import { parseFilesXml } from '../src/moodle/files-xml.ts'

describe('sortorder', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<files>
  <file id="1">
    <contenthash>aaa</contenthash><contextid>500</contextid>
    <component>mod_resource</component><filearea>content</filearea><itemid>0</itemid>
    <filepath>/site/</filepath><filename>index.html</filename>
    <filesize>10</filesize><mimetype>text/html</mimetype><sortorder>1</sortorder>
  </file>
  <file id="2">
    <contenthash>bbb</contenthash><contextid>500</contextid>
    <component>mod_resource</component><filearea>content</filearea><itemid>0</itemid>
    <filepath>/site/</filepath><filename>other.html</filename>
    <filesize>10</filesize><mimetype>text/html</mimetype><sortorder>0</sortorder>
  </file>
</files>`

  test('reads Moodle main-file marker', async () => {
    const files = await parseFilesXml(xml)
    const recs = [...files.values()]
    // Exactly one record per area carries 1. It is how Moodle knows which of
    // the files a teacher uploaded is the resource itself.
    expect(recs.filter((r) => r.sortOrder === 1).map((r) => r.fileName)).toEqual(['index.html'])
    expect(recs.find((r) => r.fileName === 'other.html')?.sortOrder).toBe(0)
  })

  test('defaults to 0 when the record omits it', async () => {
    const without = xml.replace(/<sortorder>\d<\/sortorder>/g, '')
    const recs = [...(await parseFilesXml(without)).values()]
    expect(recs.every((r) => r.sortOrder === 0)).toBe(true)
  })
})
