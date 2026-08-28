import { describe, expect, test } from 'bun:test'
import { tooLargeToRead } from '../src/archive/reader.ts'
import { detectFormat, MbzParseError, sanitizeTarName, TarGzReader } from '../src/index.ts'

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

async function gzip(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

describe('TarGzReader memory shape (ADR-0036)', () => {
  test('entries come back as their own bytes, not views into one staged buffer', async () => {
    const a = new TextEncoder().encode('first entry')
    const b = new TextEncoder().encode('second entry, longer than the first')
    const gz = await gzip(
      tar([
        { name: 'a.txt', data: a },
        { name: 'b.txt', data: b },
      ]),
    )
    const r = await TarGzReader.open(new Blob([gz.buffer]))
    const ra = await r.readEntry('a.txt')
    const rb = await r.readEntry('b.txt')
    expect(new TextDecoder().decode(ra)).toBe('first entry')
    expect(new TextDecoder().decode(rb)).toBe('second entry, longer than the first')
    // The decompressed tar is a Blob now, so nothing hands out a window into
    // it: each read allocates exactly its own entry and no more.
    expect(ra.buffer).not.toBe(rb.buffer)
    expect(ra.buffer.byteLength).toBe(ra.byteLength)
    expect(rb.buffer.byteLength).toBe(rb.byteLength)
    await r.close()
    await expect(r.readEntry('a.txt')).rejects.toThrow(/not found/i)
  })

  test('indexes headers that straddle decompression chunk boundaries', async () => {
    // Sizes are deliberately not block multiples and the archive is large
    // enough that DecompressionStream emits many chunks, so headers land
    // mid-chunk and split across chunks.
    const entries = Array.from({ length: 400 }, (_, i) => ({
      name: `files/${i}.bin`,
      data: new TextEncoder().encode(`${i}:`.padEnd(1000 + ((i * 37) % 900), 'x')),
    }))
    const r = await TarGzReader.open(new Blob([(await gzip(tar(entries))).buffer]))
    expect((await r.listEntries()).length).toBe(entries.length)
    for (const e of entries) {
      expect(await r.readEntry(e.name)).toEqual(e.data)
    }
    await r.close()
  })

  test('an entry whose declared size runs past the stream is refused', async () => {
    // A header promising 2048 bytes followed by only one block of them.
    const truncated = tar([{ name: 'short.bin', data: new Uint8Array(2048) }]).slice(0, 512 + 512)
    const gz = await gzip(truncated)
    await expect(TarGzReader.open(new Blob([gz.buffer]))).rejects.toThrow(/truncated/i)
  })

  test('a corrupt gzip stream fails as a parse error, not a raw exception', async () => {
    const bytes = new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    await expect(TarGzReader.open(new Blob([bytes.buffer]))).rejects.toThrow(/gzip|decompress/i)
  })
})

describe('tooLargeToRead (ADR-0036)', () => {
  test('names the entry and the size a failed allocation could not meet', () => {
    const e = tooLargeToRead(
      'files/ab/abc',
      3 * 1024 * 1024 * 1024,
      new RangeError('Array buffer allocation failed'),
    )
    expect(e).toBeInstanceOf(MbzParseError)
    expect(e.message).toContain('files/ab/abc')
    expect(e.message).toContain('3072 MB')
  })

  test('leaves an existing parse error alone and does not blame size for other faults', () => {
    const parse = new MbzParseError('already explained')
    expect(tooLargeToRead('x', 1, parse)).toBe(parse)
    expect(tooLargeToRead('x', 1, new TypeError('nope')).message).toMatch(/failed to read entry/i)
  })
})
