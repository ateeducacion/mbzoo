/**
 * MBZ Doctor scan. Rules live in catalog.ts. Question conversion lives in
 * questions.ts. Nothing here writes the caller's Blob (ADR-0037).
 */

import { LazyZipReader } from '../archive/lazy-zip-reader.ts'
import type { ArchiveEntryInfo, ArchiveReader } from '../archive/reader.ts'
import { detectFormat } from '../archive/reader.ts'
import { TarGzReader } from '../archive/targz-reader.ts'
import { MbzParseError } from '../model/backup.ts'
import { contentHashPath } from '../moodle/activity-xml.ts'
import { parseSectionXml } from '../moodle/course-xml.ts'
import { parseFilesXml } from '../moodle/files-xml.ts'
import { legacyModule } from '../moodle/legacy-modules.ts'
import { BACKUP_LINK_TOKEN, decodeBackupLink } from '../moodle/links.ts'
import { parseUsersXml } from '../moodle/users-xml.ts'
import { MAX_XML_BYTES, parseXmlEvents } from '../moodle/xml.ts'
import { countIllegalXmlChars, crc32, decodeUtf8, sha1Hex, stripIllegalXmlChars } from './bytes.ts'
import { LIMITATIONS, makeFinding } from './catalog.ts'
import { said } from './evidence.ts'
import { type NamedXml, planQuestions } from './questions.ts'
import { aliasContentHashes, planMissingMetadata, planUnwrap, recoverMisplaced } from './restore.ts'
import type {
  ArchiveEditStep,
  BackupFacts,
  DiagnosticReport,
  DoctorOptions,
  Evidence,
  Finding,
  RepairPlan,
  RepairStep,
} from './types.ts'
import { randomRestorePath, targetAtLeast, targetIsOlder } from './versions.ts'
import {
  ancestorNamed,
  childNamed,
  leafOf,
  previewEdit,
  scanElements,
  spliceRanges,
  type XmlEl,
} from './xml-span.ts'

export interface Inspection {
  readonly report: DiagnosticReport
  readonly steps: readonly RepairStep[]
  readonly archiveEdits: readonly ArchiveEditStep[]
}

const CORE_MODULES = new Set([
  'assign',
  'bigbluebuttonbn',
  'book',
  'choice',
  'data',
  'feedback',
  'folder',
  'forum',
  'glossary',
  'h5pactivity',
  'imscp',
  'label',
  'lesson',
  'lti',
  'page',
  'quiz',
  'resource',
  'scorm',
  'subsection',
  'url',
  'wiki',
  'workshop',
])

const PACKAGE_MODULES = new Set(['scorm', 'h5pactivity', 'hvp'])

export async function analyzeBackup(
  blob: Blob,
  options: DoctorOptions = {},
): Promise<DiagnosticReport> {
  return (await inspect(blob, options)).report
}

