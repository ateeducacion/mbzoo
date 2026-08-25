/**
 * Parsers for per-entity XML files inside the backup:
 *   course/course.xml   — full course metadata (fullname lives here, not in
 *                         moodle_backup.xml; verified on REPO-004 fixtures)
 *   sections/section_N/section.xml — section number/name/summary + module
 *                         order in <sequence> (comma-separated module ids)
 */
import type { CourseInfo } from '../model/backup.ts'
import { parseXmlEvents } from './xml.ts'

export async function parseCourseXml(
  xml: string,
  fallback: Pick<CourseInfo, 'fullname' | 'originalWwwroot'>,
): Promise<CourseInfo> {
  const out: { -readonly [K in keyof CourseInfo]: CourseInfo[K] } = {
    fullname: '',
    shortname: '',
    idNumber: '',
    summary: '',
    // Site provenance only exists in moodle_backup.xml; keep it on the model.
    originalWwwroot: fallback.originalWwwroot,
    source: { xmlPath: 'course/course.xml' },
  }
  const path: string[] = []
  let text = ''
  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    const value = text.trim()
    // Only direct children of <course>.
    if (path.length === 2 && path[0] === 'course') {
      const field = path[1]
      if (field === 'fullname') out.fullname = value
      else if (field === 'shortname') out.shortname = value
      else if (field === 'idnumber') out.idNumber = value
      else if (field === 'summary') out.summary = value
      else if (field === 'startdate') {
        const n = Number(value)
        if (Number.isFinite(n)) out.startDate = n
      }
    }
    path.pop()
    text = ''
  })
  if (out.fullname === '') out.fullname = fallback.fullname
  return out
}

/** Module order within a section, from <sequence>573,12028</sequence>. */
export async function parseSectionXml(xml: string): Promise<{
  id: number | undefined
  number: number | undefined
  name: string
  sequence: number[]
}> {
  let id: number | undefined
  let number: number | undefined
  let name = ''
  let sequence: number[] = []
  const path: string[] = []
  let text = ''
  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (path.length === 0 && ev.name === 'section') {
        const idAttr = ev.attributes.id
        if (idAttr !== undefined) {
          const n = Number(idAttr)
          if (Number.isFinite(n)) id = n
        }
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    const value = text.trim()
    if (path.length === 2 && path[0] === 'section') {
      const field = path[1]
      if (field === 'number') {
        const n = Number(text)
        if (Number.isFinite(n)) number = n
      } else if (field === 'name') {
        name = value
      } else if (field === 'sequence') {
        sequence = text
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n))
      }
    } else if (path.length === 1 && path[0] === 'section' && ev.name === 'section') {
      // Root element close; nothing to read from text.
    }
    path.pop()
    text = ''
  })
  return { id, number, name, sequence }
}
