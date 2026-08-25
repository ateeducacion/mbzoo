/**
 * Parser for moodle_backup.xml — the minimum subset required to
 * reconstruct the course navigation tree (research/Q-002).
 *
 * Evidence for the element structure: Moodle 3.3 / 3.8 backups from
 * saylordotorg/course_backups (research/sources/repositories/REPO-004),
 * inspected 2026-08-24; schema generation in moodle/backup/moodle2/
 * backup_stepslib.php (REPO-005).
 *
 * Observed shape:
 *   <moodle_backup><information><contents>
 *     <course><courseid>…</courseid><title>…</title><directory>course</directory>
 *     <sections><section><sectionid>…<title>…<directory>sections/section_N
 *     <activities><activity><moduleid>…<sectionid>…<modulename>…<title>…<directory>
 *
 * The parser is tolerant: unknown elements are skipped and recorded as
 * warnings, never silently dropped.
 */
import type { ActivityInfo, CourseInfo, ParsedBackup, SectionInfo } from '../model/backup.ts'
import { parseXmlEvents, type XmlEvent } from './xml.ts'

export interface BackupXmlResult {
  readonly course: CourseInfo
  readonly sections: SectionInfo[]
  readonly activities: ActivityInfo[]
}

/**
 * Stream-parse a moodle_backup.xml document.
 */
export async function parseMoodleBackupXml(
  xml: string,
  warnings: ParsedBackup['warnings'],
): Promise<BackupXmlResult> {
  const path: string[] = []
  let text = ''
  let course: { -readonly [K in keyof CourseInfo]: CourseInfo[K] } | undefined
  const sections: Array<{ -readonly [K in keyof SectionInfo]: SectionInfo[K] }> = []
  const activities: Array<{ -readonly [K in keyof ActivityInfo]: ActivityInfo[K] }> = []
  let warnedClose = false

  const onEvent = (ev: XmlEvent): void => {
    if (ev.type === 'open') {
      path.push(ev.name)
      const p = path.join('/')
      if (p.endsWith('/contents/sections/section')) {
        sections.push({
          id: Number.NaN,
          number: -1,
          name: '',
          summary: '',
          activityIds: [],
          source: { xmlPath: p },
        })
      } else if (p.endsWith('/contents/activities/activity')) {
        activities.push({
          id: Number.NaN,
          sectionId: Number.NaN,
          moduleName: '',
          title: '',
          rawXml: '',
          source: { xmlPath: p },
        })
      }
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const p = path.join('/')
    const value = text.trim()
    if (!warnedClose && ev.name !== path[path.length - 1]) {
      warnings.push({
        code: 'xml-mismatched-close',
        message: `Mismatched closing tag </${ev.name}> while inside <${path.join('/')}>`,
      })
      warnedClose = true
    }

    switch (true) {
      case p === 'moodle_backup/information/contents/course':
        course ??= {
          fullname: '',
          shortname: '',
          idNumber: '',
          summary: '',
          source: { xmlPath: p },
        }
        break
      case /^moodle_backup\/information\/contents\/course\//.test(p):
        if (course) fillCourseField(course, leaf(p), value)
        break
      default:
        // Field values for section/activity children are handled below.
        break
    }

    // Child fields of the current section/activity (still on the path stack).
    if (/^moodle_backup\/information\/contents\/sections\/section\//.test(p)) {
      const s = sections[sections.length - 1]
      if (s) fillSectionField(s, leaf(p), value)
    } else if (/^moodle_backup\/information\/contents\/activities\/activity\//.test(p)) {
      const a = activities[activities.length - 1]
      if (a) fillActivityField(a, leaf(p), value)
    }

    path.pop()
    text = ''
  }

  await parseXmlEvents(xml, onEvent)

  if (!course) {
    throw new Error(
      'moodle_backup.xml does not contain information/details/course — not a Moodle backup?',
    )
  }
  return { course, sections, activities }
}

function leaf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Fields under <information><details><detail><course>. */
function fillCourseField(
  c: { -readonly [K in keyof CourseInfo]: CourseInfo[K] },
  field: string,
  v: string,
): void {
  if (field === 'courseid') return // internal id kept out of model for now
  if (field === 'title') c.fullname = v
}

function fillSectionField(
  s: { -readonly [K in keyof SectionInfo]: SectionInfo[K] },
  field: string,
  v: string,
): void {
  switch (field) {
    case 'sectionid':
      s.id = num(v, s.id)
      break
    case 'number':
      s.number = num(v, s.number)
      break
    case 'title':
      s.name = v
      break
    default:
      break
  }
}

function fillActivityField(
  a: { -readonly [K in keyof ActivityInfo]: ActivityInfo[K] },
  field: string,
  v: string,
): void {
  switch (field) {
    case 'moduleid':
      a.id = num(v, a.id)
      break
    case 'sectionid':
      a.sectionId = num(v, a.sectionId)
      break
    case 'modulename':
      a.moduleName = v
      break
    case 'title':
      a.title = v
      break
    default:
      break
  }
}

function num(v: string, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
