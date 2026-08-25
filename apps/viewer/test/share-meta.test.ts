import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')

const meta = (attr: 'property' | 'name', key: string): string | undefined =>
  new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1]

describe('share card metadata', () => {
  test('the card carries a title, description and site name', () => {
    expect(meta('property', 'og:title')).toBe("MBZoo — See what's inside your MBZ")
    expect(meta('property', 'og:site_name')).toBe('MBZoo')
    expect(meta('property', 'og:description')).toBeTruthy()
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'))
  })

  // A crawler has no base to resolve against: a relative og:image silently
  // yields a card with no picture, which is the whole point of these tags.
  test('every shared URL is absolute', () => {
    for (const key of ['og:url', 'og:image'] as const) {
      expect(meta('property', key)).toStartWith('https://')
    }
    expect(meta('name', 'twitter:image')).toStartWith('https://')
  })

  test('the image the card points at is actually shipped', () => {
    const url = meta('property', 'og:image') ?? ''
    const file = url.slice(url.lastIndexOf('/') + 1)
    expect(existsSync(join(ROOT, 'public', file))).toBe(true)
  })

  // A square logo in a large-image card gets cropped; summary is the fit.
  test('the twitter card matches the image shape', () => {
    expect(meta('name', 'twitter:card')).toBe('summary')
  })

  test('the declared image size matches the file it names', async () => {
    const url = meta('property', 'og:image') ?? ''
    const file = url.slice(url.lastIndexOf('/') + 1)
    const bytes = new Uint8Array(readFileSync(join(ROOT, 'public', file)))
    // PNG IHDR: width/height are big-endian uint32 at offsets 16 and 20.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(String(view.getUint32(16))).toBe(meta('property', 'og:image:width') ?? '')
    expect(String(view.getUint32(20))).toBe(meta('property', 'og:image:height') ?? '')
  })
})