export async function inspect(blob: Blob, options: DoctorOptions = {}): Promise<Inspection> {
  const filename = options.filename ?? 'backup.mbz'
  const targetRelease = options.targetRelease?.trim() ?? ''
  const hashBudget = options.hashBudgetBytes ?? 8 * 1024 * 1024
  const findings: Finding[] = []
  const steps: RepairStep[] = []
  const archiveEdits: ArchiveEditStep[] = []
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  const format = detectFormat(head)
  const facts: MutableFacts = {
    filename,
    format: format === 'unknown' ? 'unknown' : format,
    bytes: blob.size,
    moodleRelease: '',
    moodleVersion: '',
    backupVersion: '',
    backupDate: '',
    courseName: '',
    sections: 0,
    activities: 0,
    questionCategories: 0,
    questions: 0,
    fileRecords: 0,
    includesUserData: undefined,
    includesFiles: undefined,
    targetRelease,
  }

  const finish = (): Inspection => ({
    report: {
      generatedAt: options.now ?? new Date().toISOString(),
      facts: freezeFacts(facts),
      findings,
      limitations: LIMITATIONS,
      moodleRestoreVerified: false,
    },
    steps,
    archiveEdits,
  })

  if (format === 'unknown') {
    findings.push(
      makeFinding('archive.unreadable', {
        id: 'archive.unreadable',
        evidence: [said('archive.no-signature')],
      }),
    )
    return finish()
  }
  if (extensionMismatch(filename, format)) {
    findings.push(
      makeFinding('archive.extension', {
        id: 'archive.extension',
        evidence: [
          said('archive.container', { filename, format: format === 'zip' ? 'ZIP' : 'gzip' }),
        ],
        params: { format },
      }),
    )
  }

  let reader: ArchiveReader
  try {
    reader = format === 'zip' ? await LazyZipReader.open(blob) : await TarGzReader.open(blob)
  } catch (error) {
    findings.push(
      makeFinding('archive.unreadable', {
        id: 'archive.unreadable',
        evidence: [error instanceof Error ? { detail: error.message } : said('archive.not-opened')],
      }),
    )
    return finish()
  }

  try {
    options.onProgress?.(1, 6, 'list')
    throwIfAborted(options)
    const notes = reader.anomalies()
    if (notes.unsafeNames.length > 0) {
      findings.push(
        makeFinding('archive.unsafe-path', {
          id: 'archive.unsafe-path',
          evidence: notes.unsafeNames.slice(0, 8).map((name) => ({ detail: name })),
          params: { count: notes.unsafeNames.length },
        }),
      )
    }
    if (notes.duplicateNames.length > 0) {
      findings.push(
        makeFinding('archive.duplicate-path', {
          id: 'archive.duplicate-path',
          evidence: notes.duplicateNames.slice(0, 8).map((name) => ({ detail: name })),
          params: { count: notes.duplicateNames.length },
        }),
      )
    }
    if (notes.checksumFailures.length > 0) {
      findings.push(
        makeFinding('archive.checksum', {
          id: 'archive.checksum',
          evidence: notes.checksumFailures.slice(0, 8).map((name) => ({ detail: name })),
          params: { count: notes.checksumFailures.length },
        }),
      )
    }

    const entries = await reader.listEntries()
    const byName = new Map(entries.map((entry) => [entry.name, entry]))
    const manifests = entries.filter(
      (entry) => entry.name === 'moodle_backup.xml' || entry.name.endsWith('/moodle_backup.xml'),
    )
    if (manifests.length === 0) {
      findings.push(
        makeFinding('archive.missing-root', {
          id: 'archive.missing-root',
          evidence: [said('archive.no-manifest')],
        }),
      )
      return finish()
    }
    if (manifests.length > 1) {
      findings.push(
        makeFinding('archive.multiple-roots', {
          id: 'archive.multiple-roots',
          evidence: manifests
            .slice(0, 8)
            .map((entry) => ({ entry: entry.name, detail: entry.name })),
          params: { count: manifests.length },
        }),
      )
      return finish()
    }
    const manifestEntry = manifests[0]
    if (!manifestEntry) return finish()
    const prefix =
      manifestEntry.name === 'moodle_backup.xml'
        ? ''
        : manifestEntry.name.slice(0, -'moodle_backup.xml'.length)
    if (prefix !== '') {
      findings.push(
        makeFinding('archive.enclosed', {
          id: 'archive.enclosed',
          evidence: [
            {
              entry: manifestEntry.name,
              ...said('archive.manifest-at', { entry: manifestEntry.name }),
            },
          ],
        }),
      )
    }

    noteRatios(entries, findings)
    options.onProgress?.(2, 6, 'manifest')
    const manifestText = await readXml(reader, manifestEntry, hashBudget, findings, steps, options)
    if (manifestText === undefined) return finish()
    // A forbidden control character makes saxes reject the file. Strip a copy
    // for the rest of the scan so one character does not hide every other finding.
    // The repair still edits the original bytes.
    let structural = manifestText
    if (!(await wellFormed(structural))) {
      const stripped = stripIllegalXmlChars(structural)
      if (stripped !== structural && (await wellFormed(stripped))) {
        structural = stripped
      } else {
        findings.push(
          makeFinding('xml.malformed', {
            id: `xml.malformed:${manifestEntry.name}`,
            evidence: [{ entry: manifestEntry.name, ...said('xml.manifest-malformed') }],
          }),
        )
        applyManifestFacts(facts, readManifest(structural))
        return finish()
      }
    }

    const manifest = readManifest(structural)
    applyManifestFacts(facts, manifest)

    if (targetRelease === '') {
      findings.push(makeFinding('metadata.no-target', { id: 'metadata.no-target' }))
    } else {
      const older = targetIsOlder(targetRelease, manifest.moodleRelease || manifest.backupRelease)
      if (older === true) {
        findings.push(
          makeFinding('metadata.target-older', {
            id: 'metadata.target-older',
            evidence: [
              said('metadata.target-older', {
                release: manifest.moodleRelease || manifest.backupRelease,
                target: targetRelease,
              }),
            ],
            params: { target: targetRelease },
          }),
        )
      }
    }

    const releaseForPath = manifest.backupRelease || manifest.moodleRelease
    const path = randomRestorePath(releaseForPath, manifest.backupVersion)

    options.onProgress?.(3, 6, 'structure')
    const sectionXml = new Map<number, string>()
    for (const section of manifest.sections) {
      throwIfAborted(options)
      const name = `${prefix}sections/section_${section.id}/section.xml`
      const entry = byName.get(name)
      if (!entry) {
        findings.push(
          makeFinding('sections.missing', {
            id: `sections.missing:${section.id}`,
            evidence: [{ entry: name, ...said('sections.missing', { sectionId: section.id }) }],
            params: { sectionId: section.id },
          }),
        )
        continue
      }
      const text = await readXml(reader, entry, hashBudget, findings, steps, options)
      if (text === undefined) continue
      if (!(await wellFormed(text))) {
        findings.push(malformed(name))
        continue
      }
      sectionXml.set(section.id, text)
    }
    await noteSectionCycles(sectionXml, findings)

    const activityIds = new Set<number>()
    const seenActivity = new Map<number, number>()
    const declaredDirs = new Set<string>()
    const sectionIds = new Set(manifest.sections.map((section) => section.id))
    for (const activity of manifest.activities) {
      if (!Number.isFinite(activity.id)) continue
      seenActivity.set(activity.id, (seenActivity.get(activity.id) ?? 0) + 1)
      activityIds.add(activity.id)
      if (activity.moduleName === '') continue
      const dir = `${prefix}activities/${activity.moduleName}_${activity.id}/`
      declaredDirs.add(dir)
      const hasAny = entries.some((entry) => entry.name.startsWith(dir))
      if (!hasAny) {
        findings.push(
          makeFinding('activities.missing', {
            id: `activities.missing:${activity.id}`,
            evidence: [
              {
                entry: dir,
                ...said('activities.missing', {
                  module: activity.moduleName,
                  activityId: activity.id,
                }),
              },
            ],
            activityId: activity.id,
            params: { module: activity.moduleName },
          }),
        )
      } else if (!byName.has(`${dir}module.xml`)) {
        findings.push(
          makeFinding('activities.missing-module', {
            id: `activities.missing-module:${activity.id}`,
            evidence: [{ entry: `${dir}module.xml`, ...said('activities.missing-module') }],
            activityId: activity.id,
          }),
        )
      }
      // A missing directory and a bad section reference are independent faults.
      if (Number.isFinite(activity.sectionId) && !sectionIds.has(activity.sectionId)) {
        findings.push(
          makeFinding('activities.bad-section', {
            id: `activities.bad-section:${activity.id}`,
            evidence: [
              said('activities.bad-section', {
                module: activity.moduleName,
                activityId: activity.id,
                sectionId: activity.sectionId,
              }),
            ],
            activityId: activity.id,
            params: { sectionId: activity.sectionId },
          }),
        )
      }
    }
    const duplicateActivities = [...seenActivity.entries()].filter(([, count]) => count > 1)
    if (duplicateActivities.length > 0) {
      findings.push(
        makeFinding('activities.duplicate', {
          id: 'activities.duplicate',
          evidence: duplicateActivities.slice(0, 8).map(([id, count]) => ({
            activityId: id,
            ...said('activities.duplicate', { activityId: id, count }),
          })),
          params: { count: duplicateActivities.length },
        }),
      )
    }
    const presentDirs = new Set<string>()
    for (const entry of entries) {
      const match = /^activities\/([^/]+)_(\d+)\//.exec(
        prefix === '' ? entry.name : entry.name.slice(prefix.length),
      )
      if (!match?.[1] || !match[2]) continue
      presentDirs.add(`${prefix}activities/${match[1]}_${match[2]}/`)
    }
    for (const dir of presentDirs) {
      if (declaredDirs.has(dir)) continue
      findings.push(
        makeFinding('activities.undeclared', {
          id: `activities.undeclared:${dir}`,
          evidence: [{ entry: dir, ...said('activities.undeclared', { entry: dir }) }],
        }),
      )
    }

    notePlugins(manifest.activities, targetRelease, findings)

    options.onProgress?.(4, 6, 'files')
    const presentComponents = await scanFiles(
      reader,
      byName,
      prefix,
      manifest.includesFiles,
      hashBudget,
      facts,
      findings,
      steps,
      archiveEdits,
      options,
    )
    await scanCrc(reader, entries, hashBudget, findings, options)

    options.onProgress?.(5, 6, 'questions')
    const questionFiles: NamedXml[] = []
    const activityFiles: NamedXml[] = []
    const linkTexts: { name: string; xml: string }[] = []
    for (const entry of entries) {
      throwIfAborted(options)
      const relative =
        prefix === ''
          ? entry.name
          : entry.name.startsWith(prefix)
            ? entry.name.slice(prefix.length)
            : ''
      if (relative === '') continue
      const isQuestions = relative === 'questions.xml' || relative.endsWith('/questions.xml')
      const isActivityXml = relative.startsWith('activities/') && relative.endsWith('.xml')
      const isCourse = relative === 'course/course.xml'
      if (!isQuestions && !isActivityXml && !isCourse) continue
      const text = await readXml(reader, entry, hashBudget, findings, steps, options)
      if (text === undefined) continue
      if (!(await wellFormed(text))) {
        findings.push(malformed(entry.name))
        continue
      }
      if (isCourse || isActivityXml) linkTexts.push({ name: entry.name, xml: text })
      if (isQuestions) questionFiles.push({ name: entry.name, xml: text })
      if (isActivityXml) {
        const activityId = activityIdFromPath(relative)
        activityFiles.push({
          name: entry.name,
          xml: text,
          ...(activityId !== undefined ? { activityId } : {}),
        })
      }
    }
    for (const [id, xml] of sectionXml)
      linkTexts.push({ name: `sections/section_${id}/section.xml`, xml })

    const planned = planQuestions(
      questionFiles,
      activityFiles,
      path,
      targetRelease,
      manifest.backupRelease,
      manifest.moodleVersion,
    )
    findings.push(...planned.findings)
    steps.push(...planned.steps)
    facts.questionCategories = planned.categories
    facts.questions = planned.questions
    noteLinks(linkTexts, activityIds, findings)
    notePackages(manifest.activities, manifest.includesFiles, presentComponents, findings)

    if (manifest.includesUsers === false) {
      findings.push(makeFinding('userdata.excluded', { id: 'userdata.excluded' }))
    } else if (manifest.includesUsers === true) {
      const usersEntry = byName.get(`${prefix}users.xml`)
      if (!usersEntry) {
        findings.push(
          makeFinding('userdata.missing', {
            id: 'userdata.missing',
            evidence: [{ entry: `${prefix}users.xml`, ...said('userdata.missing') }],
          }),
        )
      } else {
        const usersText = await readXml(reader, usersEntry, hashBudget, findings, steps, options)
        if (usersText !== undefined) {
          try {
            await parseUsersXml(usersText)
          } catch {
            findings.push(
              makeFinding('userdata.malformed', {
                id: 'userdata.malformed',
                evidence: [{ entry: usersEntry.name, ...said('userdata.malformed') }],
              }),
            )
          }
        }
      }
    }

    const unwrap = planUnwrap(entries, prefix, findings)
    if (unwrap) {
      const enclosed = findings.findIndex((finding) => finding.id === 'archive.enclosed')
      if (enclosed >= 0) findings.splice(enclosed, 1)
      findings.push(unwrap.finding)
      archiveEdits.push(unwrap.edit)
    }
    const metadata = await planMissingMetadata({
      reader,
      entries,
      prefix,
      hashBudget,
      options,
      existing: findings,
    })
    findings.push(...metadata.findings)
    archiveEdits.push(...metadata.edits)

    options.onProgress?.(6, 6, 'done')
    return finish()
  } finally {
    await reader.close()
  }
}

