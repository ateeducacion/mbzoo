/**
 * Rebuild a Moodle backup as a new archive (ADR-0037, ADR-0038).
 *
 * The original Blob is never written. ZIP entries are stored uncompressed
 * via fflate ZipPassThrough (TECH-005): that class carries stored bytes, not
 * precompressed DEFLATE, so unchanged payloads stay byte-identical without
 * claiming ZipPassThrough can copy a deflate stream. TAR.GZ is a new ustar
 * stream plus gzip. Unsafe paths, duplicate names and tar checksum failures
 * refuse the rebuild rather than being silently dropped.
 *
 * A plan may replace an existing entry, add a new one, or rename a path.
 * An omitted path is written only when that entry is empty. Output names are
 * checked before any archive bytes are produced.
 */
import { gzipSync, Zip, ZipPassThrough } from 'fflate'
import { MbzParseError } from '../model/backup.ts'
import { LazyZipReader } from './lazy-zip-reader.ts'
import type { ArchiveEntryInfo, ArchiveReader } from './reader.ts'
import { detectFormat } from './reader.ts'
import { sanitizeTarName, TarGzReader } from './targz-reader.ts'

export interface RewriteOptions {
  readonly signal?: { readonly aborted: boolean }
  readonly onProgress?: (done: number, total: number, label: string) => void
}

/**
 * Edits applied while copying an archive. A Map passed to `rewriteArchive`
 * is still treated as replacements only, so existing callers keep working.
 */
export interface ArchiveRewritePlan {
  readonly replacements?: ReadonlyMap<string, Uint8Array>
  readonly additions?: ReadonlyMap<string, Uint8Array>
  readonly renames?: ReadonlyMap<string, string>
  /** Source paths left out of the output. Only an empty entry may be omitted. */
  readonly omit?: ReadonlySet<string>
}

/** Largest decompressed tar we will assemble for a repaired .mbz. */
const MAX_TAR_REWRITE_BYTES = 512 * 1024 * 1024

interface PlannedWrite {
  readonly name: string
  readonly sourceName?: string
  readonly inline?: Uint8Array
}

function isReplacementMap(
  value: ArchiveRewritePlan | ReadonlyMap<string, Uint8Array>,
): value is ReadonlyMap<string, Uint8Array> {
  return value instanceof Map
}

export async function rewriteArchive(
  source: Blob,
  planOrReplacements: ArchiveRewritePlan | ReadonlyMap<string, Uint8Array>,
  options: RewriteOptions = {},
): Promise<Blob> {
  const plan: ArchiveRewritePlan = isReplacementMap(planOrReplacements)
    ? { replacements: planOrReplacements }
    : planOrReplacements
  const head = new Uint8Array(await source.slice(0, 8).arrayBuffer())
  const format = detectFormat(head)
  if (format === 'zip') return rewriteZip(source, plan, options)
  if (format === 'targz') return rewriteTarGz(source, plan, options)
  throw new MbzParseError('Unrecognized backup container: expected ZIP or TAR.GZ (.mbz)')
}

async function rewriteZip(
  source: Blob,
  plan: ArchiveRewritePlan,
  options: RewriteOptions,
): Promise<Blob> {
  const reader = await LazyZipReader.open(source)
  try {
    const notes = reader.anomalies()
    if (notes.unsafeNames.length > 0 || notes.duplicateNames.length > 0) {
      throw new MbzParseError(
        'Refusing to rebuild a ZIP with unsafe paths or duplicate entry names',
      )
    }
    const planned = await planWrites(reader, await reader.listEntries(), plan, options)
    const chunks: Uint8Array[] = []
    const zip = new Zip()
    zip.ondata = (err, chunk) => {
      if (err) {
        throw err instanceof Error ? err : new MbzParseError('ZIP write failed', { cause: err })
      }
      if (chunk && chunk.byteLength > 0) chunks.push(chunk)
    }
    let done = 0
    for (const item of planned) {
      if (options.signal?.aborted) throw new MbzParseError('Repair cancelled')
      const bytes = item.inline ?? (await reader.readEntry(item.sourceName ?? item.name))
      const file = new ZipPassThrough(item.name)
      // Fixed mtime keeps a repair reproducible (fflate otherwise uses Date.now()).
      file.mtime = Date.UTC(2023, 10, 14)
      zip.add(file)
      file.push(owned(bytes), true)
      done += 1
      options.onProgress?.(done, planned.length, item.name)
    }
    zip.end()
    return new Blob(chunks.map((chunk) => copyBytes(chunk).buffer))
  } finally {
    await reader.close()
  }
}

