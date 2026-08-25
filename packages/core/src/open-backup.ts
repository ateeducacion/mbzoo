/**
 * Backup opening pipeline: detect format → open archive → parse the minimum
 * XML subset → assemble the normalized model (ADR-0004, ADR-0005).
 *
 * Design: only moodle_backup.xml, course/course.xml, per-section
 * section.xml files and files.xml are read eagerly. Binary
 * assets are never extracted unless explicitly requested via readEntry.
 */

import { FflateZipReader } from './archive/fflate-zip-reader.ts'
import { type ArchiveReader, detectFormat } from './archive/reader.ts'
import { TarGzReader } from './archive/targz-reader.ts'
import { MbzParseError, type ParsedBackup, type SectionInfo } from './model/backup.ts'
import { parseMoodleBackupXml } from './moodle/backup-xml.ts'
import { parseCourseXml, parseSectionXml } from './moodle/course-xml.ts'
import { parseFilesXml } from './moodle/files-xml.ts'
import { parseModuleXml } from './moodle/module-xml.ts'

const HEAD_BYTES = 8

export async function openBackup(blob: Blob): Promise<ParsedBackup> {
  const session = await openBackupSession(blob)
  return await session.backup
}

export interface BackupSession {
  readonly backup: Promise<ParsedBackup>
  /** Reads a raw archive entry (e.g. files/<2hex>/<sha1>) after parsing. */
  readEntry(name: string): Promise<Uint8Array>
  close(): Promise<void>
}

/**
 * Opens a backup and keeps the archive reader alive so callers can fetch
 * entry payloads lazily (activity XML, binary content) — the viewer uses
 * this for on-demand content rendering.
 */
export async function openBackupSession(blob: Blob): Promise<BackupSession> {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer())
  const format = detectFormat(head)

  let reader: ArchiveReader
  switch (format) {
    case 'zip':
      reader = FflateZipReader.open(new Uint8Array(await blob.arrayBuffer()))
      break
    case 'targz':
      reader = await TarGzReader.open(blob)
      break
    default:
      throw new MbzParseError('Unrecognized backup container: expected ZIP or TAR.GZ (.mbz)')
  }

  return {
    backup: parseBackupFrom(reader),
    readEntry: (name) => reader.readEntry(name),
    close: () => reader.close(),
  }
}

async function parseBackupFrom(reader: ArchiveReader): Promise<ParsedBackup> {
  const warnings: ParsedBackup['warnings'] = []

  const backupXmlBytes = await safeReadEntry(reader, 'moodle_backup.xml')
  if (!backupXmlBytes) {
    throw new MbzParseError('moodle_backup.xml not found — not a Moodle 2.x+ backup')
  }
  const decoder = new TextDecoder('utf-8')
  const backupXml = decoder.decode(backupXmlBytes)
  const {
    course: courseRef,
    sections: sectionRefs,
    activities,
    includesUserData,
  } = await parseMoodleBackupXml(backupXml, warnings)

  // Richer course metadata lives in course/course.xml (verified on REPO-004).
  const course = await withFallbackCourse(reader, decoder, courseRef)

  // Per-section details: number/name/summary + activity ordering.
  const sectionDetails = new Map<number, Awaited<ReturnType<typeof parseSectionXml>>>()
  for (const ref of sectionRefs) {
    if (!Number.isFinite(ref.id)) continue
    const bytes = await safeReadEntry(reader, `sections/section_${ref.id}/section.xml`)
    if (!bytes) {
      warnings.push({
        code: 'section-xml-missing',
        message: `sections/section_${ref.id}/section.xml is missing`,
        detail: `Section "${ref.name}" keeps metadata from moodle_backup.xml`,
      })
      continue
    }
    sectionDetails.set(ref.id, await parseSectionXml(decoder.decode(bytes)))
  }

  // Per-activity module.xml settings (visible/completion/availability…).
  for (const activity of activities) {
    if (!Number.isFinite(activity.id) || activity.moduleName === '') continue
    const bytes = await safeReadEntry(
      reader,
      `activities/${activity.moduleName}_${activity.id}/module.xml`,
    )
    if (!bytes) continue
    try {
      const settings = await parseModuleXml(decoder.decode(bytes))
      ;(activity as { settings?: unknown }).settings = settings
    } catch {
      warnings.push({
        code: 'module-xml-malformed',
        message: `Could not parse module.xml for ${activity.moduleName} #${activity.id}`,
      })
    }
  }

  // files.xml index (Q-003); missing files.xml is a warning, not an error.
  const filesBytes = await safeReadEntry(reader, 'files.xml')
  const files = filesBytes
    ? await parseFilesXml(decoder.decode(filesBytes))
    : emptyFilesWithWarning(warnings)

  // A delegated section (Moodle 4.5+ mod_subsection) names its owner by
  // *instance* id, which only the activity payload carries — moodle_backup.xml
  // and module.xml both know the course-module id instead.
  const owners = new Map<string, number>()
  const delegating = new Set(
    [...sectionDetails.values()]
      .map((d) => d.component)
      .filter((c) => c !== '')
      .map((c) => c.replace(/^mod_/, '')),
  )
  for (const activity of activities) {
    if (!delegating.has(activity.moduleName) || !Number.isFinite(activity.id)) continue
    const dir = `activities/${activity.moduleName}_${activity.id}`
    const bytes = await safeReadEntry(reader, `${dir}/${activity.moduleName}.xml`)
    if (!bytes) continue
    const instanceId = Number(
      /<activity\s[^>]*\bid="(\d+)"/.exec(decoder.decode(bytes))?.[1] ?? Number.NaN,
    )
    if (Number.isFinite(instanceId)) {
      owners.set(`mod_${activity.moduleName}:${instanceId}`, activity.id)
    }
  }

  const sections = assembleSections(sectionRefs, sectionDetails, activities, owners)
  return {
    format: reader.format,
    includesUserData,
    course,
    sections,
    activities,
    files,
    warnings,
  }
}