interface ManifestActivity {
  readonly id: number
  readonly sectionId: number
  readonly moduleName: string
  readonly title: string
}

interface Manifest {
  readonly courseName: string
  readonly moodleRelease: string
  readonly moodleVersion: string
  readonly backupVersion: string
  readonly backupRelease: string
  readonly backupDate: string
  readonly includesUsers: boolean | undefined
  readonly includesFiles: boolean | undefined
  readonly sections: readonly { readonly id: number; readonly title: string }[]
  readonly activities: readonly ManifestActivity[]
}

function readManifest(xml: string): Manifest {
  const elements = scanElements(xml)
  const course = elements.find((el) => el.name === 'course' && el.end > 0)
  const sections = elements
    .filter((el) => el.name === 'section' && ancestorNamed(elements, el, 'sections') && el.end > 0)
    .map((el) => ({
      id: finiteId(leafOf(xml, elements, el, 'sectionid')),
      title: leafOf(xml, elements, el, 'title'),
    }))
    .filter((section) => Number.isFinite(section.id))
  const activities = elements
    .filter(
      (el) => el.name === 'activity' && ancestorNamed(elements, el, 'activities') && el.end > 0,
    )
    .map((el) => ({
      id: finiteId(leafOf(xml, elements, el, 'moduleid')),
      sectionId: finiteId(leafOf(xml, elements, el, 'sectionid')),
      moduleName: leafOf(xml, elements, el, 'modulename'),
      title: leafOf(xml, elements, el, 'title'),
    }))
    .filter((activity) => Number.isFinite(activity.id))
  let includesUsers: boolean | undefined
  let includesFiles: boolean | undefined
  for (const setting of elements) {
    if (setting.name !== 'setting' || setting.end < 0) continue
    if (leafOf(xml, elements, setting, 'level') !== 'root') continue
    const name = leafOf(xml, elements, setting, 'name')
    const value = leafOf(xml, elements, setting, 'value')
    const flag = value === '1' ? true : value === '0' ? false : undefined
    if (name === 'users') includesUsers = flag
    if (name === 'files') includesFiles = flag
  }
  return {
    courseName: course ? leafOf(xml, elements, course, 'title') : '',
    moodleRelease: firstLeaf(xml, elements, 'moodle_release'),
    moodleVersion: firstLeaf(xml, elements, 'moodle_version'),
    backupVersion: firstLeaf(xml, elements, 'backup_version'),
    backupRelease: firstLeaf(xml, elements, 'backup_release'),
    backupDate: firstLeaf(xml, elements, 'backup_date'),
    includesUsers,
    includesFiles,
    sections,
    activities,
  }
}

