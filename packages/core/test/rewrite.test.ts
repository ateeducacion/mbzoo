import { describe, expect, test } from 'bun:test'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { LazyZipReader, rewriteArchive, TarGzReader } from '../src/index.ts'

function zip(entries: Record<string, string>): Blob {
  const files: Record<string, Uint8Array> = {}
  for (const [name, value] of Object.entries(entries)) files[name] = strToU8(value)
  return new Blob([zipSync(files)])
}

async function text(reader: LazyZipReader | TarGzReader, name: string): Promise<string> {
  return new TextDecoder().decode(await reader.readEntry(name))
}

describe('rewriteArchive', () => {
  test('refuses a container that is neither ZIP nor TAR.GZ', async () => {
    await expect(rewriteArchive(new Blob([strToU8('plain text')]), new Map())).rejects.toThrow(
      /Unrecognized backup container/,
    )
  })

  test('accepts a bare replacement map and reports progress', async () => {
    const progress: string[] = []
    const out = await rewriteArchive(
      zip({ 'a.txt': 'old', 'b.txt': 'kept' }),
      new Map([['a.txt', strToU8('new')]]),
      { onProgress: (_done, _total, name) => progress.push(name) },
    )
    const reader = await LazyZipReader.open(out)
    expect(await text(reader, 'a.txt')).toBe('new')
    expect(await text(reader, 'b.txt')).toBe('kept')
    expect(progress.sort()).toEqual(['a.txt', 'b.txt'])
  })

  test('refuses plan entries that are not in the archive', async () => {
    const source = zip({ 'a.txt': 'a' })
    await expect(rewriteArchive(source, new Map([['x.txt', strToU8('x')]]))).rejects.toThrow(
      /Replacement entry is not in the archive/,
    )
    await expect(
      rewriteArchive(source, { renames: new Map([['x.txt', 'y.txt']]) }),
    ).rejects.toThrow(/Rename source is not in the archive/)
    await expect(rewriteArchive(source, { omit: new Set(['x.txt']) })).rejects.toThrow(
      /Omitted entry is not in the archive/,
    )
  })

  test('refuses to omit an entry it also edits', async () => {
    const source = new Blob([zipSync({ 'empty.txt': new Uint8Array(0) })])
    await expect(
      rewriteArchive(source, {
        replacements: new Map([['empty.txt', strToU8('x')]]),
        omit: new Set(['empty.txt']),
      }),
    ).rejects.toThrow(/also edited/)
  })

  test('stops when cancelled', async () => {
    await expect(
      rewriteArchive(zip({ 'a.txt': 'a' }), new Map(), { signal: { aborted: true } }),
    ).rejects.toThrow(/cancelled/)
  })

  test('refuses to rebuild a ZIP with duplicate names', async () => {
    const pair = zipSync({ 'a.txt': strToU8('one'), 'b.txt': strToU8('two') })
    const copy = new Uint8Array(pair)
    const view = new DataView(copy.buffer)
    let eocd = copy.byteLength - 22
    while (view.getUint32(eocd, true) !== 0x06054b50) eocd--
    let at = view.getUint32(eocd + 16, true)
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true)
    copy[at + 46] = 'a'.charCodeAt(0)
    await expect(rewriteArchive(new Blob([copy]), new Map())).rejects.toThrow(/duplicate entry/)
  })

  test('refuses to rebuild a TAR.GZ with a bad header checksum', async () => {
    const tar = tarArchive([{ name: 'a.txt', data: 'a', corruptChecksum: true }])
    await expect(rewriteArchive(new Blob([gzipSync(tar)]), new Map())).rejects.toThrow(
      /checksum errors/,
    )
  })

  test('splits a long TAR path into the ustar prefix and keeps it readable', async () => {
    const long = `${'d'.repeat(60)}/${'e'.repeat(60)}/file.txt`
    const tar = tarArchive([{ name: 'a.txt', data: 'a' }])
    const out = await rewriteArchive(new Blob([gzipSync(tar)]), {
      renames: new Map([['a.txt', long]]),
    })
    const reader = await TarGzReader.open(out)
    expect((await reader.listEntries()).map((entry) => entry.name)).toEqual([long])
    expect(await text(reader, long)).toBe('a')
  })

  test('refuses a TAR path that does not fit ustar', async () => {
    const tar = tarArchive([{ name: 'a.txt', data: 'a' }])
    await expect(
      rewriteArchive(new Blob([gzipSync(tar)]), {
        renames: new Map([['a.txt', `dir/${'f'.repeat(120)}`]]),
      }),
    ).rejects.toThrow(/ustar limits/)
  })
})

function tarArchive(
  entries: Array<{ name: string; data: string; corruptChecksum?: boolean }>,
): Uint8Array {
  const blocks: Uint8Array[] = []
  const enc = new TextEncoder()
  for (const entry of entries) {
    const data = enc.encode(entry.data)
    const header = new Uint8Array(512)
    header.set(enc.encode(entry.name).slice(0, 100), 0)
    header.set(enc.encode('0000644\0'), 100)
    header.set(enc.encode('0000000\0'), 108)
    header.set(enc.encode('0000000\0'), 116)
    header.set(enc.encode(`${data.length.toString(8).padStart(11, '0')}\0`), 124)
    header[156] = 0x30
    header.set(enc.encode('ustar\0'), 257)
    header.set(enc.encode('00'), 263)
    header.set(enc.encode('        '), 148)
    let sum = 0
    for (const byte of header) sum += byte
    if (entry.corruptChecksum) sum += 1
    header.set(enc.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148)
    blocks.push(header, data)
    const pad = (512 - (data.length % 512)) % 512
    if (pad > 0) blocks.push(new Uint8Array(pad))
  }
  blocks.push(new Uint8Array(1024))
  const total = blocks.reduce((sum, block) => sum + block.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const block of blocks) {
    out.set(block, offset)
    offset += block.byteLength
  }
  return out
}
