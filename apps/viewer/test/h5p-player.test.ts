import { describe, expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import {
  buildPlayerHtml,
  type H5pEntries,
  isH5pFileName,
  normalizeVfsPath,
  orderedLibraries,
  resolveVfsEntry,
  unzipH5p,
  vfsMime,
} from '../src/lib/h5p-player.ts'

const ASSETS: Parameters<typeof buildPlayerHtml>[1] = {
  coreJs: '/* frame */',
  css: '/* css */',
}

function packageEntries(): H5pEntries {
  return [
    [
      'h5p.json',
      strToU8(
        '{"title":"t","mainLibrary":"H5P.T","preloadedDependencies":[{"machineName":"H5P.T","majorVersion":1,"minorVersion":0}]}',
      ),
    ],
    ['content/content.json', strToU8('{"text":"hi"}')],
    ['H5P.T-1.0/library.json', strToU8('{}')],
    ['H5P.T-1.0/t.js', strToU8('// lib')],
  ]
}

describe('unzipH5p', () => {
  test('round-trips a package and drops directory entries', () => {
    const zip = zipSync({
      'h5p.json': strToU8('{}'),
      'content/': new Uint8Array(),
      'content/content.json': strToU8('{}'),
    })
    const entries = unzipH5p(new Uint8Array(zip))
    expect(entries.map(([p]) => p).sort()).toEqual(['content/content.json', 'h5p.json'])
  })

  test('rejects archives without h5p.json', () => {
    const zip = zipSync({ 'readme.txt': strToU8('x') })
    expect(() => unzipH5p(new Uint8Array(zip))).toThrow(/h5p\.json/)
  })
})

describe('isH5pFileName / vfsMime', () => {
  test('detects the extension case-insensitively', () => {
    expect(isH5pFileName('demo.H5P')).toBe(true)
    expect(isH5pFileName('demo.zip')).toBe(false)
  })

  test('maps virtual file types', () => {
    expect(vfsMime('a/library.json')).toBe('application/json')
    expect(vfsMime('a/lib.js')).toBe('text/javascript')
    expect(vfsMime('a/style.css')).toBe('text/css')
    expect(vfsMime('a/data.bin')).toBe('application/octet-stream')
  })
})

describe('normalizeVfsPath', () => {
  test('strips query, hash and leading segments', () => {
    expect(normalizeVfsPath('/pkg/h5p.json?x=1')).toBe('pkg/h5p.json')
    expect(normalizeVfsPath('./content/content.json#frag')).toBe('content/content.json')
    expect(normalizeVfsPath('')).toBe('')
  })
})

describe('resolveVfsEntry', () => {
  const entries = packageEntries()

  test('matches exactly and by suffix in both directions', () => {
    expect(resolveVfsEntry(entries, 'h5p.json')?.[0]).toBe('h5p.json')
    expect(resolveVfsEntry(entries, '/pkg/H5P.T-1.0/library.json')?.[0]).toBe(
      'H5P.T-1.0/library.json',
    )
  })

  test('returns undefined for unknown paths', () => {
    expect(resolveVfsEntry(entries, '/etc/passwd')).toBeUndefined()
    expect(resolveVfsEntry(entries, '')).toBeUndefined()
  })
})

describe('orderedLibraries', () => {
  function libEntries(): H5pEntries {
    const base: H5pEntries = [
      [
        'h5p.json',
        strToU8(
          JSON.stringify({
            mainLibrary: 'H5P.Parent',
            preloadedDependencies: [
              { machineName: 'H5P.Parent', majorVersion: 1, minorVersion: 0 },
            ],
          }),
        ),
      ],
      ['content/content.json', strToU8('{}')],
      [
        'H5P.Parent-1.0/library.json',
        strToU8(
          JSON.stringify({
            machineName: 'H5P.Parent',
            majorVersion: 1,
            minorVersion: 0,
            preloadedDependencies: [{ machineName: 'H5P.Child', majorVersion: 2, minorVersion: 1 }],
            preloadedCss: [{ path: 'parent.css' }],
            preloadedJs: [{ path: 'parent.js' }],
          }),
        ),
      ],
      ['H5P.Parent-1.0/parent.js', strToU8('// parent')],
      ['H5P.Parent-1.0/parent.css', strToU8('.p{}')],
      [
        'H5P.Child-2.1/library.json',
        strToU8(
          JSON.stringify({
            machineName: 'H5P.Child',
            majorVersion: 2,
            minorVersion: 1,
            preloadedJs: [{ path: 'child.js' }],
          }),
        ),
      ],
      ['H5P.Child-2.1/child.js', strToU8('// child')],
    ]
    return base
  }

  test('orders dependencies before dependents', () => {
    const libs = orderedLibraries(libEntries())
    expect(libs.map((l) => l.folder)).toEqual(['H5P.Child-2.1', 'H5P.Parent-1.0'])
    expect(libs[1]?.js).toEqual(['// parent'])
    expect(libs[0]?.css).toEqual([])
  })

  test('throws when a dependency file is missing', () => {
    const entries = libEntries().filter(([p]) => p !== 'H5P.Child-2.1/child.js')
    expect(() => orderedLibraries(entries)).toThrow(/missing library file/)
  })

  test('buildPlayerHtml embeds integration, core and libraries in order', () => {
    const html = buildPlayerHtml(libEntries(), ASSETS)
    expect(html).toContain('window.H5PIntegration')
    expect(html).toContain('H5P.init(document.body)')
    expect(html).toContain('/* frame */')
    expect(html.indexOf('// child')).toBeLessThan(html.indexOf('// parent'))
  })

  test('throws when the main library is not declared', () => {
    const entries: H5pEntries = [
      ['h5p.json', strToU8(JSON.stringify({ mainLibrary: 'H5P.Missing' }))],
      ['content/content.json', strToU8('{}')],
    ]
    expect(() => buildPlayerHtml(entries, ASSETS)).toThrow(/not declared/)
  })
})

describe('buildPlayerHtml', () => {
  const html = buildPlayerHtml(packageEntries(), ASSETS)

  test('embeds the integration payload and boot call', () => {
    expect(html).toContain('window.H5PIntegration')
    expect(html).toContain('"jsonContent"')
    expect(html).toContain('H5P.init(document.body)')
  })

  test('escapes script-breaking sequences in embedded sources', () => {
    const hostile: H5pEntries = [
      [
        'h5p.json',
        strToU8(
          JSON.stringify({
            mainLibrary: 'H5P.X',
            preloadedDependencies: [{ machineName: 'H5P.X', majorVersion: 1, minorVersion: 0 }],
          }),
        ),
      ],
      ['content/content.json', strToU8('{}')],
      [
        'H5P.X-1.0/library.json',
        strToU8(
          JSON.stringify({
            machineName: 'H5P.X',
            majorVersion: 1,
            minorVersion: 0,
            preloadedJs: [{ path: 'x.js' }],
          }),
        ),
      ],
      ['H5P.X-1.0/x.js', strToU8('var s = "</script><b>evil</b>";')],
    ]
    const out = buildPlayerHtml(hostile, ASSETS)
    expect(out).not.toContain('</script><b>')
  })

  test('inlines the core script and injects a CSP meta', () => {
    expect(html).toContain('<script>/* frame */</script>')
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("connect-src 'none'")
  })
})