/** Empty text is not section 0. `Number('')` is 0. */
function finiteId(value: string): number {
  if (value.trim() === '') return Number.NaN
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : Number.NaN
}

function applyManifestFacts(facts: MutableFacts, manifest: Manifest): void {
  facts.courseName = manifest.courseName
  facts.moodleRelease = manifest.moodleRelease
  facts.moodleVersion = manifest.moodleVersion
  facts.backupVersion = manifest.backupVersion
  facts.backupDate = formatBackupDate(manifest.backupDate)
  facts.sections = manifest.sections.length
  facts.activities = manifest.activities.length
  facts.includesUserData = manifest.includesUsers
  facts.includesFiles = manifest.includesFiles
}

function firstLeaf(xml: string, elements: readonly XmlEl[], name: string): string {
  const el = elements.find(
    (candidate) => candidate.name === name && candidate.end > candidate.start,
  )
  if (!el) return ''
  return leafOf(xml, elements, ancestorOrSelf(elements, el), name)
}

function ancestorOrSelf(elements: readonly XmlEl[], el: XmlEl): XmlEl {
  const parent = el.parent >= 0 ? elements[el.parent] : undefined
  return parent ?? el
}

async function noteSectionCycles(
  sectionXml: ReadonlyMap<number, string>,
  findings: Finding[],
): Promise<void> {
  const numberById = new Map<number, number>()
  const parentNumber = new Map<number, number>()
  for (const [id, xml] of sectionXml) {
    const parsed = await parseSectionXml(xml)
    if (parsed.number !== undefined) numberById.set(id, parsed.number)
    const parent = parsed.formatOptions.get('parent')
    if (parent === undefined || parent === '') continue
    const value = Number(parent)
    if (Number.isFinite(value)) parentNumber.set(id, value)
  }
  const idByNumber = new Map<number, number>()
  for (const [id, number] of numberById) if (!idByNumber.has(number)) idByNumber.set(number, id)
  const cyclic: number[] = []
  for (const [id, parentNum] of parentNumber) {
    const seen = new Set<number>([id])
    let current = idByNumber.get(parentNum)
    while (current !== undefined) {
      if (seen.has(current)) {
        cyclic.push(id)
        break
      }
      seen.add(current)
      const next = parentNumber.get(current)
      if (next === undefined) break
      current = idByNumber.get(next)
    }
  }
  if (cyclic.length === 0) return
  findings.push(
    makeFinding('sections.cycle', {
      id: 'sections.cycle',
      evidence: cyclic.slice(0, 8).map((id) => said('sections.cycle', { sectionId: id })),
      params: { count: cyclic.length },
    }),
  )
}

