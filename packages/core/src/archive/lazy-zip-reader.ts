/**
 * ZIP implementation of ArchiveReader that reads the archive lazily
 * (ADR-0029, retires RISK-001 for ZIP and RISK-003).
 *
 * Only the central directory is read up front — a few bytes per entry at
 * the tail of the file. An entry's bytes are sliced from the Blob and
 * inflated on demand, so the compressed archive never has to be in memory
 * at once and nothing is inflated that nobody asked for. Everything here is
 * Web-platform only (Blob.slice, DataView, TextDecoder) plus fflate's
 * inflateSync for method 8, so the same code runs in browsers, Bun and Node
 * (ADR-0004) — which is why this exists instead of zip.js (EXP-002).
 *
 * The archive is hostile input (AGENTS.md rule 1). Every offset and length
 * read from it is bounds-checked against the Blob before it is used, entry
 * counts and sizes are capped, and an entry whose inflated length does not
 * match what its header declared is rejected rather than returned.
 *
 * Format facts are from the PKWARE APPNOTE (STD-001): EOCD 0x06054b50,
 * ZIP64 EOCD locator 0x07064b50, ZIP64 EOCD record 0x06064b50, central
 * directory header 0x02014b50, local file header 0x04034b50, ZIP64 extra
 * field id 0x0001.
 */
import { inflateSync } from 'fflate'
import type { BackupFormat } from '../model/backup.ts'
import { MbzParseError } from '../model/backup.ts'
import type { ArchiveEntryInfo, ArchiveReader } from './reader.ts'
import { sanitizeTarName } from './targz-reader.ts'

const SIG_EOCD = 0x06054b50
const SIG_EOCD64_LOCATOR = 0x07064b50
const SIG_EOCD64 = 0x06064b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

const EOCD_MIN = 22
const EOCD_MAX_COMMENT = 0xffff
const CENTRAL_MIN = 46
const LOCAL_MIN = 30

const METHOD_STORED = 0
const METHOD_DEFLATE = 8
const FLAG_ENCRYPTED = 0x0001

/** Hard ceilings on what a directory may claim; a backup never needs more. */
const MAX_ENTRIES = 2_000_000
const MAX_CENTRAL_DIRECTORY_BYTES = 512 * 1024 * 1024
/** Largest single entry we will inflate: bounds the allocation a bomb can force. */
export const MAX_ZIP_ENTRY_BYTES = 2 * 1024 * 1024 * 1024 - 1

interface ZipEntry {
  readonly name: string
  readonly method: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly localHeaderOffset: number
}

export class LazyZipReader implements ArchiveReader {
  readonly format: BackupFormat = 'zip'
  private readonly entries: Map<string, ZipEntry>

  private constructor(
    private readonly blob: Blob,
    entries: Map<string, ZipEntry>,
  ) {
    this.entries = entries
  }

  static async open(blob: Blob): Promise<LazyZipReader> {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
    if (!(head[0] === 0x50 && head[1] === 0x4b)) {
      throw new MbzParseError('Not a ZIP archive (bad magic bytes)')
    }
    const directory = await readCentralDirectory(blob)
    return new LazyZipReader(blob, directory)
  }

  async listEntries(): Promise<ArchiveEntryInfo[]> {
    const out: ArchiveEntryInfo[] = []
    for (const e of this.entries.values()) {
      out.push({ name: e.name, uncompressedSize: e.uncompressedSize })
    }
    return out
  }

  async readEntry(name: string): Promise<Uint8Array> {
    const entry = this.entries.get(name)
    if (!entry) throw new MbzParseError(`Entry not found in archive: ${name}`)

    // The local header repeats the name and extra field with its own lengths,
    // which need not match the central directory's; only its lengths are
    // trusted for locating the data, and only the central sizes for reading.
    const localEnd = entry.localHeaderOffset + LOCAL_MIN
    if (localEnd > this.blob.size) {
      throw new MbzParseError(`Local header out of range: ${name}`)
    }
    const local = new DataView(
      await this.blob.slice(entry.localHeaderOffset, localEnd).arrayBuffer(),
    )
    if (local.getUint32(0, true) !== SIG_LOCAL) {
      throw new MbzParseError(`Bad local header signature: ${name}`)
    }
    const dataStart = localEnd + local.getUint16(26, true) + local.getUint16(28, true)
    const dataEnd = dataStart + entry.compressedSize
    if (dataEnd > this.blob.size) {
      throw new MbzParseError(`Entry data out of range: ${name}`)
    }
    const compressed = new Uint8Array(await this.blob.slice(dataStart, dataEnd).arrayBuffer())

    if (entry.method === METHOD_STORED) {
      if (compressed.byteLength !== entry.uncompressedSize) {
        throw new MbzParseError(`Stored entry size mismatch: ${name}`)
      }
      return compressed
    }
    // METHOD_DEFLATE — the only other method accepted at open time.
    let inflated: Uint8Array
    try {
      // fflate never grows a caller-supplied buffer: it fills it and stops,
      // silently. So the buffer is one byte longer than the directory
      // promised — a stream that fills that extra byte is producing more than
      // it declared, and a bomb still cannot allocate past declared + 1.
      inflated = inflateSync(compressed, { out: new Uint8Array(entry.uncompressedSize + 1) })
    } catch (e) {
      throw new MbzParseError(`Failed to inflate entry: ${name}`, { cause: e })
    }
    if (inflated.byteLength !== entry.uncompressedSize) {
      throw new MbzParseError(`Inflated size mismatch: ${name}`)
    }
    return inflated
  }

