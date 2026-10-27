import { describe, expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import { LazyZipReader, MbzParseError } from '../src/index.ts'

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50

function eocdOffset(bytes: Uint8Array): number {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = bytes.byteLength - 22; i >= 0; i--) if (v.getUint32(i, true) === SIG_EOCD) return i
  throw new Error('no EOCD in test archive')
}

/** Offset of the n-th central directory header. */
function centralOffset(bytes: Uint8Array, n: number): number {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = v.getUint32(eocdOffset(bytes) + 16, true)
  for (let i = 0; i < n; i++) {
    const nameLen = v.getUint16(at + 28, true)
    const extraLen = v.getUint16(at + 30, true)
    const commentLen = v.getUint16(at + 32, true)
    at += 46 + nameLen + extraLen + commentLen
  }
  if (v.getUint32(at, true) !== SIG_CENTRAL) throw new Error('bad central header in test')
  return at
}

const patched = (bytes: Uint8Array, at: number, write: (v: DataView) => void): Blob => {
  const copy = new Uint8Array(bytes)
  write(new DataView(copy.buffer, at))
  return new Blob([copy])
}

const big = strToU8('x'.repeat(200_000))
const archive = zipSync({
  'moodle_backup.xml': strToU8('<?xml version="1.0"?><moodle_backup/>'),
  'files/ab/abc': big,
  'stored.txt': [strToU8('kept as-is'), { level: 0 }],
})

// A ZIP64 archive produced by Info-ZIP 3.0 (`zip -fz`), not hand-assembled:
// two stored entries, ZIP64 extra fields, ZIP64 EOCD record and locator.
const ZIP64_B64 =
  'UEsDBC0AAAAAAASrGV3q40/t//////////8FABQAYS50eHQBABAADAAAAAAAAAAMAAAAAAAAAGhlbGxvIHppcDY0ClBLAwQtAAAAAAAEqxld2qFiU///////////EQAUAG1vb2RsZV9iYWNrdXAueG1sAQAQACUAAAAAAAAAJQAAAAAAAAA8P3htbCB2ZXJzaW9uPSIxLjAiPz48bW9vZGxlX2JhY2t1cC8+UEsBAh4DLQAAAAAABKsZXerjT+0MAAAA/////wUADAAAAAAAAQAAAKSBAAAAAGEudHh0AQAIAAwAAAAAAAAAUEsBAh4DLQAAAAAABKsZXdqhYlMlAAAA/////xEADAAAAAAAAQAAAKSBQwAAAG1vb2RsZV9iYWNrdXAueG1sAQAIACUAAAAAAAAAUEsGBiwAAAAAAAAAHgMtAAAAAAAAAAAAAgAAAAAAAAACAAAAAAAAAIoAAAAAAAAAqwAAAAAAAABQSwYHAAAAADUBAAAAAAAAAQAAAFBLBQYAAAAAAgACAIoAAAD/////AAA='