function notePlugins(
  activities: readonly ManifestActivity[],
  targetRelease: string,
  findings: Finding[],
): void {
  const seen = new Set<string>()
  for (const activity of activities) {
    const name = activity.moduleName.toLowerCase()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    const removed = legacyModule(name)
    if (removed) {
      const stillThere =
        targetRelease !== '' && targetAtLeast(targetRelease, removed.removedIn) === false
      findings.push(
        makeFinding('plugins.removed', {
          id: `plugins.removed:${name}`,
          ...(stillThere ? { severity: 'info' as const } : {}),
          ...(stillThere
            ? {
                explanation: `${name} was removed from Moodle core in ${removed.removedIn} (${removed.issue}). The selected target ${targetRelease} is older, so that release still includes it. The activity XML is unchanged.`,
              }
            : {}),
          evidence: [
            {
              activityId: activity.id,
              moduleName: name,
              ...said('plugins.removed', { removedIn: removed.removedIn, issue: removed.issue }),
            },
          ],
          activityId: activity.id,
          params: { module: name, removedIn: removed.removedIn },
        }),
      )
      continue
    }
    if (!CORE_MODULES.has(name)) {
      findings.push(
        makeFinding('plugins.unknown-module', {
          id: `plugins.unknown-module:${name}`,
          evidence: [
            {
              activityId: activity.id,
              moduleName: name,
              ...said('plugins.not-core-module', { module: name }),
            },
          ],
          activityId: activity.id,
          params: { module: name },
        }),
      )
    }
  }
}

