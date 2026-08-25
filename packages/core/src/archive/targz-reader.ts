/**
 * TAR.GZ implementation of ArchiveReader (ADR-0005).
 *
 * Real-world evidence: Moodle ≥2.9 produces .mbz as tar+gz by default
 * (MDL-41838 / MDL-49298), including small backups (verified 2026-08-24 on
 * REPO-004 fixtures). A minimal ustar parser over DecompressionStream keeps
 * this dependency-free; entries are indexed sequentially.
 *
 * Memory (ADR-0029): gzip is one stream, so random access needs the
 * decompressed bytes somewhere; this keeps them in one buffer and nothing
 * else. The Blob is streamed straight into DecompressionStream rather than
 * read whole first, the buffer is pre-sized from the gzip trailer's ISIZE so
 * it is not grown by copying, and entries are recorded as offsets into it —
 * readEntry hands back a view, never a copy. Peak memory is therefore the
 * decompressed size, where it used to be compressed + decompressed + one
 * copy of every entry. Staging to OPFS to drop the buffer too is Q-007.
 */
import type { BackupFormat } from '../model/backup.ts'
import { MbzParseError } from '../model/backup.ts'
import type { ArchiveEntryInfo, ArchiveReader } from './reader.ts'

const BLOCK = 512

interface TarEntry {
  readonly offset: number
  readonly size: number
}

export class TarGzReader implements ArchiveReader {
  readonly format: BackupFormat = 'targz'

  private constructor(
    private buffer: Uint8Array | undefined,
    private readonly entries: Map<string, TarEntry>,
  ) {}

  static async open(blob: Blob): Promise<TarGzReader> {
    const decompressed = await gunzipToBuffer(blob)
    const entries = new Map<string, TarEntry>()
    let offset = 0
    while (offset + BLOCK <= decompressed.byteLength) {
      const header = decompressed.subarray(offset, offset + BLOCK)
      if (isZeroBlock(header)) break
      const name = readString(header, 0, 100)
      const sizeField = readString(header, 124, 12)
      const size = Number.parseInt(sizeField.trim() || '0', 8)
      const prefix = readString(header, 345, 155)
      if (!Number.isFinite(size) || size < 0) {
        throw new MbzParseError(`Malformed tar header at offset ${offset}`)
      }
      offset += BLOCK
      // Path traversal guard (ADR-0009): reject absolute paths and "..".
      const fullName = sanitizeTarName(prefix ? `${prefix}/${name}` : name)
      if (fullName !== undefined && size > 0) {
        if (offset + size > decompressed.byteLength) {
          throw new MbzParseError(`Truncated tar entry: ${fullName}`)
        }
        entries.set(fullName, { offset, size })
      }
      offset += Math.ceil(size / BLOCK) * BLOCK
    }
    return new TarGzReader(decompressed, entries)
  }

  async listEntries(): Promise<ArchiveEntryInfo[]> {
    return [...this.entries.entries()].map(([name, e]) => ({
      name,
      uncompressedSize: e.size,
    }))
  }

  /** Returns a view into the decompressed buffer; callers must not retain it past close(). */
  async readEntry(name: string): Promise<Uint8Array> {
    const e = this.entries.get(name)
    if (!e || !this.buffer) throw new MbzParseError(`Entry not found in archive: ${name}`)
    return this.buffer.subarray(e.offset, e.offset + e.size)
  }

  async close(): Promise<void> {
    this.entries.clear()
    this.buffer = undefined
  }
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

/** Largest decompressed tar this reader will hold; beyond it, Q-007 applies. */
export const MAX_TAR_BYTES = 8 * 1024 * 1024 * 1024

/**
 * Streams the Blob through gzip decompression into one pre-sized buffer.
 *
 * The gzip trailer's last four bytes are ISIZE, the decompressed length
 * modulo 2^32 — exact for anything under 4 GiB, which is every backup this
 * reader is meant for. Sizing the buffer from it means the stream is copied
 * into place once instead of being accumulated in chunks and joined, which
 * would briefly hold the whole thing twice. zlib verifies ISIZE against
 * what it produced, so a trailer that lies fails decompression outright;
 * the growth path below exists only for the ≥ 4 GiB wrap-around.
 */
async function gunzipToBuffer(blob: Blob): Promise<Uint8Array> {
  let hint = 0
  if (blob.size >= 4) {
    const trailer = new DataView(await blob.slice(blob.size - 4, blob.size).arrayBuffer())
    hint = trailer.getUint32(0, true)
  }
  let out = new Uint8Array(Math.min(Math.max(hint, 1024), MAX_TAR_BYTES))
  let used = 0
  const reader = blob.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (used + value.byteLength > out.byteLength) {
        const grown = Math.min(Math.max(out.byteLength * 2, used + value.byteLength), MAX_TAR_BYTES)
        if (grown < used + value.byteLength)
          throw new MbzParseError('Decompressed archive too large')
        const next = new Uint8Array(grown)
        next.set(out.subarray(0, used))
        out = next
      }
      out.set(value, used)
      used += value.byteLength
    }
  } catch (e) {
    if (e instanceof MbzParseError) throw e
    throw new MbzParseError('Failed to decompress gzip stream', { cause: e })
  }
  return out.subarray(0, used)
}
