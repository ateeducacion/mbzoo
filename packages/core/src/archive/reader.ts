/**
 * Runtime-agnostic archive access (ADR-0005).
 *
 * Implementations provide lazy, entry-level random access over a backup
 * container without loading the whole file into memory. The browser adapter
 * wraps @zip.js/zip.js; tests and the CLI use the same interface.
 */
import type { BackupFormat } from '../model/backup.ts'

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
