import { describe, expect, test } from 'bun:test'
import { detectFormat, sanitizeTarName, TarGzReader } from '../src/index.ts'

/** Builds a minimal ustar archive in memory (STD-001 layout). */
function tar(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const blocks: Uint8Array[] = []
  const enc = new TextEncoder()
  for (const e of entries) {
    const h = new Uint8Array(512)
    h.set(enc.encode(e.name).slice(0, 100), 0)
    h.set(enc.encode('0000644\0'), 100) // mode
    h.set(enc.encode('0000000\0'), 108) // uid
    h.set(enc.encode('0000000\0'), 116) // gid
    const sizeOctal = `${e.data.length.toString(8).padStart(11, '0')}\0`
    h.set(enc.encode(sizeOctal), 124)
    h.set(enc.encode(`0${'\0'.repeat(7)}`), 156) // typeflag: regular file
    h.set(enc.encode('ustar\0' + '00'), 257)
    // checksum: spaces while computing
    h.set(enc.encode('        '), 148)
    let sum = 0
    for (const b of h) sum += b
    h.set(enc.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148)
    blocks.push(h, e.data)
    const pad = (512 - (e.data.length % 512)) % 512
    if (pad > 0) blocks.push(new Uint8Array(pad))
  }
  blocks.push(new Uint8Array(1024)) // end marker
  const total = blocks.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const b of blocks) {
    out.set(b, off)
    off += b.length
  }
  return out
}

describe('TarGzReader', () => {
  test('indexes and reads entries from a gzip-compressed ustar stream', async () => {
    const hello = new TextEncoder().encode('hello mbz')
    const tgz = Bun.gzipSync(
      tar([{ name: 'moodle_backup.xml', data: hello }]).slice().buffer as ArrayBuffer,
    )
    expect(detectFormat(tgz)).toBe('targz')

    const reader = await TarGzReader.open(new Blob([tgz]))
    const entries = await reader.listEntries()
    expect(entries).toEqual([{ name: 'moodle_backup.xml', uncompressedSize: 9 }])
    expect(new TextDecoder().decode(await reader.readEntry('moodle_backup.xml'))).toBe('hello mbz')
    expect(reader.readEntry('missing.xml')).rejects.toThrow()
    await reader.close()
  })

  test('rejects traversal entry names instead of exposing them', async () => {
    expect(sanitizeTarName('../evil.txt')).toBeUndefined()
    expect(sanitizeTarName('a/../../evil.txt')).toBeUndefined()
    expect(sanitizeTarName('/abs')).toBeUndefined()
  })
})