describe('LazyZipReader', () => {
  test('lists the directory and inflates only the entry asked for', async () => {
    const r = await LazyZipReader.open(new Blob([archive]))
    const names = (await r.listEntries()).map((e) => e.name).sort()
    expect(names).toEqual(['files/ab/abc', 'moodle_backup.xml', 'stored.txt'])
    expect(new TextDecoder().decode(await r.readEntry('moodle_backup.xml'))).toContain(
      '<moodle_backup/>',
    )
    expect((await r.readEntry('files/ab/abc')).byteLength).toBe(big.byteLength)
    expect(new TextDecoder().decode(await r.readEntry('stored.txt'))).toBe('kept as-is')
    await expect(r.readEntry('nope')).rejects.toThrow(/not found/i)
  })

  test('reads a real ZIP64 archive: sizes and offsets come from the extra field', async () => {
    const bytes = Uint8Array.from(atob(ZIP64_B64), (c) => c.charCodeAt(0))
    const r = await LazyZipReader.open(new Blob([bytes]))
    const names = (await r.listEntries()).map((e) => e.name).sort()
    expect(names).toEqual(['a.txt', 'moodle_backup.xml'])
    expect(new TextDecoder().decode(await r.readEntry('a.txt'))).toBe('hello zip64\n')
  })

  test('refuses what is not a ZIP', async () => {
    await expect(LazyZipReader.open(new Blob([strToU8('plain text, not a zip')]))).rejects.toThrow(
      MbzParseError,
    )
    await expect(
      LazyZipReader.open(new Blob([new Uint8Array([0x50, 0x4b, 3, 4])])),
    ).rejects.toThrow(/too small/i)
  })

  test('a directory offset pointing past the file is refused, not read', async () => {
    const blob = patched(archive, eocdOffset(archive), (v) => v.setUint32(16, 0x7fffffff, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/out of range/i)
  })

  test('a saturated entry count with no ZIP64 record is refused', async () => {
    const blob = patched(archive, eocdOffset(archive), (v) => v.setUint16(10, 0xffff, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/ZIP64 locator/i)
  })

  test('an archive cut short of its directory is refused', async () => {
    const cut = archive.subarray(0, eocdOffset(archive) - 10)
    await expect(LazyZipReader.open(new Blob([cut]))).rejects.toThrow(MbzParseError)
  })

  test('an entry that inflates to more than it declared is refused (zip bomb guard)', async () => {
    // Entry 0 in fflate's directory order is moodle_backup.xml; find the big one.
    const bytes = archive
    let idx = 0
    for (; idx < 3; idx++) {
      const at = centralOffset(bytes, idx)
      const v = new DataView(bytes.buffer, bytes.byteOffset + at)
      if (v.getUint32(24, true) === big.byteLength) break
    }
    const at = centralOffset(bytes, idx)
    const blob = patched(bytes, at, (v) => v.setUint32(24, 1000, true)) // claims 1000, is 200000
    const r = await LazyZipReader.open(blob)
    await expect(r.readEntry('files/ab/abc')).rejects.toThrow(MbzParseError)
  })

  test('an entry that inflates to less than it declared is refused too', async () => {
    let idx = 0
    for (; idx < 3; idx++) {
      const v = new DataView(archive.buffer, archive.byteOffset + centralOffset(archive, idx))
      if (v.getUint32(24, true) === big.byteLength) break
    }
    const blob = patched(archive, centralOffset(archive, idx), (v) =>
      v.setUint32(24, big.byteLength + 5000, true),
    )
    const r = await LazyZipReader.open(blob)
    await expect(r.readEntry('files/ab/abc')).rejects.toThrow(MbzParseError)
  })

  test('an encrypted entry is refused at open time', async () => {
    const blob = patched(archive, centralOffset(archive, 0), (v) => v.setUint16(8, 0x0001, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/encrypted/i)
  })

  test('a compression method other than stored or deflate is refused', async () => {
    const blob = patched(archive, centralOffset(archive, 0), (v) => v.setUint16(10, 12, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/method 12/i)
  })

  test('traversal names never surface (ADR-0009)', async () => {
    const hostile = zipSync({
      '../../etc/passwd': strToU8('root:x'),
      '/abs/path': strToU8('x'),
      'ok.txt': strToU8('fine'),
    })
    const r = await LazyZipReader.open(new Blob([hostile]))
    expect((await r.listEntries()).map((e) => e.name)).toEqual(['ok.txt'])
  })
})

/** Central directory index of `name` in `bytes`. */
function centralIndexOf(bytes: Uint8Array, name: string): number {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = v.getUint16(eocdOffset(bytes) + 10, true)
  for (let i = 0; i < count; i++) {
    const at = centralOffset(bytes, i)
    const nameLen = v.getUint16(at + 28, true)
    if (new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen)) === name) return i
  }
  throw new Error(`no ${name} in test archive`)
}

const stored = centralOffset(archive, centralIndexOf(archive, 'stored.txt'))
const deflated = centralOffset(archive, centralIndexOf(archive, 'files/ab/abc'))

describe('LazyZipReader hostile directories', () => {
  test('a central directory larger than the file is refused', async () => {
    const blob = patched(archive, eocdOffset(archive), (v) => v.setUint32(12, 0x7fffffff, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/too large|out of range/i)
  })

  test('more declared entries than the directory holds is refused', async () => {
    const blob = patched(archive, eocdOffset(archive), (v) => {
      v.setUint16(8, 4, true)
      v.setUint16(10, 4, true)
    })
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/Truncated central directory/)
  })

  test('a corrupt central header signature is refused', async () => {
    const blob = patched(archive, centralOffset(archive, 1), (v) => v.setUint32(0, 0, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/central directory header signature/)
  })

  test('a name that overruns the directory is refused', async () => {
    const blob = patched(archive, centralOffset(archive, 2), (v) => v.setUint16(28, 0xffff, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/overruns/)
  })

  test('a local header offset past the file is refused at open time', async () => {
    const blob = patched(archive, stored, (v) => v.setUint32(42, 0x7ffffff0, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/Local header offset out of range/)
  })

  test('a local header without its signature is refused when read', async () => {
    const blob = patched(archive, stored, (v) => v.setUint32(42, 1, true))
    const r = await LazyZipReader.open(blob)
    await expect(r.readEntry('stored.txt')).rejects.toThrow(/Bad local header signature/)
  })

  test('entry data running past the file is refused when read', async () => {
    const blob = patched(archive, stored, (v) => v.setUint32(20, 0x7fffff, true))
    const r = await LazyZipReader.open(blob)
    await expect(r.readEntry('stored.txt')).rejects.toThrow(/Entry data out of range/)
  })

  test('a stored entry whose sizes disagree is refused when read', async () => {
    const blob = patched(archive, stored, (v) => v.setUint32(24, 3, true))
    const r = await LazyZipReader.open(blob)
    await expect(r.readEntry('stored.txt')).rejects.toThrow(/Stored entry size mismatch/)
  })

  test('deflate data that cannot be inflated is refused when read', async () => {
    const local = new DataView(archive.buffer, archive.byteOffset).getUint32(deflated + 42, true)
    const copy = new Uint8Array(archive)
    const view = new DataView(copy.buffer)
    const dataStart =
      local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    copy.fill(0xff, dataStart, dataStart + 16)
    const r = await LazyZipReader.open(new Blob([copy]))
    await expect(r.readEntry('files/ab/abc')).rejects.toThrow(/Failed to inflate|size mismatch/)
  })

  test('a repeated name is recorded as a duplicate and the later entry is kept', async () => {
    const pair = zipSync({ 'a.txt': strToU8('first'), 'b.txt': strToU8('other') })
    const at = centralOffset(pair, centralIndexOf(pair, 'b.txt'))
    const copy = new Uint8Array(pair)
    copy[at + 46] = 'a'.charCodeAt(0)
    const r = await LazyZipReader.open(new Blob([copy]))
    expect(r.anomalies().duplicateNames).toEqual(['a.txt'])
    expect((await r.listEntries()).map((e) => e.name)).toEqual(['a.txt'])
    expect(new TextDecoder().decode(await r.readEntry('a.txt'))).toBe('other')
  })

  test('a ZIP64 size without its extra field is refused', async () => {
    const blob = patched(archive, stored, (v) => v.setUint32(24, 0xffffffff, true))
    await expect(LazyZipReader.open(blob)).rejects.toThrow(/extra field missing/)
  })
})
