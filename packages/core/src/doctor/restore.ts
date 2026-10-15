/**
 * Moodle restore repairs that copy or add bytes without inventing records
 * (ADR-0038, AN-010). Empty roles.xml and questions.xml stay
 * confirmation-required: a live Moodle restore of those documents has not
 * been run (TASK-017).
 */
import type { ArchiveEntryInfo, ArchiveReader } from '../archive/reader.ts'
import { sanitizeTarName } from '../archive/targz-reader.ts'
import { MbzParseError } from '../model/backup.ts'
import { contentHashPath } from '../moodle/activity-xml.ts'
import { MAX_XML_BYTES, parseXmlEvents } from '../moodle/xml.ts'
import { decodeUtf8, encodeUtf8, sha1Hex, stripIllegalXmlChars } from './bytes.ts'
import { makeFinding } from './catalog.ts'
import { REBUILD_BLOCKERS } from './policy.ts'
import type { ArchiveEditStep, DoctorOptions, Finding, RepairPlan } from './types.ts'
import { ancestorNamed, decodeEntities, leafOf, scanElements, type XmlEl } from './xml-span.ts'

/** Root written by `backup_final_roles_structure_step` when no roles exist. */
export const EMPTY_ROLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<roles_definition>
</roles_definition>
`

/** Root written by `backup_questions_structure_step` when the bank is empty. */
export const EMPTY_QUESTIONS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<question_categories>
</question_categories>
`

const QUESTION_TAGS = new Set([
  'questionid',
  'question_reference',
  'question_set_reference',
  'question_instance',
  'question_category',
  'questionref',
  'question',
])

const NOT_ALIAS = new Set(['', '0', '$@NULL@$'])

export interface UnwrapPlan {
  readonly finding: Finding
  readonly edit: ArchiveEditStep
}

export function planUnwrap(
  entries: readonly { readonly name: string }[],
  prefix: string,
  findings: readonly Finding[],
): UnwrapPlan | undefined {
  if (!safeWrapperPrefix(prefix)) return undefined
  if (findings.some((finding) => REBUILD_BLOCKERS.has(finding.ruleId))) return undefined
  const destinations = new Set<string>()
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) return undefined
    const dest = entry.name.slice(prefix.length)
    if (!safeRelative(dest) || destinations.has(dest)) return undefined
    destinations.add(dest)
  }
  if (destinations.size === 0) return undefined
  const samples = entries.slice(0, 8)
  const id = 'archive.unwrap-root'
  const repair: RepairPlan = {
    id,
    safety: 'automatic',
    summary: `Move ${entries.length} entries out of ${prefix}.`,
    transforms: [
      `Rename ${entries.length} entries by removing the prefix ${prefix}.`,
      'XML and file bytes are copied unchanged.',
      'No entry outside that directory is dropped, because none was present.',
    ],
    contentLoss: false,
    reversible: true,
    why: 'Moodle reads moodle_backup.xml at the archive root. One manifest sits under a single directory and every other entry shares that directory, so stripping the prefix does not choose among backups or discard a file.',
    entries: samples.map((entry) => entry.name),
    preview: [
      ...samples.map((entry) => ({
        entry: entry.name.slice(prefix.length),
        before: entry.name,
        after: entry.name.slice(prefix.length),
      })),
      ...(entries.length > samples.length
        ? [
            {
              entry: prefix,
              before: `${entries.length - samples.length} further paths stay under ${prefix}`,
              after: `${entries.length - samples.length} further paths move with the same suffix`,
            },
          ]
        : []),
    ],
  }
  return {
    finding: makeFinding('archive.unwrap-root', {
      id,
      evidence: samples.map((entry) => ({
        entry: entry.name,
        detail: `${entry.name} would become ${entry.name.slice(prefix.length)}`,
      })),
      params: { count: entries.length, prefix },
      repair,
    }),
    edit: {
      id,
      order: 40,
      safety: 'automatic',
      entries: samples.map((entry) => entry.name),
      stripPrefix: prefix,
      additions: [],
      omit: [],
      placeUnder: prefix,
    },
  }
}