function emptyFilesWithWarning(warnings: ParsedBackup['warnings']) {
  warnings.push({
    code: 'files-xml-missing',
    message: 'files.xml not found; file index is empty',
  })
  return new Map<string, import('./model/backup.ts').BackupFileRecord>()
}

async function withFallbackCourse(
  reader: ArchiveReader,
  decoder: TextDecoder,
  fallback: ParsedBackup['course'],
): Promise<ParsedBackup['course']> {
  const bytes = await safeReadEntry(reader, 'course/course.xml')
  if (!bytes) return fallback
  try {
    return await parseCourseXml(decoder.decode(bytes), fallback)
  } catch {
    return fallback
  }
}

/**
 * Merge moodle_backup.xml section list with per-section detail. Activities
 * are attached by <sectionid> and ordered by the section's <sequence> when
 * present, otherwise document order.
 */
function assembleSections(
  refs: SectionInfo[],
  details: Map<number, Awaited<ReturnType<typeof parseSectionXml>>>,
  activities: ParsedBackup['activities'],
  owners: ReadonlyMap<string, number>,
): SectionInfo[] {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const out: SectionInfo[] = []
  for (const ref of refs) {
    const d = details.get(ref.id)
    const ordered: number[] = []
    const pushActivity = (id: number): void => {
      if (byId.has(id) && !ordered.includes(id)) ordered.push(id)
    }
    if (d) {
      for (const id of d.sequence) pushActivity(id)
    }
    for (const a of activities) {
      if (a.sectionId === ref.id) pushActivity(a.id)
    }
    const number = d?.number ?? ref.number
    // moodle_backup.xml titles an unnamed section with its own number
    // (PRDV103 section 579: <number>0</number>, <title>0</title>, and a name
    // of $@NULL@$ in section.xml). That is a placeholder, not a name — and
    // only ever consulted when section.xml gave us nothing, so a section
    // genuinely named "1" (SMR_SOR) still keeps its name.
    const detailName = d?.name ?? ''
    const refName = ref.name === String(number) ? '' : ref.name
    const owner =
      d && d.component !== '' && Number.isFinite(d.itemId)
        ? owners.get(`${d.component}:${d.itemId}`)
        : undefined
    out.push({
      ...ref,
      number,
      name: detailName !== '' ? detailName : refName,
      summary: '',
      activityIds: ordered,
      ...(d && d.component !== ''
        ? { delegatedTo: { component: d.component, activityId: owner ?? Number.NaN } }
        : {}),
    })
  }
  return out
}

/** Reads one entry defensively; returns undefined instead of failing hard. */
async function safeReadEntry(reader: ArchiveReader, name: string): Promise<Uint8Array | undefined> {
  try {
    return await reader.readEntry(name)
  } catch (e) {
    if (e instanceof MbzParseError && /not found/i.test(e.message)) return undefined
    throw e
  }
}
