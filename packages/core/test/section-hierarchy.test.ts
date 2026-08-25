import { describe, expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import { openBackup } from '../src/index.ts'

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n'

function section(id: number, number: number, name: string, parent?: string): string {
  const option =
    parent === undefined
      ? ''
      : `  <course_format_options id="${id * 10}">
    <format>flexsections</format>
    <name>parent</name>
    <value>${parent}</value>
  </course_format_options>
`
  return `${XML}<section id="${id}">
  <number>${number}</number>
  <name>${name}</name>
  <summary></summary>
  <sequence></sequence>
  <visible>1</visible>
${option}</section>
`
}

/** The shape every Saylor backup has (REPO-004): flexsections, parent by number. */
function backup(sections: Array<[number, number, string, string?]>): Blob {
  const refs = sections
    .map(
      ([id, , name]) => `        <section>
          <sectionid>${id}</sectionid>
          <title>${name}</title>
          <directory>sections/section_${id}</directory>
        </section>`,
    )
    .join('\n')
  const entries: Record<string, Uint8Array> = {
    'moodle_backup.xml': strToU8(`${XML}<moodle_backup>
  <information>
    <name>flex.mbz</name>
    <original_wwwroot>https://example.invalid</original_wwwroot>
    <contents>
      <course><courseid>1</courseid><title>Flex</title><directory>course</directory></course>
      <sections>
${refs}
      </sections>
      <activities></activities>
    </contents>
    <settings>
      <setting><level>root</level><name>users</name><value>0</value></setting>
    </settings>
  </information>
</moodle_backup>
`),
    'course/course.xml': strToU8(`${XML}<course id="1" contextid="10">
  <shortname>FLEX</shortname>
  <fullname>Flex</fullname>
  <format>flexsections</format>
</course>
`),
    'files.xml': strToU8(`${XML}<files></files>\n`),
  }
  for (const [id, number, name, parent] of sections) {
    entries[`sections/section_${id}/section.xml`] = strToU8(section(id, number, name, parent))
  }
  return new Blob([zipSync(entries)])
}

describe('section hierarchy (ADR-0030)', () => {
  test('the course format is read from course.xml', async () => {
    const b = await openBackup(backup([[32, 0, 'General']]))
    expect(b.course.format).toBe('flexsections')
  })

  test('flexsections parents resolve by section number into ids', async () => {
    // CS101 (REPO-004): #1 and #2 under #0, #3 under #2, #4 and #5 under #3.
    const b = await openBackup(
      backup([
        [32, 0, 'General'],
        [33, 1, 'Course Information', '0'],
        [34, 2, 'Unit 1', '0'],
        [6465, 3, '1.1: History', '2'],
        [6466, 4, '1.1.1: Software', '3'],
        [6468, 5, '1.2: Hardware', '2'],
      ]),
    )
    const parent = Object.fromEntries(b.sections.map((s) => [s.number, s.parentId]))
    expect(parent).toEqual({ 0: undefined, 1: 32, 2: 32, 3: 34, 4: 6465, 5: 34 })
    expect(b.warnings).toEqual([])
    expect(b.sections[3]?.formatOptions.get('parent')).toBe('2')
  })

  test('a parent number that names no section is reported and the section stays top-level', async () => {
    const b = await openBackup(
      backup([
        [32, 0, 'General'],
        [40, 1, 'Orphan', '9'],
      ]),
    )
    expect(b.sections[1]?.parentId).toBeUndefined()
    expect(b.warnings.map((w) => w.code)).toEqual(['section-parent-unresolved'])
  })

  test('a cycle of parents is broken and reported rather than followed', async () => {
    const b = await openBackup(
      backup([
        [32, 0, 'General'],
        [41, 1, 'A', '2'],
        [42, 2, 'B', '1'],
      ]),
    )
    const chain = b.sections.filter((s) => s.parentId !== undefined)
    // One link survives, the other is dropped; walking parents terminates.
    expect(chain.length).toBe(1)
    expect(b.warnings.map((w) => w.code)).toContain('section-parent-cycle')
  })

  test('a topics course carries no parents and no options', async () => {
    const plain = backup([
      [1, 0, 'General'],
      [2, 1, 'Topic 1'],
    ])
    const b = await openBackup(plain)
    expect(b.sections.every((s) => s.parentId === undefined)).toBe(true)
    expect(b.sections[1]?.formatOptions.size).toBe(0)
  })
})