export function aliasContentHashes(xml: string): Set<string> {
  const elements = scanElements(xml)
  const alias = new Set<string>()
  const physical = new Set<string>()
  for (const file of elements) {
    if (file.name !== 'file' || file.end < 0) continue
    const hash = leafOf(xml, elements, file, 'contenthash').toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(hash)) continue
    const filename = leafOf(xml, elements, file, 'filename')
    if (filename === '.' || filename === '') continue
    const repositoryId = leafOf(xml, elements, file, 'repositoryid')
    if (NOT_ALIAS.has(repositoryId)) physical.add(hash)
    else alias.add(hash)
  }
  for (const hash of physical) alias.delete(hash)
  return alias
}

export async function recoverMisplaced(input: {
  readonly reader: ArchiveReader
  readonly entries: readonly ArchiveEntryInfo[]
  readonly prefix: string
  readonly missing: ReadonlyMap<string, readonly string[]>
  readonly hashBudget: number
  readonly options: DoctorOptions
}): Promise<{ findings: Finding[]; edits: ArchiveEditStep[] }> {
  const findings: Finding[] = []
  const edits: ArchiveEditStep[] = []
  const hashed = new Map<string, string>()
  const incomplete: string[] = []
  const stillMissing: string[] = []
  for (const [hash, labels] of input.missing) {
    const found = await findPayload(input, hash, hashed)
    if (found.status === 'incomplete') {
      incomplete.push(
        `${labels[0] ?? hash.slice(0, 8)}: ${found.unchecked} entr${found.unchecked === 1 ? 'y was' : 'ies were'} above the hash budget`,
      )
      continue
    }
    if (found.status === 'missing') {
      stillMissing.push(labels[0] ?? hash.slice(0, 8))
      continue
    }
    const canonical = `${input.prefix}${contentHashPath(hash)}`
    const id = `files.recover:${hash}`
    const repair: RepairPlan = {
      id,
      safety: 'automatic',
      summary: `Copy verified bytes for ${hash.slice(0, 8)} to ${contentHashPath(hash)}.`,
      transforms: [
        `Copy ${found.bytes.byteLength} bytes from ${found.source} to ${canonical}.`,
        'The original entry stays. files.xml is not rewritten.',
      ],
      contentLoss: false,
      reversible: true,
      why: 'backup_file_manager::get_backup_content_file_location looks up files/<2 hex>/<sha1>. Another entry in this archive hashes to the contenthash files.xml already declares, and the canonical path is absent.',
      entries: [found.source, canonical],
      preview: [
        {
          entry: canonical,
          before: '(not in the archive)',
          after: `Copy ${found.bytes.byteLength} bytes from ${found.source}. SHA-1 ${hash}.`,
        },
      ],
    }
    findings.push(
      makeFinding('files.recover-misplaced-content', {
        id,
        evidence: [
          {
            entry: found.source,
            detail: `${labels[0] ?? hash.slice(0, 8)} matches ${found.source}`,
          },
        ],
        params: { hash, bytes: found.bytes.byteLength },
        repair,
      }),
    )
    edits.push({
      id,
      order: 45,
      safety: 'automatic',
      entries: [found.source],
      stripPrefix: '',
      additions: [{ logicalPath: contentHashPath(hash), data: found.bytes }],
      omit: [],
      placeUnder: input.prefix,
    })
  }
  if (stillMissing.length > 0) {
    findings.push(
      makeFinding('files.missing', {
        id: 'files.missing',
        evidence: stillMissing.slice(0, 8).map((detail) => ({ detail })),
        params: { count: stillMissing.length },
      }),
    )
  }
  if (incomplete.length > 0) {
    findings.push(
      makeFinding('files.recovery-incomplete', {
        id: 'files.recovery-incomplete',
        evidence: incomplete.slice(0, 8).map((detail) => ({ detail })),
        params: { count: incomplete.length },
        confidence: 'medium',
      }),
    )
  }
  return { findings, edits }
}

