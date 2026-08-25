import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/**
 * The manifest is the fixture integrity contract (AGENTS.md): unexpected
 * checksum drift is a regression. Nothing enforced it before, so a stale
 * byte count could ship unnoticed.
 */
const MANIFEST = join(import.meta.dir, 'manifest.yaml')
const FILES = join(import.meta.dir, 'files')

interface Recorded {
  name: string
  sha256: string
  bytes: number
}

function recordedFixtures(text: string): Recorded[] {
  const out: Recorded[] = []
  let current: string | undefined
  let sha: string | undefined
  let bytes: number | undefined
  for (const line of text.split('\n')) {
    const name = /^ {2}([\w.-]+\.mbz):\s*$/.exec(line)
    if (name?.[1]) {
      current = name[1]
      sha = undefined
      bytes = undefined
      continue
    }
    if (!current) continue
    sha = /^ {4}sha256:\s*([0-9a-f]{64})\s*$/.exec(line)?.[1] ?? sha
    const size = /^ {4}bytes:\s*(\d+)\s*$/.exec(line)?.[1]
    if (size) bytes = Number(size)
    if (sha && bytes !== undefined) {
      out.push({ name: current, sha256: sha, bytes })
      current = undefined
    }
  }
  return out
}

describe('fixtures/manifest.yaml', () => {
  test('records at least one fixture', async () => {
    const entries = recordedFixtures(await Bun.file(MANIFEST).text())
    expect(entries.length).toBeGreaterThan(0)
  })

  test('every recorded sha256 and byte count matches the committed file', async () => {
    const entries = recordedFixtures(await Bun.file(MANIFEST).text())
    for (const entry of entries) {
      const bytes = new Uint8Array(await Bun.file(join(FILES, entry.name)).arrayBuffer())
      expect(`${entry.name}:${bytes.byteLength}`).toBe(`${entry.name}:${entry.bytes}`)
      const digest = createHash('sha256').update(bytes).digest('hex')
      expect(`${entry.name}:${digest}`).toBe(`${entry.name}:${entry.sha256}`)
    }
  })

  test('the viewer example copy is byte-identical to the fixture', async () => {
    const a = new Uint8Array(await Bun.file(join(FILES, 'demo-course-zip.mbz')).arrayBuffer())
    const b = new Uint8Array(
      await Bun.file(
        join(import.meta.dir, '..', 'apps', 'viewer', 'public', 'demo-course-zip.mbz'),
      ).arrayBuffer(),
    )
    expect(createHash('sha256').update(b).digest('hex')).toBe(
      createHash('sha256').update(a).digest('hex'),
    )
  })
})
