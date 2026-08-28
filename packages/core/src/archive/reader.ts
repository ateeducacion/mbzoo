/**
 * Runtime-agnostic archive access (ADR-0005).
 *
 * Implementations provide lazy, entry-level random access over a backup
 * container without loading the whole file into memory. One implementation
 * per container format serves browsers, Bun and Node alike (ADR-0029,
 * ADR-0036); there is no runtime-specific adapter.
 */
import { type BackupFormat, MbzParseError } from '../model/backup.ts'

export interface ArchiveEntryInfo {
  readonly name: string
  readonly uncompressedSize: number
}

export interface ArchiveReader {
  readonly format: BackupFormat
  /** Names of all entries (cheap: central directory / index only). */
  listEntries(): Promise<ArchiveEntryInfo[]>
  /** Read one full entry as bytes. Callers must bound the size first. */
  readEntry(name: string): Promise<Uint8Array>
  close(): Promise<void>
}

/**
 * Turns a failed allocation into something a reader can act on.
 *
 * An entry is handed to callers as one Uint8Array, so its own size is a
 * ceiling no staging strategy removes (ADR-0036). V8 answers an impossible
 * allocation with `RangeError: Array buffer allocation failed`, which used
 * to reach the viewer's error card verbatim and name neither the entry nor
 * the size that could not be met.
 */
export function tooLargeToRead(name: string, size: number, cause: unknown): MbzParseError {
  if (cause instanceof MbzParseError) return cause
  if (!(cause instanceof RangeError)) {
    return new MbzParseError(`Failed to read entry: ${name}`, { cause })
  }
  const mb = Math.round(size / (1024 * 1024))
  return new MbzParseError(
    `Entry too large for this browser to hold in memory: ${name} (${mb} MB in one block)`,
    { cause },
  )
}

/** Detects container format from leading magic bytes. */
export function detectFormat(head: Uint8Array): BackupFormat {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) {
    // "PK" — ZIP local file header or empty archive (PK\x05\x06).
    return 'zip'
  }
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) {
    return 'targz'
  }
  return 'unknown'
}