export async function planMissingMetadata(input: {
  readonly reader: ArchiveReader
  readonly entries: readonly ArchiveEntryInfo[]
  readonly prefix: string
  readonly hashBudget: number
  readonly options: DoctorOptions
  readonly existing: readonly Finding[]
}): Promise<{ findings: Finding[]; edits: ArchiveEditStep[] }> {
  const findings: Finding[] = []
  const edits: ArchiveEditStep[] = []
  const scanned = await scanXml(input, findings)
  const rolesPath = `${input.prefix}roles.xml`
  const questionsPath = `${input.prefix}questions.xml`
  const rolesFile = scanned.files.find((file) => file.name === rolesPath)
  const questionsFile = scanned.files.find((file) => file.name === questionsPath)
  const rolesPresent = input.entries.some((entry) => entry.name === rolesPath)
  const questionsPresent = input.entries.some((entry) => entry.name === questionsPath)

  if (!rolesPresent) {
    const referenced = scanned.files.some((file) => xmlMentionsRole(file.xml))
    pushEmptyDocument(findings, edits, {
      id: 'metadata.create-empty-roles',
      ruleId: 'metadata.missing-roles',
      logicalPath: 'roles.xml',
      placeUnder: input.prefix,
      xml: EMPTY_ROLES_XML,
      referenced,
      complete: scanned.complete,
      referencedDetail: 'A scanned XML file names a role id. The definition is not invented.',
      incompleteDetail:
        'Not every XML file could be scanned, so an empty roles.xml is not created.',
      summary: 'Add an empty roles_definition document.',
    })
  } else if (rolesFile && rootElement(rolesFile.xml) !== 'roles_definition') {
    findings.push(
      makeFinding('metadata.missing-roles', {
        id: 'metadata.missing-roles',
        repairability: 'manual',
        evidence: [
          {
            entry: rolesPath,
            detail: `roles.xml root is ${rootElement(rolesFile.xml) || '(none)'}; Moodle expects roles_definition`,
          },
        ],
      }),
    )
  }

  if (!questionsPresent) {
    const referenced = scanned.files.some((file) => xmlDependsOnQuestions(file.xml))
    pushEmptyDocument(findings, edits, {
      id: 'questions.create-empty-bank',
      ruleId: 'questions.missing-bank-file',
      logicalPath: 'questions.xml',
      placeUnder: input.prefix,
      xml: EMPTY_QUESTIONS_XML,
      referenced,
      complete: scanned.complete,
      referencedDetail:
        'A scanned XML file references the question bank. No category or question is invented.',
      incompleteDetail:
        'Not every XML file could be scanned, so an empty questions.xml is not created.',
      summary: 'Add an empty question_categories document.',
    })
  } else if (questionsFile && rootElement(questionsFile.xml) !== 'question_categories') {
    findings.push(
      makeFinding('questions.missing-bank-file', {
        id: 'questions.missing-bank-file',
        repairability: 'manual',
        evidence: [
          {
            entry: questionsPath,
            detail: `questions.xml root is ${rootElement(questionsFile.xml) || '(none)'}; Moodle expects question_categories`,
          },
        ],
      }),
    )
  }

  if (scanned.complete) {
    noteUnknownContexts(scanned.files, findings)
    noteInforef(scanned.files, findings)
  }
  return { findings, edits }
}

function pushEmptyDocument(
  findings: Finding[],
  edits: ArchiveEditStep[],
  spec: {
    readonly id: string
    readonly ruleId: 'metadata.missing-roles' | 'questions.missing-bank-file'
    readonly logicalPath: string
    readonly placeUnder: string
    readonly xml: string
    readonly referenced: boolean
    readonly complete: boolean
    readonly referencedDetail: string
    readonly incompleteDetail: string
    readonly summary: string
  },
): void {
  const entry = `${spec.placeUnder}${spec.logicalPath}`
  if (!spec.complete || spec.referenced) {
    findings.push(
      makeFinding(spec.ruleId, {
        id: spec.ruleId,
        severity: spec.referenced ? 'critical' : 'warning',
        repairability: 'not-repairable',
        confidence: spec.complete ? 'high' : 'medium',
        evidence: [
          {
            entry,
            detail: spec.referenced ? spec.referencedDetail : spec.incompleteDetail,
          },
        ],
      }),
    )
    return
  }
  const why =
    spec.ruleId === 'metadata.missing-roles'
      ? 'restore_dbops::load_roles_to_tempids throws missing_roles_xml_file when roles.xml is absent. backup_final_roles_structure_step writes an empty roles_definition element when there are no roles. No scanned file names a role id. A live Moodle restore of this document has not been run (TASK-017).'
      : 'restore_dbops::load_categories_and_questions_to_tempids throws missing_questions_xml_file when questions.xml is absent. backup_questions_structure_step writes an empty question_categories element when the bank is empty. No scanned file references the question bank. A live Moodle restore of this document has not been run (TASK-017).'
  const repair: RepairPlan = {
    id: spec.id,
    safety: 'confirmation-required',
    summary: spec.summary,
    transforms: [
      `Add ${entry} with the empty Moodle writer root.`,
      'No role, category, question, or permission is invented.',
    ],
    contentLoss: false,
    reversible: true,
    why,
    entries: [entry],
    preview: [{ entry, before: '', after: spec.xml }],
  }
  findings.push(
    makeFinding(spec.ruleId, {
      id: spec.id,
      repairability: 'confirmation-required',
      evidence: [{ entry, detail: `${entry} is absent and no scanned reference requires it` }],
      repair,
    }),
  )
  edits.push({
    id: spec.id,
    order: spec.ruleId === 'metadata.missing-roles' ? 50 : 51,
    safety: 'confirmation-required',
    entries: [entry],
    stripPrefix: '',
    additions: [{ logicalPath: spec.logicalPath, data: encodeUtf8(spec.xml) }],
    omit: [],
    placeUnder: spec.placeUnder,
  })
}

