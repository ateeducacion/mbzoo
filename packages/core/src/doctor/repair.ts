/**
 * Apply selected repairs to a new archive. The input Blob is never written
 * (ADR-0037). A failed check throws before the caller receives a Blob.
 */
import { LazyZipReader } from '../archive/lazy-zip-reader.ts'
import type { ArchiveReader } from '../archive/reader.ts'
import { detectFormat } from '../archive/reader.ts'
import { rewriteArchive } from '../archive/rewrite.ts'
import { TarGzReader } from '../archive/targz-reader.ts'
import { MbzParseError } from '../model/backup.ts'
import { inspect } from './analyze.ts'
import { decodeUtf8, encodeUtf8, sameBytes } from './bytes.ts'
import type { AppliedRepair, DoctorOptions, RepairOutcome, RepairStep } from './types.ts'

const BLOCKING = new Set([
  'archive.unreadable',
  'archive.unsafe-path',
  'archive.duplicate-path',
  'archive.checksum',
  'archive.crc',
  'archive.missing-root',
  'archive.multiple-roots',
])

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
  if (before.report.findings.some((finding) => BLOCKING.has(finding.ruleId))) {
    throw new MbzParseError(
      'Repair refused because the archive is not safe to rebuild. The original file was not modified.',
    )
  }
  const wanted = new Set(selectedIds)
  const steps = before.steps.filter((step) => wanted.has(step.id))
  const skipped = selectedIds.filter((id) => !steps.some((step) => step.id === id))
  if (steps.length === 0) {
    throw new MbzParseError(
      'Selected repairs are not available on this backup. The original file was not modified.',
    )
  }
  if (steps.some((step) => step.safety === 'confirmation-required') && options.confirmed !== true) {
    throw new MbzParseError(
      'This repair changes backup content and needs confirmation. The original file was not modified.',
    )
  }

  const replacements = await editedEntries(blob, steps, options)
  if (replacements.size === 0) {
    throw new MbzParseError('Selected repairs made no changes. The original file was not modified.')
  }
  const output = await rewriteArchive(blob, replacements, options)
  try {
    await verify(blob, output, replacements)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Post-repair validation failed'
    throw new MbzParseError(`${message} The original file was not modified.`, { cause: error })
  }
  const after = await inspect(output, options)
  const appliedIds = [...new Set(steps.map((step) => step.id))]
  for (const id of appliedIds) {
    if (after.report.findings.some((finding) => finding.id === id && finding.repair)) {
      throw new MbzParseError(
        `Repair ${id} did not clear the finding. The original file was not modified.`,
      )
    }
  }
  const applied: AppliedRepair[] = appliedIds.map((id) => ({
    id,
    entries: [...new Set(steps.filter((step) => step.id === id).map((step) => step.entry))],
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

async function verify(
  source: Blob,
  output: Blob,
  replacements: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  const sourceReader = await openReader(source)
  const outputReader = await openReader(output)
  try {
    const sourceEntries = await sourceReader.listEntries()
    const outputNames = new Set((await outputReader.listEntries()).map((entry) => entry.name))
    if (outputNames.size !== sourceEntries.length) {
      throw new MbzParseError('Repaired archive does not have the same entries')
    }
    for (const entry of sourceEntries) {
      if (!outputNames.has(entry.name)) {
        throw new MbzParseError(`Repaired archive dropped ${entry.name}`)
      }
      const expected = replacements.get(entry.name) ?? (await sourceReader.readEntry(entry.name))
      const actual = await outputReader.readEntry(entry.name)
      if (!sameBytes(expected, actual)) {
        throw new MbzParseError(`Repaired entry does not match the planned bytes: ${entry.name}`)
      }
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