async function scanFiles(
  reader: ArchiveReader,
  byName: ReadonlyMap<string, ArchiveEntryInfo>,
  prefix: string,
  includesFiles: boolean | undefined,
  hashBudget: number,
  facts: MutableFacts,
  findings: Finding[],
  steps: RepairStep[],
  archiveEdits: ArchiveEditStep[],
  options: DoctorOptions,
): Promise<Set<string>> {
  const presentComponents = new Set<string>()
  const name = `${prefix}files.xml`
  const entry = byName.get(name)
  if (!entry) return presentComponents
  const xml = await readXml(reader, entry, hashBudget, findings, steps, options)
  if (xml === undefined) return presentComponents
  if (!(await wellFormed(xml))) {
    findings.push(malformed(name))
    return presentComponents
  }
  let records: Awaited<ReturnType<typeof parseFilesXml>>
  try {
    records = await parseFilesXml(xml)
  } catch {
    findings.push(malformed(name))
    return presentComponents
  }
  facts.fileRecords = records.size
  if (includesFiles === false) {
    findings.push(makeFinding('files.excluded', { id: 'files.excluded' }))
  }
  const aliases = aliasContentHashes(xml)
  const referenced = new Set<string>()
  const pending = new Map<string, string[]>()
  const mismatched: Evidence[] = []
  const skipped: string[] = []
  const sized = new Set<string>()
  for (const record of records.values()) {
    throwIfAborted(options)
    if (record.fileName === '.' || record.fileName === '') continue
    const hash = record.contentHash.toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(hash)) continue
    referenced.add(hash)
    const path = `${prefix}${contentHashPath(hash)}`
    const fileEntry = byName.get(path)
    if (!fileEntry) {
      if (includesFiles === false || aliases.has(hash)) continue
      const label = `${record.component}/${record.fileArea}/${record.fileName} (${hash.slice(0, 8)})`
      const labels = pending.get(hash) ?? []
      labels.push(label)
      pending.set(hash, labels)
      continue
    }
    presentComponents.add(record.component)
    if (fileEntry.uncompressedSize > hashBudget) {
      skipped.push(path)
      continue
    }
    const bytes = await reader.readEntry(path)
    const actual = await sha1Hex(bytes)
    if (actual !== hash) {
      mismatched.push(said('files.hash', { entry: path, hash: actual.slice(0, 8) }))
      continue
    }
    if (record.fileSize === bytes.byteLength || sized.has(hash)) continue
    sized.add(hash)
    const id = `files.size:${hash}`
    const repair = sizeRepair(name, xml, hash, bytes.byteLength)
    findings.push(
      makeFinding('files.size', {
        id,
        evidence: [
          {
            entry: path,
            ...said('files.size', { declared: record.fileSize, actual: bytes.byteLength }),
          },
        ],
        params: { hash, size: bytes.byteLength },
        repair,
      }),
    )
    steps.push({
      id,
      order: 20,
      entry: name,
      safety: 'automatic',
      apply: (text) => rewriteDeclaredSize(text, hash, bytes.byteLength),
    })
  }
  if (pending.size > 0) {
    const recovered = await recoverMisplaced({
      reader,
      entries: [...byName.values()],
      prefix,
      missing: pending,
      hashBudget,
      options,
    })
    findings.push(...recovered.findings)
    archiveEdits.push(...recovered.edits)
  }
  if (mismatched.length > 0) {
    findings.push(
      makeFinding('files.hash', {
        id: 'files.hash',
        evidence: mismatched.slice(0, 8),
        params: { count: mismatched.length },
      }),
    )
  }
  if (skipped.length > 0) {
    findings.push(
      makeFinding('files.hash-skipped', {
        id: 'files.hash-skipped',
        evidence: skipped.slice(0, 8).map((detail) => ({ detail })),
        params: { count: skipped.length },
      }),
    )
  }
  const unreferenced: string[] = []
  for (const [entryName] of byName) {
    const relative =
      prefix === '' ? entryName : entryName.startsWith(prefix) ? entryName.slice(prefix.length) : ''
    const match = /^files\/[0-9a-f]{2}\/([0-9a-f]{40})$/.exec(relative)
    const hash = match?.[1]
    if (!hash || referenced.has(hash)) continue
    unreferenced.push(entryName)
  }
  if (unreferenced.length > 0) {
    findings.push(
      makeFinding('files.unreferenced', {
        id: 'files.unreferenced',
        evidence: unreferenced.slice(0, 8).map((detail) => ({ entry: detail, detail })),
        params: { count: unreferenced.length },
      }),
    )
  }
  return presentComponents
}

