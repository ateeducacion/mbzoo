/**
 * TAR.GZ implementation of ArchiveReader (ADR-0005).
 *
 * Real-world evidence: Moodle ≥2.9 produces .mbz as tar+gz by default
 * (MDL-41838 / MDL-49298), including small backups (verified 2026-08-24 on
 * REPO-004 fixtures). A minimal ustar parser over DecompressionStream keeps
 * this dependency-free; entries are indexed sequentially.
 *
 * Memory (ADR-0036, superseding the TAR.GZ half of ADR-0029): gzip is one
 * stream, so random access needs the decompressed bytes somewhere. They are
 * staged in a Blob rather than an ArrayBuffer — the platform's own byte
 * store, which the browser keeps outside the JS heap, is free to page to
 * disk, and never has to satisfy as one contiguous allocation. Pre-sizing a
 * buffer from the gzip trailer's ISIZE is what used to fail outright with
 * "Array buffer allocation failed" on backups of a few hundred MB. The tar
 * index is built from the bytes as they stream past, so the archive is read
 * once and never re-read to be indexed; readEntry slices out only the entry
 * that was asked for.
 */
import type { BackupFormat } from '../model/backup.ts'
import { MbzParseError } from '../model/backup.ts'
import {
  type ArchiveAnomalies,
  type ArchiveEntryInfo,
  type ArchiveReader,
  tooLargeToRead,
} from './reader.ts'

const BLOCK = 512

/** Largest decompressed tar this reader will stage; bounds a gzip bomb. */
export const MAX_TAR_BYTES = 8 * 1024 * 1024 * 1024

interface TarEntry {
  readonly offset: number
  readonly size: number
}

export class TarGzReader implements ArchiveReader {
  readonly format: BackupFormat = 'targz'

  private constructor(
    private data: Blob | undefined,
    private readonly entries: Map<string, TarEntry>,
    private readonly notes: ArchiveAnomalies,
  ) {}

  static async open(blob: Blob): Promise<TarGzReader> {
    const indexer = new TarIndexer()
    const index = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        indexer.push(chunk)
        controller.enqueue(chunk)
      },
    })
    let data: Blob
    try {
      const stream = blob.stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(index)
      data = await new Response(stream).blob()
    } catch (e) {
      if (e instanceof MbzParseError) throw e
      throw new MbzParseError('Failed to decompress gzip stream', { cause: e })
    }
    return new TarGzReader(data, indexer.finish(), indexer.anomalies())
  }

  anomalies(): ArchiveAnomalies {
    return this.notes
  }

  async listEntries(): Promise<ArchiveEntryInfo[]> {
    return [...this.entries.entries()].map(([name, e]) => ({
      name,
      uncompressedSize: e.size,
    }))
  }

  /** Reads one entry out of the staged tar; each call returns its own bytes. */
  async readEntry(name: string): Promise<Uint8Array> {
    const e = this.entries.get(name)
    if (!e || !this.data) throw new MbzParseError(`Entry not found in archive: ${name}`)
    try {
      return new Uint8Array(await this.data.slice(e.offset, e.offset + e.size).arrayBuffer())
    } catch (cause) {
      throw tooLargeToRead(name, e.size, cause)
    }
  }

  async close(): Promise<void> {
    this.entries.clear()
    this.data = undefined
  }
}

/**
 * Indexes ustar headers out of the decompressed byte stream as it passes.
 *
 * The tar layout is sequential — a 512-byte header, then that entry's data
 * padded to a block boundary — so the index can be built while the bytes are
 * still in flight: count down the data left to skip, and accumulate the next
 * header across chunk boundaries when it straddles one.
 */
class TarIndexer {
  private readonly entries = new Map<string, TarEntry>()
  private readonly unsafeNames: string[] = []
  private readonly duplicateNames: string[] = []
  private readonly checksumFailures: string[] = []
  private readonly header = new Uint8Array(BLOCK)
  private headerUsed = 0
  private skip = 0
  private padding = 0
  private offset = 0
  private done = false
  private lastName = ''

