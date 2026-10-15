/**
 * Apply selected repairs to a new archive. The input Blob is never written
 * (ADR-0037, ADR-0038). A failed check throws before the caller receives a Blob.
 */

import { LazyZipReader } from '../archive/lazy-zip-reader.ts'
import type { ArchiveReader } from '../archive/reader.ts'
import { detectFormat } from '../archive/reader.ts'
import type { ArchiveRewritePlan } from '../archive/rewrite.ts'
import { rewriteArchive } from '../archive/rewrite.ts'
import { TarGzReader } from '../archive/targz-reader.ts'
import { MbzParseError } from '../model/backup.ts'
import { inspect } from './analyze.ts'
import { decodeUtf8, encodeUtf8, sameBytes, sha1Hex } from './bytes.ts'
import { REBUILD_BLOCKERS } from './policy.ts'
import type {
  AppliedRepair,
  ArchiveEditStep,
  DoctorOptions,
  RepairOutcome,
  RepairStep,
} from './types.ts'

export interface ApplyOptions extends DoctorOptions {
  /** Required when any selected repair is confirmation-required. */
  readonly confirmed?: boolean
}

export async function applyRepairs(
  blob: Blob,
  selectedIds: readonly string[],
  options: ApplyOptions = {},
): Promise<RepairOutcome> {
  if (selectedIds.length === 0) {
    throw new MbzParseError('No repairs selected. The original file was not modified.')
  }
  const before = await inspect(blob, options)
  if (before.report.findings.some((finding) => REBUILD_BLOCKERS.has(finding.ruleId))) {
    throw new MbzParseError(
      'Repair refused because the archive is not safe to rebuild. The original file was not modified.',
    )
  }
  const wanted = new Set(selectedIds)
  const steps = before.steps.filter((step) => wanted.has(step.id))
  const edits = before.archiveEdits.filter((step) => wanted.has(step.id))
  const available = new Set<string>([
    ...steps.map((step) => step.id),
    ...edits.map((step) => step.id),
  ])
  const skipped = selectedIds.filter((id) => !available.has(id))
  if (steps.length === 0 && edits.length === 0) {
    throw new MbzParseError(
      'Selected repairs are not available on this backup. The original file was not modified.',
    )
  }
  const needsConfirmation = [...steps, ...edits].some(
    (step) => step.safety === 'confirmation-required',
  )
  if (needsConfirmation && options.confirmed !== true) {
    throw new MbzParseError(
      'This repair changes backup content and needs confirmation. The original file was not modified.',
    )
  }

  const plan = await buildPlan(blob, steps, edits, options)
  if (
    (plan.replacements?.size ?? 0) === 0 &&
    (plan.additions?.size ?? 0) === 0 &&
    (plan.renames?.size ?? 0) === 0 &&
    (plan.omit?.size ?? 0) === 0
  ) {
    throw new MbzParseError('Selected repairs made no changes. The original file was not modified.')
  }
  const output = await rewriteArchive(blob, plan, options)
  try {
    await verify(blob, output, plan)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Post-repair validation failed'
    throw new MbzParseError(`${message} The original file was not modified.`, { cause: error })
  }
  const after = await inspect(output, options)
  const appliedIds = [...available]
  for (const id of appliedIds) {
    if (after.report.findings.some((finding) => finding.id === id && finding.repair)) {
      throw new MbzParseError(
        `Repair ${id} did not clear the finding. The original file was not modified.`,
      )
    }
  }
  const applied: AppliedRepair[] = appliedIds.map((id) => ({
    id,
    entries: entriesFor(id, steps, edits),
  }))
  return {
    blob: output,
    before: before.report,
    after: after.report,
    applied,
    skipped,
    note: 'Archive and structural validation passed. Successful restoration in Moodle has not been verified.',
  }
}

async function buildPlan(
  blob: Blob,
  steps: readonly RepairStep[],
  edits: readonly ArchiveEditStep[],
  options: ApplyOptions,
): Promise<ArchiveRewritePlan> {
  const strips = [
    ...new Set(edits.map((step) => step.stripPrefix).filter((prefix) => prefix !== '')),
  ]
  if (strips.length > 1) {
    throw new MbzParseError(
      'Selected repairs unwrap different directories. The original file was not modified.',
    )
  }
  const strip = strips[0] ?? ''
  const replacements = steps.length > 0 ? await editedEntries(blob, steps, options) : new Map()
  const additions = new Map<string, Uint8Array>()
  for (const step of edits) {
    for (const addition of step.additions) {
      const dest = strip !== '' ? addition.logicalPath : `${step.placeUnder}${addition.logicalPath}`
      const previous = additions.get(dest)
      if (previous && !sameBytes(previous, addition.data)) {
        throw new MbzParseError(
          `Two repairs add different bytes at ${dest}. The original file was not modified.`,
        )
      }
      additions.set(dest, addition.data)
    }
  }
  if (strip === '') {
    return {
      replacements,
      ...(additions.size > 0 ? { additions } : {}),
    }
  }
  const reader = await openReader(blob)
  try {
    const renames = new Map<string, string>()
    const omit = new Set<string>()
    for (const entry of await reader.listEntries()) {
      if (options.signal?.aborted) throw new MbzParseError('Repair cancelled')
      if (!entry.name.startsWith(strip)) {
        throw new MbzParseError(
          `Unwrap prefix does not cover ${entry.name}. The original file was not modified.`,
        )
      }
      const dest = entry.name.slice(strip.length)
      if (dest === '') {
        omit.add(entry.name)
        continue
      }
      renames.set(entry.name, dest)
    }
    return {
      replacements,
      renames,
      ...(additions.size > 0 ? { additions } : {}),
      ...(omit.size > 0 ? { omit } : {}),
    }
  } finally {
    await reader.close()
  }
}