function sizeRepair(entry: string, xml: string, hash: string, size: number): RepairPlan {
  const after = rewriteDeclaredSize(xml, hash, size)
  return {
    id: `files.size:${hash}`,
    safety: 'automatic',
    summary: `Set the declared size of ${hash.slice(0, 8)} to ${size} bytes.`,
    transforms: [
      `Replace the filesize text for content hash ${hash} with ${size}. The bytes stay as they are.`,
    ],
    contentLoss: false,
    reversible: true,
    why: 'The SHA-1 of the stored bytes matches the content hash, so the directory size is the value that disagrees.',
    entries: [entry],
    preview: [previewEdit(entry, xml, after)],
  }
}

export function rewriteDeclaredSize(xml: string, contentHash: string, size: number): string {
  const elements = scanElements(xml)
  const ranges: { start: number; end: number; replacement: string }[] = []
  for (const file of elements) {
    if (file.name !== 'file' || file.end < 0) continue
    if (leafOf(xml, elements, file, 'contenthash').toLowerCase() !== contentHash) continue
    const filename = leafOf(xml, elements, file, 'filename')
    if (filename === '.' || filename === '') continue
    const sizeEl = childNamed(elements, file, 'filesize')
    if (!sizeEl || sizeEl.innerEnd < sizeEl.innerStart) continue
    if (leafOf(xml, elements, file, 'filesize') === String(size)) continue
    ranges.push({ start: sizeEl.innerStart, end: sizeEl.innerEnd, replacement: String(size) })
  }
  if (ranges.length === 0) return xml
  return spliceRanges(xml, ranges)
}

async function scanCrc(
  reader: ArchiveReader,
  entries: readonly ArchiveEntryInfo[],
  hashBudget: number,
  findings: Finding[],
  options: DoctorOptions,
): Promise<void> {
  const bad: string[] = []
  for (const entry of entries) {
    if (entry.crc32 === undefined || entry.uncompressedSize === 0) continue
    if (entry.uncompressedSize > hashBudget) continue
    throwIfAborted(options)
    const bytes = await reader.readEntry(entry.name)
    if (crc32(bytes) !== entry.crc32) bad.push(entry.name)
  }
  if (bad.length === 0) return
  findings.push(
    makeFinding('archive.crc', {
      id: 'archive.crc',
      evidence: bad.slice(0, 8).map((name) => ({ entry: name, detail: name })),
      params: { count: bad.length },
    }),
  )
}

function noteRatios(entries: readonly ArchiveEntryInfo[], findings: Finding[]): void {
  const hot = entries.filter((entry) => {
    const compressed = entry.compressedSize
    if (compressed === undefined || compressed <= 0) return false
    return entry.uncompressedSize >= 8 * 1024 * 1024 && entry.uncompressedSize / compressed > 100
  })
  if (hot.length === 0) return
  findings.push(
    makeFinding('archive.ratio', {
      id: 'archive.ratio',
      evidence: hot.slice(0, 8).map((entry) => ({
        entry: entry.name,
        ...said('archive.ratio', {
          entry: entry.name,
          compressed: entry.compressedSize ?? 0,
          uncompressed: entry.uncompressedSize,
        }),
      })),
      params: { count: hot.length },
    }),
  )
}

function noteLinks(
  texts: readonly { name: string; xml: string }[],
  activityIds: ReadonlySet<number>,
  findings: Finding[],
): void {
  const evidence: Evidence[] = []
  const seen = new Set<string>()
  for (const file of texts) {
    const re = new RegExp(BACKUP_LINK_TOKEN.source, 'g')
    for (const match of file.xml.matchAll(re)) {
      const token = match[0]
      if (!token || seen.has(token)) continue
      const link = decodeBackupLink(token)
      if (!link || link.moduleId === undefined) continue
      if (activityIds.has(link.moduleId)) continue
      seen.add(token)
      evidence.push({
        entry: file.name,
        ...said('references.token', { moduleId: link.moduleId }),
      })
      if (evidence.length >= 12) break
    }
  }
  if (evidence.length === 0) return
  findings.push(
    makeFinding('references.token', {
      id: 'references.token',
      evidence,
      params: { count: evidence.length },
    }),
  )
}

function notePackages(
  activities: readonly ManifestActivity[],
  includesFiles: boolean | undefined,
  presentComponents: ReadonlySet<string>,
  findings: Finding[],
): void {
  if (includesFiles === false) return
  for (const activity of activities) {
    if (!PACKAGE_MODULES.has(activity.moduleName)) continue
    if (presentComponents.has(`mod_${activity.moduleName}`)) continue
    findings.push(
      makeFinding('embedded.package', {
        id: `embedded.package:${activity.id}`,
        evidence: [
          {
            activityId: activity.id,
            moduleName: activity.moduleName,
            ...said('embedded.no-bytes', { module: activity.moduleName, activityId: activity.id }),
          },
        ],
        activityId: activity.id,
      }),
    )
  }
}

