/**
 * TAR.GZ implementation of ArchiveReader (ADR-0005).
 *
 * Real-world evidence: Moodle ≥2.9 produces .mbz as tar+gz by default
 * (MDL-41838 / MDL-49298), including small backups (verified 2026-08-24 on
 * REPO-004 fixtures). A minimal ustar parser over DecompressionStream keeps
 * this dependency-free; entries are indexed sequentially.
 *
 * Limitation: the gzip stream is fully decompressed into memory before tar
 * parsing. Acceptable for the bootstrap slice (< ~200 MB); the streaming
 * strategy for multi-GB backups is tracked in research/Q-005/Q-007.
 */
import type { BackupFormat } from '../model/backup.ts'
import { MbzParseError } from '../model/backup.ts'
import type { ArchiveEntryInfo, ArchiveReader } from './reader.ts'

const BLOCK = 512

export class TarGzReader implements ArchiveReader {
  readonly format: BackupFormat = 'targz'

  private constructor(private readonly entries: Map<string, Uint8Array>) {}

  static async open(blob: Blob): Promise<TarGzReader> {
    const decompressed = await gunzip(await blob.arrayBuffer())
    const entries = new Map<string, Uint8Array>()
    let offset = 0
    while (offset + BLOCK <= decompressed.byteLength) {
      const header = new Uint8Array(decompressed, offset, BLOCK)
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
        entries.set(fullName, new Uint8Array(decompressed.slice(offset, offset + size)))
      }
      offset += Math.ceil(size / BLOCK) * BLOCK
    }
    return new TarGzReader(entries)
  }

  async listEntries(): Promise<ArchiveEntryInfo[]> {
    return [...this.entries.entries()].map(([name, data]) => ({
      name,
      uncompressedSize: data.byteLength,
    }))
  }

  async readEntry(name: string): Promise<Uint8Array> {
    const data = this.entries.get(name)
    if (!data) throw new MbzParseError(`Entry not found in archive: ${name}`)
    return data
  }

  async close(): Promise<void> {
    this.entries.clear()
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

async function gunzip(input: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('gzip')
  const stream = new Blob([input]).stream().pipeThrough(ds)
  return await new Response(stream).arrayBuffer()
}