  async close(): Promise<void> {
    this.entries.clear()
  }
}

/** Locates the end-of-central-directory record and reads the directory. */
async function readCentralDirectory(blob: Blob): Promise<Map<string, ZipEntry>> {
  const size = blob.size
  if (size < EOCD_MIN) throw new MbzParseError('ZIP archive too small')

  // The EOCD sits at the very end unless a comment follows it; scan the
  // largest possible tail once rather than growing a window.
  const tailStart = Math.max(0, size - EOCD_MIN - EOCD_MAX_COMMENT)
  const tail = new Uint8Array(await blob.slice(tailStart, size).arrayBuffer())
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  let eocdAt = -1
  for (let i = tail.byteLength - EOCD_MIN; i >= 0; i--) {
    if (tailView.getUint32(i, true) === SIG_EOCD) {
      eocdAt = i
      break
    }
  }
  if (eocdAt < 0) throw new MbzParseError('ZIP end-of-central-directory not found')

  let totalEntries: number = tailView.getUint16(eocdAt + 10, true)
  let cdSize: number = tailView.getUint32(eocdAt + 12, true)
  let cdOffset: number = tailView.getUint32(eocdAt + 16, true)

  // ZIP64: any saturated field means the real values live in the ZIP64
  // record, pointed at by a locator that immediately precedes the EOCD.
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locatorAt = eocdAt - 20
    if (locatorAt < 0 || tailView.getUint32(locatorAt, true) !== SIG_EOCD64_LOCATOR) {
      throw new MbzParseError('ZIP64 locator missing')
    }
    const eocd64Offset = readUint64(tailView, locatorAt + 8)
    if (eocd64Offset + 56 > size) throw new MbzParseError('ZIP64 record out of range')
    const rec = new DataView(await blob.slice(eocd64Offset, eocd64Offset + 56).arrayBuffer())
    if (rec.getUint32(0, true) !== SIG_EOCD64) {
      throw new MbzParseError('Bad ZIP64 end-of-central-directory signature')
    }
    totalEntries = readUint64(rec, 32)
    cdSize = readUint64(rec, 40)
    cdOffset = readUint64(rec, 48)
  }

  if (totalEntries > MAX_ENTRIES) throw new MbzParseError('ZIP declares too many entries')
  if (cdSize > MAX_CENTRAL_DIRECTORY_BYTES)
    throw new MbzParseError('ZIP central directory too large')
  if (cdOffset + cdSize > size) throw new MbzParseError('ZIP central directory out of range')

  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer())
  const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
  const decoder = new TextDecoder('utf-8')
  const entries = new Map<string, ZipEntry>()
  let at = 0
  for (let i = 0; i < totalEntries; i++) {
    if (at + CENTRAL_MIN > cd.byteLength) throw new MbzParseError('Truncated central directory')
    if (view.getUint32(at, true) !== SIG_CENTRAL) {
      throw new MbzParseError('Bad central directory header signature')
    }
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    let compressedSize: number = view.getUint32(at + 20, true)
    let uncompressedSize: number = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    let localHeaderOffset: number = view.getUint32(at + 42, true)
    const nameStart = at + CENTRAL_MIN
    const extraStart = nameStart + nameLen
    const next = extraStart + extraLen + commentLen
    if (next > cd.byteLength) throw new MbzParseError('Central directory entry overruns')

    // ZIP64 extra field: only the fields that are saturated appear, in order.
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      let x = extraStart
      const extraEnd = extraStart + extraLen
      let found = false
      while (x + 4 <= extraEnd) {
        const id = view.getUint16(x, true)
        const len = view.getUint16(x + 2, true)
        if (x + 4 + len > extraEnd) break
        if (id === 0x0001) {
          let f = x + 4
          const fieldEnd = f + len
          if (uncompressedSize === 0xffffffff && f + 8 <= fieldEnd) {
            uncompressedSize = readUint64(view, f)
            f += 8
          }
          if (compressedSize === 0xffffffff && f + 8 <= fieldEnd) {
            compressedSize = readUint64(view, f)
            f += 8
          }
          if (localHeaderOffset === 0xffffffff && f + 8 <= fieldEnd) {
            localHeaderOffset = readUint64(view, f)
          }
          found = true
          break
        }
        x += 4 + len
      }
      if (!found) throw new MbzParseError('ZIP64 sizes declared but extra field missing')
    }

    const rawName = decoder.decode(cd.subarray(nameStart, extraStart))
    at = next

    if (rawName.endsWith('/')) continue // directory entry
    if (flags & FLAG_ENCRYPTED) throw new MbzParseError(`Encrypted entry not supported: ${rawName}`)
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new MbzParseError(`Unsupported compression method ${method}: ${rawName}`)
    }
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new MbzParseError(`Entry too large to read: ${rawName}`)
    }
    if (localHeaderOffset + LOCAL_MIN > size) {
      throw new MbzParseError(`Local header offset out of range: ${rawName}`)
    }
    // Same traversal guard the tar reader applies (ADR-0009).
    const name = sanitizeTarName(rawName)
    if (name === undefined) continue
    entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset })
  }
  return entries
}

/** Reads a little-endian uint64 that must fit a JS safe integer. */
function readUint64(view: DataView, at: number): number {
  const lo = view.getUint32(at, true)
  const hi = view.getUint32(at + 4, true)
  if (hi > 0x1fffff) throw new MbzParseError('ZIP64 value exceeds addressable range')
  return hi * 0x1_0000_0000 + lo
}