interface ScannedFile {
  readonly name: string
  readonly relative: string
  readonly xml: string
}

async function scanXml(
  input: {
    readonly reader: ArchiveReader
    readonly entries: readonly ArchiveEntryInfo[]
    readonly prefix: string
    readonly hashBudget: number
    readonly options: DoctorOptions
    readonly existing: readonly Finding[]
  },
  findings: Finding[],
): Promise<{ files: ScannedFile[]; complete: boolean }> {
  const files: ScannedFile[] = []
  let complete = true
  const ceiling = Math.min(input.hashBudget, MAX_XML_BYTES)
  for (const entry of input.entries) {
    if (input.options.signal?.aborted) throw new MbzParseError('Repair cancelled')
    const relative = relativeName(entry.name, input.prefix)
    if (!relative.endsWith('.xml')) continue
    if (entry.uncompressedSize > ceiling) {
      complete = false
      noteOnce(
        findings,
        input.existing,
        'xml.limit',
        entry.name,
        `${entry.name} is ${entry.uncompressedSize} bytes`,
      )
      continue
    }
    const text = decodeUtf8(await input.reader.readEntry(entry.name))
    if (text === undefined) {
      complete = false
      noteOnce(findings, input.existing, 'xml.utf8', entry.name, `${entry.name} is not valid UTF-8`)
      continue
    }
    const stripped = stripIllegalXmlChars(text)
    if (!(await wellFormed(text)) && !(stripped !== text && (await wellFormed(stripped)))) {
      complete = false
      noteOnce(
        findings,
        input.existing,
        'xml.malformed',
        entry.name,
        `${entry.name} is not well-formed`,
      )
      continue
    }
    files.push({ name: entry.name, relative, xml: stripped === text ? text : stripped })
  }
  return { files, complete }
}

function noteOnce(
  findings: Finding[],
  existing: readonly Finding[],
  ruleId: 'xml.limit' | 'xml.utf8' | 'xml.malformed',
  entry: string,
  detail: string,
): void {
  const id = `${ruleId}:${entry}`
  if (
    existing.some((finding) => finding.id === id) ||
    findings.some((finding) => finding.id === id)
  ) {
    return
  }
  findings.push(
    makeFinding(ruleId, {
      id,
      evidence: [{ entry, detail }],
    }),
  )
}