async function rewriteTarGz(
  source: Blob,
  plan: ArchiveRewritePlan,
  options: RewriteOptions,
): Promise<Blob> {
  const reader = await TarGzReader.open(source)
  try {
    const notes = reader.anomalies()
    if (
      notes.unsafeNames.length > 0 ||
      notes.duplicateNames.length > 0 ||
      notes.checksumFailures.length > 0
    ) {
      throw new MbzParseError(
        'Refusing to rebuild a TAR.GZ with unsafe paths, duplicate names, or checksum errors',
      )
    }
    const planned = await planWrites(reader, await reader.listEntries(), plan, options)
    const parts: Uint8Array[] = []
    let total = 0
    const push = (part: Uint8Array): void => {
      total += part.byteLength
      if (total > MAX_TAR_REWRITE_BYTES) {
        throw new MbzParseError(
          'Repaired TAR.GZ would exceed the 512 MB rewrite buffer. The original file was not modified.',
        )
      }
      parts.push(part)
    }
    let done = 0
    for (const item of planned) {
      if (options.signal?.aborted) throw new MbzParseError('Repair cancelled')
      const bytes = item.inline ?? (await reader.readEntry(item.sourceName ?? item.name))
      push(tarHeader(item.name, bytes.byteLength))
      push(owned(bytes))
      const pad = (512 - (bytes.byteLength % 512)) % 512
      if (pad > 0) push(new Uint8Array(pad))
      done += 1
      options.onProgress?.(done, planned.length, item.name)
    }
    push(new Uint8Array(1024))
    const tarBytes = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      tarBytes.set(part, offset)
      offset += part.byteLength
    }
    return new Blob([gzipSync(tarBytes)])
  } finally {
    await reader.close()
  }
}

async function planWrites(
  reader: ArchiveReader,
  entries: readonly ArchiveEntryInfo[],
  plan: ArchiveRewritePlan,
  options: RewriteOptions,
): Promise<PlannedWrite[]> {
  const replacements = plan.replacements ?? new Map<string, Uint8Array>()
  const renames = plan.renames ?? new Map<string, string>()
  const additions = plan.additions ?? new Map<string, Uint8Array>()
  const omit = plan.omit ?? new Set<string>()
  const known = new Set(entries.map((entry) => entry.name))
  for (const name of replacements.keys()) {
    if (!known.has(name)) {
      throw new MbzParseError(`Replacement entry is not in the archive: ${name}`)
    }
  }
  for (const name of renames.keys()) {
    if (!known.has(name)) throw new MbzParseError(`Rename source is not in the archive: ${name}`)
  }
  for (const name of omit) {
    if (!known.has(name)) throw new MbzParseError(`Omitted entry is not in the archive: ${name}`)
    if (replacements.has(name) || renames.has(name)) {
      throw new MbzParseError(`Refusing to omit an entry that is also edited: ${name}`)
    }
  }

  const planned: PlannedWrite[] = []
  const used = new Set<string>()
  const claim = (name: string): void => {
    if (sanitizeTarName(name) !== name || name.endsWith('/')) {
      throw new MbzParseError(`Refusing archive output path: ${name}`)
    }
    if (used.has(name)) throw new MbzParseError(`Archive output path collides: ${name}`)
    used.add(name)
  }

  for (const entry of entries) {
    if (options.signal?.aborted) throw new MbzParseError('Repair cancelled')
    if (omit.has(entry.name)) {
      const bytes = await reader.readEntry(entry.name)
      if (bytes.byteLength !== 0) {
        throw new MbzParseError(`Refusing to omit a non-empty entry: ${entry.name}`)
      }
      continue
    }
    const name = renames.get(entry.name) ?? entry.name
    claim(name)
    const inline = replacements.get(entry.name)
    planned.push(inline ? { name, inline } : { name, sourceName: entry.name })
  }
  const added = [...additions.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  for (const [name, data] of added) {
    claim(name)
    planned.push({ name, inline: data })
  }
  return planned
}

function copyBytes(chunk: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(chunk.byteLength)
  copy.set(chunk)
  return copy
}

function owned(bytes: Uint8Array): Uint8Array {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes
  return bytes.slice()
}

/** POSIX ustar header. Names over 100 bytes use the ustar prefix (STD-001). */
function tarHeader(name: string, size: number): Uint8Array {
  const split = splitUstarName(name)
  const header = new Uint8Array(512)
  const enc = new TextEncoder()
  header.set(enc.encode(split.base), 0)
  header.set(enc.encode('0000644\0'), 100)
  header.set(enc.encode('0000000\0'), 108)
  header.set(enc.encode('0000000\0'), 116)
  header.set(enc.encode(`${size.toString(8).padStart(11, '0')}\0`), 124)
  header.set(enc.encode(`${(1700000000).toString(8).padStart(11, '0')}\0`), 136)
  header[156] = 0x30
  header.set(enc.encode('ustar\0'), 257)
  header.set(enc.encode('00'), 263)
  if (split.prefix) header.set(enc.encode(split.prefix), 345)
  header.set(enc.encode('        '), 148)
  let sum = 0
  for (const byte of header) sum += byte
  header.set(enc.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148)
  return header
}

function splitUstarName(name: string): { base: string; prefix: string } {
  if (name.length <= 100) return { base: name, prefix: '' }
  const slash = name.lastIndexOf('/')
  const base = slash >= 0 ? name.slice(slash + 1) : name
  const prefix = slash > 0 ? name.slice(0, slash) : ''
  if (base.length === 0 || base.length > 100 || prefix.length === 0 || prefix.length > 155) {
    throw new MbzParseError(`TAR path exceeds ustar limits: ${name}`)
  }
  return { base, prefix }
}