function entriesFor(
  id: string,
  steps: readonly RepairStep[],
  edits: readonly ArchiveEditStep[],
): string[] {
  return [
    ...new Set([
      ...steps.filter((step) => step.id === id).map((step) => step.entry),
      ...edits.filter((step) => step.id === id).flatMap((step) => step.entries),
    ]),
  ]
}

async function editedEntries(
  blob: Blob,
  steps: readonly RepairStep[],
  options: ApplyOptions,
): Promise<Map<string, Uint8Array>> {
  const reader = await openReader(blob)
  try {
    const byEntry = new Map<string, RepairStep[]>()
    for (const step of steps) {
      const list = byEntry.get(step.entry) ?? []
      list.push(step)
      byEntry.set(step.entry, list)
    }
    const replacements = new Map<string, Uint8Array>()
    for (const [entry, list] of byEntry) {
      if (options.signal?.aborted) throw new MbzParseError('Repair cancelled')
      list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      const original = decodeUtf8(await reader.readEntry(entry))
      if (original === undefined) throw new MbzParseError(`Cannot edit ${entry}: not valid UTF-8`)
      let xml = original
      for (const step of list) xml = step.apply(xml)
      if (xml !== original) replacements.set(entry, encodeUtf8(xml))
    }
    return replacements
  } finally {
    await reader.close()
  }
}

async function verify(source: Blob, output: Blob, plan: ArchiveRewritePlan): Promise<void> {
  const replacements = plan.replacements ?? new Map<string, Uint8Array>()
  const additions = plan.additions ?? new Map<string, Uint8Array>()
  const renames = plan.renames ?? new Map<string, string>()
  const omit = plan.omit ?? new Set<string>()
  const sourceReader = await openReader(source)
  const outputReader = await openReader(output)
  try {
    const sourceEntries = await sourceReader.listEntries()
    const outputNames = new Set((await outputReader.listEntries()).map((entry) => entry.name))
    const expected = new Set<string>()
    for (const entry of sourceEntries) {
      if (omit.has(entry.name)) {
        const bytes = await sourceReader.readEntry(entry.name)
        if (bytes.byteLength !== 0) {
          throw new MbzParseError(`Repaired archive omitted a non-empty entry: ${entry.name}`)
        }
        continue
      }
      const name = renames.get(entry.name) ?? entry.name
      expected.add(name)
      if (!outputNames.has(name)) throw new MbzParseError(`Repaired archive dropped ${entry.name}`)
      const planned = replacements.get(entry.name) ?? (await sourceReader.readEntry(entry.name))
      const actual = await outputReader.readEntry(name)
      if (!sameBytes(planned, actual)) {
        throw new MbzParseError(`Repaired entry does not match the planned bytes: ${name}`)
      }
    }
    for (const [name, data] of additions) {
      expected.add(name)
      if (!outputNames.has(name)) throw new MbzParseError(`Repaired archive is missing ${name}`)
      const actual = await outputReader.readEntry(name)
      if (!sameBytes(data, actual)) {
        throw new MbzParseError(`Added entry does not match the planned bytes: ${name}`)
      }
      const pool = /^files\/[0-9a-f]{2}\/([0-9a-f]{40})$/.exec(name)
      if (pool?.[1] && (await sha1Hex(actual)) !== pool[1]) {
        throw new MbzParseError(`Recovered payload hash does not match ${name}`)
      }
    }
    if (outputNames.size !== expected.size) {
      throw new MbzParseError('Repaired archive does not have the planned entries')
    }
    for (const name of outputNames) {
      if (!expected.has(name)) throw new MbzParseError(`Repaired archive added unexpected ${name}`)
    }
  } finally {
    await sourceReader.close()
    await outputReader.close()
  }
}

async function openReader(blob: Blob): Promise<ArchiveReader> {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  const format = detectFormat(head)
  if (format === 'zip') return LazyZipReader.open(blob)
  if (format === 'targz') return TarGzReader.open(blob)
  throw new MbzParseError('Unrecognized backup container: expected ZIP or TAR.GZ (.mbz)')
}