function noteUnknownContexts(files: readonly ScannedFile[], findings: Finding[]): void {
  const known = new Set<string>()
  for (const file of files) {
    if (file.relative === 'files.xml') continue
    for (const id of contextIdsOutsideFiles(file.xml)) known.add(id)
  }
  if (known.size === 0) return
  const filesXml = files.find((file) => file.relative === 'files.xml')
  if (!filesXml) return
  const elements = scanElements(filesXml.xml)
  const missing = new Map<string, string>()
  for (const file of elements) {
    if (file.name !== 'file' || file.end < 0) continue
    const filename = leafOf(filesXml.xml, elements, file, 'filename')
    if (filename === '.' || filename === '') continue
    const repositoryId = leafOf(filesXml.xml, elements, file, 'repositoryid')
    if (!NOT_ALIAS.has(repositoryId)) continue
    const contextId = leafOf(filesXml.xml, elements, file, 'contextid')
    if (!/^\d+$/.test(contextId) || known.has(contextId) || missing.has(contextId)) continue
    missing.set(
      contextId,
      `${filename} uses context ${contextId}, which no other scanned element declares`,
    )
  }
  if (missing.size === 0) return
  findings.push(
    makeFinding('references.unknown-context', {
      id: 'references.unknown-context',
      confidence: 'medium',
      evidence: [...missing.values()].slice(0, 8).map((detail) => ({ detail })),
      params: { count: missing.size },
    }),
  )
}

function noteInforef(files: readonly ScannedFile[], findings: Finding[]): void {
  const fileIds = new Set<string>()
  const questionIds = new Set<string>()
  const roleIds = new Set<string>()
  for (const file of files) {
    if (file.relative.endsWith('/inforef.xml') || file.relative === 'inforef.xml') continue
    if (file.relative === 'files.xml') {
      for (const id of attributeIds(file.xml, 'file')) fileIds.add(id)
    }
    if (file.relative === 'roles.xml') {
      for (const id of childIds(file.xml, 'role')) roleIds.add(id)
    }
    for (const id of questionElementIds(file.xml)) questionIds.add(id)
  }
  const missing: { entry: string; detail: string }[] = []
  const duplicates: { entry: string; detail: string }[] = []
  for (const file of files) {
    if (!(file.relative.endsWith('/inforef.xml') || file.relative === 'inforef.xml')) continue
    const groups: { group: string; item: string; known: ReadonlySet<string>; label: string }[] = [
      { group: 'fileref', item: 'file', known: fileIds, label: 'file' },
      { group: 'questionref', item: 'question', known: questionIds, label: 'question' },
      { group: 'roleref', item: 'role', known: roleIds, label: 'role' },
    ]
    for (const group of groups) {
      const ids = groupedIds(file.xml, group.group, group.item)
      const seen = new Set<string>()
      for (const id of ids) {
        if (seen.has(id)) {
          duplicates.push({
            entry: file.name,
            detail: `${group.label} id ${id} is repeated in ${file.relative}`,
          })
        }
        seen.add(id)
        if (!group.known.has(id)) {
          missing.push({
            entry: file.name,
            detail: `${group.label} id ${id} in ${file.relative} is not in this backup`,
          })
        }
      }
    }
  }
  if (missing.length > 0) {
    findings.push(
      makeFinding('references.inforef-missing-target', {
        id: 'references.inforef-missing-target',
        evidence: missing.slice(0, 8),
        params: { count: missing.length },
      }),
    )
  }
  if (duplicates.length > 0) {
    findings.push(
      makeFinding('references.inforef-duplicate', {
        id: 'references.inforef-duplicate',
        evidence: duplicates.slice(0, 8),
        params: { count: duplicates.length },
      }),
    )
  }
}

type PayloadHit =
  | { readonly status: 'found'; readonly source: string; readonly bytes: Uint8Array }
  | { readonly status: 'missing' }
  | { readonly status: 'incomplete'; readonly unchecked: number }

async function findPayload(
  input: {
    readonly reader: ArchiveReader
    readonly entries: readonly ArchiveEntryInfo[]
    readonly prefix: string
    readonly hashBudget: number
    readonly options: DoctorOptions
  },
  hash: string,
  hashed: Map<string, string>,
): Promise<PayloadHit> {
  const canonical = `${input.prefix}${contentHashPath(hash)}`
  let unchecked = 0
  for (const entry of input.entries) {
    if (input.options.signal?.aborted) throw new MbzParseError('Repair cancelled')
    if (entry.name === canonical) continue
    if (entry.uncompressedSize > input.hashBudget) {
      unchecked += 1
      continue
    }
    let actual = hashed.get(entry.name)
    let bytes: Uint8Array | undefined
    if (actual === undefined) {
      bytes = await input.reader.readEntry(entry.name)
      actual = await sha1Hex(bytes)
      hashed.set(entry.name, actual)
    }
    if (actual !== hash) continue
    return {
      status: 'found',
      source: entry.name,
      bytes: bytes ?? (await input.reader.readEntry(entry.name)),
    }
  }
  if (unchecked > 0) return { status: 'incomplete', unchecked }
  return { status: 'missing' }
}