  push(chunk: Uint8Array): void {
    let i = 0
    while (i < chunk.byteLength && !this.done) {
      if (this.skip > 0) {
        const n = Math.min(this.skip, chunk.byteLength - i)
        i += n
        this.skip -= n
        this.offset += n
        continue
      }
      const n = Math.min(BLOCK - this.headerUsed, chunk.byteLength - i)
      this.header.set(chunk.subarray(i, i + n), this.headerUsed)
      this.headerUsed += n
      i += n
      this.offset += n
      if (this.headerUsed < BLOCK) return
      this.headerUsed = 0
      this.consumeHeader()
    }
    if (this.offset > MAX_TAR_BYTES) throw new MbzParseError('Decompressed archive too large')
  }

  /** Reads the header just completed; `offset` already points at its data. */
  private consumeHeader(): void {
    if (isZeroBlock(this.header)) {
      this.done = true
      return
    }
    const name = readString(this.header, 0, 100)
    const sizeField = readString(this.header, 124, 12)
    const size = Number.parseInt(sizeField.trim() || '0', 8)
    if (!Number.isFinite(size) || size < 0) {
      throw new MbzParseError(`Malformed tar header at offset ${this.offset - BLOCK}`)
    }
    const prefix = readString(this.header, 345, 155)
    const rawName = prefix ? `${prefix}/${name}` : name
    if (!tarChecksumOk(this.header))
      this.checksumFailures.push(rawName || `(offset ${this.offset - BLOCK})`)
    // Path traversal guard (ADR-0009): reject absolute paths and "..".
    const fullName = sanitizeTarName(rawName)
    // Empty regular files still have to be copied by a repair (ADR-0037).
    // Directory headers (typeflag '5', or a name ending in '/') stay out of
    // the index: Moodle addresses content by file path, not by tar folders.
    const typeflag = this.header[156] ?? 0
    const regularFile = typeflag === 0 || typeflag === 0x30
    if (fullName === undefined) {
      if (rawName !== '') this.unsafeNames.push(rawName)
    } else if (!fullName.endsWith('/') && (size > 0 || regularFile)) {
      if (this.entries.has(fullName)) this.duplicateNames.push(fullName)
      this.entries.set(fullName, { offset: this.offset, size })
      this.lastName = fullName
    }
    this.padding = (BLOCK - (size % BLOCK)) % BLOCK
    this.skip = size + this.padding
  }

  /**
   * A stream that ends before an entry's data does described bytes that are
   * not there. Missing trailing padding is not that: the entry itself is all
   * present, and archives in the wild do end that way.
   */
  finish(): Map<string, TarEntry> {
    if (this.skip > this.padding) throw new MbzParseError(`Truncated tar entry: ${this.lastName}`)
    return this.entries
  }

  anomalies(): ArchiveAnomalies {
    return {
      unsafeNames: this.unsafeNames,
      duplicateNames: this.duplicateNames,
      checksumFailures: this.checksumFailures,
    }
  }
}

/** ustar checksum: unsigned byte sum with the checksum field treated as spaces. */
function tarChecksumOk(header: Uint8Array): boolean {
  const field = readString(header, 148, 8).trim()
  if (field === '') return false
  const declared = Number.parseInt(field, 8)
  if (!Number.isFinite(declared)) return false
  let sum = 0
  for (let i = 0; i < BLOCK; i++) {
    sum += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0)
  }
  return sum === declared
}

function isZeroBlock(b: Uint8Array): boolean {
  return b.every((v) => v === 0)
}

function readString(b: Uint8Array, off: number, len: number): string {
  let end = off
  const max = off + len
  while (end < max && b[end] !== 0) end++
  return new TextDecoder('utf-8').decode(b.subarray(off, end))
}

/** Returns undefined for entries that must never surface (ADR-0009). */
export function sanitizeTarName(raw: string): string | undefined {
  const name = raw.replaceAll('\\', '/')
  if (
    name.startsWith('/') ||
    name.split('/').includes('..') ||
    name.includes('\0') ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate guard against control characters smuggled into tar entry names
    /^[\u0000-\u001f]/.test(name)
  ) {
    return undefined
  }
  return name
}
