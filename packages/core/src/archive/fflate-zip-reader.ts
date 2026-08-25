/**
 * ZIP implementation of ArchiveReader backed by fflate.
 *
 * Why not @zip.js/zip.js here (yet): EXP-002 measured zip.js 2.8.59 failing
 * under Bun 1.4.0 on both read and write paths (stream adapter assumes
 * WHATWG ReadableStream semantics that Bun's do not satisfy). fflate works
 * identically in browsers, Node and Bun, letting unit tests exercise the
 * same code path that ships.
 *
 * Known trade-off (tracked in research/Q-004 / Q-007): fflate materializes
 * all requested entries in memory; true lazy central-directory random
 * access will be revisited with zip.js in the browser once the large-file
 * milestone starts.
 */
import { unzipSync } from 'fflate'
import type { BackupFormat } from '../model/backup.ts'
import { MbzParseError } from '../model/backup.ts'
import type { ArchiveEntryInfo, ArchiveReader } from './reader.ts'

export class FflateZipReader implements ArchiveReader {
  readonly format: BackupFormat = 'zip'
  private entries: Map<string, Uint8Array> | undefined

  private constructor(private readonly data: Uint8Array) {}

  static open(data: Uint8Array): FflateZipReader {
    // Cheap magic check before handing bytes to fflate for a clearer error.
    if (!(data[0] === 0x50 && data[1] === 0x4b)) {
      throw new MbzParseError('Not a ZIP archive (bad magic bytes)')
    }
    return new FflateZipReader(data)
  }

  private inflate(): void {
    if (this.entries) return
    try {
      this.entries = new Map(Object.entries(unzipSync(this.data)))
    } catch (e) {
      throw new MbzParseError('Failed to decode ZIP archive', { cause: e })
    }
  }

  async listEntries(): Promise<ArchiveEntryInfo[]> {
    this.inflate()
    const out: ArchiveEntryInfo[] = []
    for (const [name, data] of this.entries ?? []) {
      out.push({ name, uncompressedSize: data.byteLength })
    }
    return out
  }

  async readEntry(name: string): Promise<Uint8Array> {
    this.inflate()
    const data = this.entries?.get(name)
    if (!data) {
      throw new MbzParseError(`Entry not found in archive: ${name}`)
    }
    return data
  }

  async close(): Promise<void> {
    this.entries = undefined
  }
}