function xmlMentionsRole(xml: string): boolean {
  const elements = scanElements(xml)
  for (const el of elements) {
    if (el.end < 0) continue
    if (el.name === 'roleid' && numericId(directText(xml, el))) return true
    if (el.name === 'id' && parentName(elements, el) === 'role' && numericId(directText(xml, el))) {
      return true
    }
  }
  return false
}

function xmlDependsOnQuestions(xml: string): boolean {
  const elements = scanElements(xml)
  return elements.some((el) => el.end >= 0 && QUESTION_TAGS.has(el.name))
}

function contextIdsOutsideFiles(xml: string): string[] {
  const elements = scanElements(xml)
  const ids: string[] = []
  for (const el of elements) {
    if (el.name === 'file' || ancestorNamed(elements, el, 'file')) continue
    const attr = el.attrs.contextid
    if (attr && /^\d+$/.test(attr)) ids.push(attr)
    if (el.name === 'contextid') {
      const text = directText(xml, el)
      if (/^\d+$/.test(text)) ids.push(text)
    }
  }
  return ids
}

function attributeIds(xml: string, name: string): string[] {
  const ids: string[] = []
  for (const el of scanElements(xml)) {
    if (el.name === name && el.attrs.id && /^\d+$/.test(el.attrs.id)) ids.push(el.attrs.id)
  }
  return ids
}

function childIds(xml: string, name: string): string[] {
  const elements = scanElements(xml)
  const ids: string[] = []
  for (const el of elements) {
    if (el.name !== name || el.end < 0) continue
    const id = leafOf(xml, elements, el, 'id') || el.attrs.id || ''
    if (/^\d+$/.test(id)) ids.push(id)
  }
  return ids
}

function questionElementIds(xml: string): string[] {
  const elements = scanElements(xml)
  const ids: string[] = []
  for (const el of elements) {
    if (el.name !== 'question' || el.end < 0) continue
    if (ancestorNamed(elements, el, 'questionref')) continue
    const id = el.attrs.id || leafOf(xml, elements, el, 'id')
    if (/^\d+$/.test(id)) ids.push(id)
  }
  return ids
}

function groupedIds(xml: string, group: string, item: string): string[] {
  const elements = scanElements(xml)
  const ids: string[] = []
  for (const el of elements) {
    if (el.name !== item || el.end < 0) continue
    if (parentName(elements, el) !== group && !ancestorNamed(elements, el, group)) continue
    const id = leafOf(xml, elements, el, 'id') || el.attrs.id || ''
    if (/^\d+$/.test(id)) ids.push(id)
  }
  return ids
}

function rootElement(xml: string): string {
  return scanElements(xml).find((el) => el.parent < 0 && el.name !== '')?.name ?? ''
}

function parentName(elements: readonly XmlEl[], el: XmlEl): string {
  if (el.parent < 0) return ''
  return elements[el.parent]?.name ?? ''
}

function directText(xml: string, el: XmlEl): string {
  if (el.innerEnd < el.innerStart) return ''
  const raw = xml.slice(el.innerStart, el.innerEnd)
  if (raw.includes('<')) return ''
  return decodeEntities(raw).trim()
}

function numericId(value: string): boolean {
  return /^\d+$/.test(value) && value !== '0'
}

function relativeName(name: string, prefix: string): string {
  if (prefix === '') return name
  return name.startsWith(prefix) ? name.slice(prefix.length) : ''
}

function safeWrapperPrefix(prefix: string): boolean {
  if (prefix === '' || !prefix.endsWith('/')) return false
  const segments = prefix.slice(0, -1).split('/')
  return (
    segments.length > 0 &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}

function safeRelative(name: string): boolean {
  if (name === '' || name.startsWith('/') || name.endsWith('/')) return false
  const segments = name.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
    return false
  return sanitizeTarName(name) === name
}

async function wellFormed(xml: string): Promise<boolean> {
  try {
    await parseXmlEvents(xml, () => {})
    return true
  } catch {
    return false
  }
}
