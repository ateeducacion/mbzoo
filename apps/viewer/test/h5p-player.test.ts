import { describe, expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import {
  buildPlayerHtml,
  type H5pEntries,
  isH5pFileName,
  orderedLibraries,
  unzipH5p,
  vfsMime,
} from '../src/lib/h5p-player.ts'

const ASSETS: Parameters<typeof buildPlayerHtml>[1] = {
  coreJs: '/* frame */',
  css: '/* css */',
}

const entriesOf = (files: Record<string, string>): H5pEntries =>
  new Map(Object.entries(files).map(([path, text]) => [path, strToU8(text)]))

function packageEntries(): H5pEntries {
  return entriesOf({
    'h5p.json':
      '{"title":"t","mainLibrary":"H5P.T","preloadedDependencies":[{"machineName":"H5P.T","majorVersion":1,"minorVersion":0}]}',
    'content/content.json': '{"text":"hi"}',
    'H5P.T-1.0/library.json': '{}',
    'H5P.T-1.0/t.js': '// lib',
  })
}

describe('unzipH5p', () => {
  test('round-trips a package and drops directory entries', () => {
    const zip = zipSync({
      'h5p.json': strToU8('{}'),
      'content/': new Uint8Array(),
      'content/content.json': strToU8('{}'),
    })
    const entries = unzipH5p(new Uint8Array(zip))
    expect([...entries.keys()].sort()).toEqual(['content/content.json', 'h5p.json'])
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

describe('orderedLibraries', () => {
  function libEntries(): H5pEntries {
    return entriesOf({
      'h5p.json': JSON.stringify({
        mainLibrary: 'H5P.Parent',
        preloadedDependencies: [{ machineName: 'H5P.Parent', majorVersion: 1, minorVersion: 0 }],
      }),
      'content/content.json': '{}',
      'H5P.Parent-1.0/library.json': JSON.stringify({
        machineName: 'H5P.Parent',
        majorVersion: 1,
        minorVersion: 0,
        preloadedDependencies: [{ machineName: 'H5P.Child', majorVersion: 2, minorVersion: 1 }],
        preloadedCss: [{ path: 'parent.css' }],
        preloadedJs: [{ path: 'parent.js' }],
      }),
      'H5P.Parent-1.0/parent.js': '// parent',
      'H5P.Parent-1.0/parent.css': '.p{}',
      'H5P.Child-2.1/library.json': JSON.stringify({
        machineName: 'H5P.Child',
        majorVersion: 2,
        minorVersion: 1,
        preloadedJs: [{ path: 'child.js' }],
      }),
      'H5P.Child-2.1/child.js': '// child',
    })
  }

  test('orders dependencies before dependents', () => {
    const libs = orderedLibraries(libEntries())
    expect(libs.map((l) => l.folder)).toEqual(['H5P.Child-2.1', 'H5P.Parent-1.0'])
    expect(libs[1]?.js).toEqual([['H5P.Parent-1.0/parent.js', '// parent']])
    expect(libs[0]?.css).toEqual([])
  })

  test('throws when a dependency file is missing', () => {
    const entries = libEntries()
    entries.delete('H5P.Child-2.1/child.js')
    expect(() => orderedLibraries(entries)).toThrow(/missing library file/)
  })

  test('ignores malformed dependency entries instead of throwing', () => {
    const entries = libEntries()
    entries.set(
      'h5p.json',
      strToU8(
        JSON.stringify({
          mainLibrary: 'H5P.Parent',
          preloadedDependencies: [
            { machineName: 'H5P.Parent', majorVersion: 1, minorVersion: 0 },
            { machineName: 42 },
            null,
            'nonsense',
          ],
        }),
      ),
    )
    expect(orderedLibraries(entries).map((l) => l.folder)).toEqual([
      'H5P.Child-2.1',
      'H5P.Parent-1.0',
    ])
  })

  test('accepts the string versions real packages ship (H5P.DragText 1.8)', () => {
    const entries = entriesOf({
      'h5p.json': JSON.stringify({
        mainLibrary: 'H5P.S',
        preloadedDependencies: [{ machineName: 'H5P.S', majorVersion: '1', minorVersion: '8' }],
      }),
      'content/content.json': '{}',
      'H5P.S-1.8/library.json': JSON.stringify({
        machineName: 'H5P.S',
        majorVersion: '1',
        minorVersion: '8',
        preloadedJs: [{ path: 's.js' }],
      }),
      'H5P.S-1.8/s.js': '// s',
    })
    expect(orderedLibraries(entries).map((l) => l.folder)).toEqual(['H5P.S-1.8'])
    expect(buildPlayerHtml(entries, ASSETS)).toContain('H5P.S 1.8')
  })

  test('survives a dependency cycle', () => {
    const entries = libEntries()
    entries.set(
      'H5P.Child-2.1/library.json',
      strToU8(
        JSON.stringify({
          machineName: 'H5P.Child',
          majorVersion: 2,
          minorVersion: 1,
          preloadedDependencies: [{ machineName: 'H5P.Parent', majorVersion: 1, minorVersion: 0 }],
        }),
      ),
    )
    expect(orderedLibraries(entries).map((l) => l.folder)).toEqual([
      'H5P.Child-2.1',
      'H5P.Parent-1.0',
    ])
  })

  test('buildPlayerHtml embeds integration, core and libraries in order', () => {
    const html = buildPlayerHtml(libEntries(), ASSETS)
    expect(html).toContain('window.H5PIntegration')
    expect(html).toContain('H5P.init(document.body)')
    expect(html).toContain('/* frame */')
    expect(html.indexOf('// child')).toBeLessThan(html.indexOf('// parent'))
  })

  test('does not repeat inlined library sources in the base64 VFS', () => {
    const html = buildPlayerHtml(libEntries(), ASSETS)
    expect(html).not.toContain(btoa('// parent'))
    expect(html).not.toContain(btoa('.p{}'))
    // The package files that are not inlined stay reachable through the VFS.
    expect(html).toContain('H5P.Parent-1.0/library.json')
  })

  test('throws when the main library is not declared', () => {
    const entries = entriesOf({
      'h5p.json': JSON.stringify({ mainLibrary: 'H5P.Missing' }),
      'content/content.json': '{}',
    })
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

  test('escapes script-breaking sequences in embedded library JS', () => {
    const hostile = entriesOf({
      'h5p.json': JSON.stringify({
        mainLibrary: 'H5P.X',
        preloadedDependencies: [{ machineName: 'H5P.X', majorVersion: 1, minorVersion: 0 }],
      }),
      'content/content.json': '{}',
      'H5P.X-1.0/library.json': JSON.stringify({
        machineName: 'H5P.X',
        majorVersion: 1,
        minorVersion: 0,
        preloadedJs: [{ path: 'x.js' }],
      }),
      'H5P.X-1.0/x.js': 'var s = "</script><b>evil</b>";',
    })
    expect(buildPlayerHtml(hostile, ASSETS)).not.toContain('</script><b>')
  })

  test('escapes </style> in embedded library CSS', () => {
    const hostile = entriesOf({
      'h5p.json': JSON.stringify({
        mainLibrary: 'H5P.X',
        preloadedDependencies: [{ machineName: 'H5P.X', majorVersion: 1, minorVersion: 0 }],
      }),
      'content/content.json': '{}',
      'H5P.X-1.0/library.json': JSON.stringify({
        machineName: 'H5P.X',
        majorVersion: 1,
        minorVersion: 0,
        preloadedCss: [{ path: 'x.css' }],
      }),
      'H5P.X-1.0/x.css': 'a{}</style><img src=x onerror=alert(1)>',
    })
    expect(buildPlayerHtml(hostile, ASSETS)).not.toContain('</style><img')
  })

  test('escapes </script> carried by a zip entry name into the VFS block', () => {
    const hostile = entriesOf({
      'h5p.json': JSON.stringify({
        mainLibrary: 'H5P.X',
        preloadedDependencies: [{ machineName: 'H5P.X', majorVersion: 1, minorVersion: 0 }],
      }),
      'content/content.json': '{}',
      'H5P.X-1.0/library.json': JSON.stringify({
        machineName: 'H5P.X',
        majorVersion: 1,
        minorVersion: 0,
      }),
      'a</script><img src=x onerror=alert(1)>.png': 'x',
    })
    const out = buildPlayerHtml(hostile, ASSETS)
    expect(out).not.toContain('</script><img')
    expect(out).toContain('\\u003c/script')
  })

  test('escapes </script> carried by content.json into the integration block', () => {
    const hostile = entriesOf({
      'h5p.json': JSON.stringify({
        mainLibrary: 'H5P.X',
        preloadedDependencies: [{ machineName: 'H5P.X', majorVersion: 1, minorVersion: 0 }],
      }),
      'content/content.json': '{"t":"</script><img src=x onerror=alert(1)>"}',
      'H5P.X-1.0/library.json': JSON.stringify({
        machineName: 'H5P.X',
        majorVersion: 1,
        minorVersion: 0,
      }),
    })
    expect(buildPlayerHtml(hostile, ASSETS)).not.toContain('</script><img')
  })

  test('rejects a package whose content.json does not parse', () => {
    const broken = entriesOf({
      'h5p.json': JSON.stringify({
        mainLibrary: 'H5P.X',
        preloadedDependencies: [{ machineName: 'H5P.X', majorVersion: 1, minorVersion: 0 }],
      }),
      'content/content.json': '{"t": oops}',
      'H5P.X-1.0/library.json': JSON.stringify({
        machineName: 'H5P.X',
        majorVersion: 1,
        minorVersion: 0,
      }),
    })
    expect(() => buildPlayerHtml(broken, ASSETS)).toThrow(/content\/content\.json/)
  })

  test('rejects malformed package JSON instead of leaking a parser error', () => {
    const broken = entriesOf({
      'h5p.json': '{"mainLibrary":"H5P.X", oops}',
      'content/content.json': '{}',
    })
    expect(() => buildPlayerHtml(broken, ASSETS)).toThrow(/malformed JSON/)
  })

  test('rejects a package whose dependency list is not an array', () => {
    const broken = entriesOf({
      'h5p.json': '{"mainLibrary":"H5P.X","preloadedDependencies":"nope"}',
      'content/content.json': '{}',
    })
    expect(() => buildPlayerHtml(broken, ASSETS)).toThrow(/not declared/)
  })

  test('inlines the core script and injects a CSP meta', () => {
    expect(html).toContain('<script>/* frame */</script>')
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("connect-src 'none'")
  })
})