async function readXml(
  reader: ArchiveReader,
  entry: ArchiveEntryInfo,
  hashBudget: number,
  findings: Finding[],
  steps: RepairStep[],
  options: DoctorOptions,
): Promise<string | undefined> {
  if (entry.uncompressedSize > MAX_XML_BYTES || entry.uncompressedSize > hashBudget) {
    findings.push(
      makeFinding('xml.limit', {
        id: `xml.limit:${entry.name}`,
        evidence: [
          {
            entry: entry.name,
            ...said('xml.size', { entry: entry.name, bytes: entry.uncompressedSize }),
          },
        ],
      }),
    )
    return undefined
  }
  throwIfAborted(options)
  const bytes = await reader.readEntry(entry.name)
  const text = decodeUtf8(bytes)
  if (text === undefined) {
    findings.push(
      makeFinding('xml.utf8', {
        id: `xml.utf8:${entry.name}`,
        evidence: [{ entry: entry.name, ...said('xml.utf8', { entry: entry.name }) }],
      }),
    )
    return undefined
  }
  const illegal = countIllegalXmlChars(text)
  if (illegal > 0) {
    const id = `xml.illegal-chars:${entry.name}`
    const after = stripIllegalXmlChars(text)
    const repair: RepairPlan = {
      id,
      safety: 'confirmation-required',
      summary: `Remove ${illegal} illegal XML control character${illegal === 1 ? '' : 's'} from ${entry.name}.`,
      transforms: [
        'Delete XML 1.0-forbidden control characters. Tab, line feed and carriage return stay. No other bytes change.',
      ],
      contentLoss: true,
      reversible: true,
      why: 'A strict XML parser stops on the first forbidden code point. The surrounding markup is kept.',
      entries: [entry.name],
      preview: [previewEdit(entry.name, text, after)],
    }
    findings.push(
      makeFinding('xml.illegal-chars', {
        id,
        evidence: [
          {
            entry: entry.name,
            ...said(illegal === 1 ? 'xml.illegal-char' : 'xml.illegal-chars', { count: illegal }),
          },
        ],
        params: { count: illegal },
        repair,
      }),
    )
    steps.push({
      id,
      order: 10,
      entry: entry.name,
      safety: 'confirmation-required',
      apply: (xml) => stripIllegalXmlChars(xml),
    })
  }
  return text
}

async function wellFormed(xml: string): Promise<boolean> {
  try {
    await parseXmlEvents(xml, () => {})
    return true
  } catch {
    return false
  }
}

function malformed(entry: string): Finding {
  return makeFinding('xml.malformed', {
    id: `xml.malformed:${entry}`,
    evidence: [{ entry, ...said('xml.malformed', { entry }) }],
  })
}

function activityIdFromPath(relative: string): number | undefined {
  const match = /^activities\/[^/]+_(\d+)\//.exec(relative)
  const id = Number(match?.[1])
  return Number.isSafeInteger(id) ? id : undefined
}

function extensionMismatch(filename: string, format: 'zip' | 'targz'): boolean {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.mbz')) return false
  if (format === 'zip') return !lower.endsWith('.zip')
  return !(lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.gz'))
}

function formatBackupDate(raw: string): string {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return raw
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return raw
  return date.toISOString().slice(0, 10)
}

function throwIfAborted(options: DoctorOptions): void {
  if (options.signal?.aborted) throw new MbzParseError('Repair cancelled')
}

interface MutableFacts {
  filename: string
  format: BackupFacts['format']
  bytes: number
  moodleRelease: string
  moodleVersion: string
  backupVersion: string
  backupDate: string
  courseName: string
  sections: number
  activities: number
  questionCategories: number
  questions: number
  fileRecords: number
  includesUserData: boolean | undefined
  includesFiles: boolean | undefined
  targetRelease: string
}

function freezeFacts(facts: MutableFacts): BackupFacts {
  return {
    filename: facts.filename,
    format: facts.format,
    bytes: facts.bytes,
    moodleRelease: facts.moodleRelease,
    moodleVersion: facts.moodleVersion,
    backupVersion: facts.backupVersion,
    backupDate: facts.backupDate,
    courseName: facts.courseName,
    sections: facts.sections,
    activities: facts.activities,
    questionCategories: facts.questionCategories,
    questions: facts.questions,
    fileRecords: facts.fileRecords,
    ...(facts.includesUserData !== undefined
      ? { includesUserData: facts.includesUserData }
      : { includesUserData: undefined }),
    ...(facts.includesFiles !== undefined
      ? { includesFiles: facts.includesFiles }
      : { includesFiles: undefined }),
    targetRelease: facts.targetRelease,
  }
}
