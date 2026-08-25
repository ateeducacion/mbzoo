import { describe, expect, test } from 'bun:test'
import type { BackupFileRecord } from '@mbzoo/core'
import {
  composeHvpEntries,
  hvpFields,
  MAX_HVP_PACKAGE_BYTES,
  subContentLibraries,
} from '../src/lib/hvp-package.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

function rec(
  area: 'libraries' | 'content',
  filePath: string,
  fileName: string,
  body: string,
  itemId = '0',
): BackupFileRecord {
  return {
    contentHash: `${area}:${filePath}${fileName}`,
    filePath,
    fileName,
    mimeType: '',
    fileSize: body.length,
    component: 'mod_hvp',
    fileArea: area,
    itemId,
    contextId: area === 'libraries' ? '1' : '900',
    sortOrder: 0,
  }
}
const bodies = new Map<string, string>()
const R = (...args: Parameters<typeof rec>): BackupFileRecord => {
  const r = rec(...args)
  bodies.set(r.contentHash, args[3])
  return r
}
const read = async (r: BackupFileRecord): Promise<Uint8Array | undefined> => {
  const b = bodies.get(r.contentHash)
  return b === undefined ? undefined : enc.encode(b)
}

// The real shape: main library depends on a base library; a third library
// is present in the course but unused by this content.
const records: BackupFileRecord[] = [
  R(
    'libraries',
    '/H5P.Demo-1.2/',
    'library.json',
    JSON.stringify({
      machineName: 'H5P.Demo',
      preloadedJs: [{ path: 'demo.js' }],
      preloadedDependencies: [{ machineName: 'H5P.Base', majorVersion: 1, minorVersion: 0 }],
    }),
  ),
  R('libraries', '/H5P.Demo-1.2/', 'demo.js', 'var demo = 1;'),
  R(
    'libraries',
    '/H5P.Base-1.0/',
    'library.json',
    JSON.stringify({ machineName: 'H5P.Base', preloadedJs: [{ path: 'base.js' }] }),
  ),
  R('libraries', '/H5P.Base-1.0/', 'base.js', 'var base = 1;'),
  R('libraries', '/H5P.Base-1.0/fonts/', 'x.woff', 'font'),
  R('libraries', '/H5P.Unused-3.0/', 'library.json', JSON.stringify({ machineName: 'H5P.Unused' })),
  R('content', '/images/', 'pic.png', 'PNG', '42'),
  R('content', '/images/', 'other.png', 'PNG2', '43'),
]
const fields = new Map([
  ['id', '42'],
  ['name', 'Demo content'],
  ['machine_name', 'H5P.Demo'],
  ['major_version', '1'],
  ['minor_version', '2'],
  ['json_content', '{"text":"hi"}'],
  ['license', 'CC BY'],
])

describe('hvpFields', () => {
  test('reads the main library and parameters from hvp.xml leaves', () => {
    expect(hvpFields(fields)).toEqual({
      machineName: 'H5P.Demo',
      majorVersion: '1',
      minorVersion: '2',
      jsonContent: '{"text":"hi"}',
      title: 'Demo content',
      license: 'CC BY',
    })
  })

  test('refuses a library name that could escape into a path', () => {
    expect(hvpFields(new Map([...fields, ['machine_name', '../evil']]))).toBeUndefined()
    expect(hvpFields(new Map([...fields, ['major_version', '1; rm']]))).toBeUndefined()
    expect(hvpFields(new Map([...fields, ['json_content', '']]))).toBeUndefined()
  })
})

describe('composeHvpEntries', () => {
  test('folds hvp.xml, the needed libraries and this activity media into a package', async () => {
    const hvp = hvpFields(fields)
    if (!hvp) throw new Error('fields')
    const entries = await composeHvpEntries(hvp, '42', records, read)
    const keys = [...entries.keys()].sort()
    expect(keys).toEqual([
      'H5P.Base-1.0/base.js',
      'H5P.Base-1.0/fonts/x.woff',
      'H5P.Base-1.0/library.json',
      'H5P.Demo-1.2/demo.js',
      'H5P.Demo-1.2/library.json',
      'content/content.json',
      'content/images/pic.png',
      'h5p.json',
    ])
    // Another activity's media (itemid 43) and an unused library stay out.
    expect(keys).not.toContain('content/images/other.png')
    expect(keys.some((k) => k.startsWith('H5P.Unused'))).toBe(false)
    const h5p = JSON.parse(dec.decode(entries.get('h5p.json')))
    expect(h5p.mainLibrary).toBe('H5P.Demo')
    expect(h5p.preloadedDependencies).toEqual([
      { machineName: 'H5P.Demo', majorVersion: 1, minorVersion: 2 },
    ])
    expect(dec.decode(entries.get('content/content.json'))).toBe('{"text":"hi"}')
  })

  test('a dependency the course does not ship is an error, not a silent gap', async () => {
    const hvp = hvpFields(new Map([...fields, ['machine_name', 'H5P.Missing']]))
    if (!hvp) throw new Error('fields')
    await expect(composeHvpEntries(hvp, '42', records, read)).rejects.toThrow(/not in backup/)
  })

  test('a library whose library.json is malformed is refused', async () => {
    const broken = [...records, R('libraries', '/H5P.Bad-1.0/', 'library.json', '{not json')]
    const hvp = hvpFields(
      new Map([
        ...fields,
        ['machine_name', 'H5P.Bad'],
        ['major_version', '1'],
        ['minor_version', '0'],
      ]),
    )
    if (!hvp) throw new Error('fields')
    await expect(composeHvpEntries(hvp, '42', broken, read)).rejects.toThrow(/malformed/)
  })

  test('the size budget bounds what a hostile backup can make us hold', async () => {
    const huge = {
      ...rec('content', '/', 'big.bin', '', '42'),
      fileSize: MAX_HVP_PACKAGE_BYTES + 1,
    }
    const hvp = hvpFields(fields)
    if (!hvp) throw new Error('fields')
    const readHuge = async (r: BackupFileRecord): Promise<Uint8Array | undefined> =>
      r.fileName === 'big.bin' ? new Uint8Array(MAX_HVP_PACKAGE_BYTES + 1) : read(r)
    await expect(composeHvpEntries(hvp, '42', [...records, huge], readHuge)).rejects.toThrow(
      /budget/,
    )
  })
})

describe('subContentLibraries', () => {
  test('reads the libraries the parameters name, once each, validated', () => {
    const params = JSON.stringify({
      pages: [
        {
          library: 'H5P.StandardPage 1.5',
          params: { elements: [{ library: 'H5P.AdvancedText 1.1' }] },
        },
        { library: 'H5P.StandardPage 1.5' },
      ],
      poster: { library: 'H5P.Image 1.1' },
      evil: { library: '../etc 1.0' },
      notALibrary: { library: 'nope' },
    })
    expect(subContentLibraries(params)).toEqual([
      { machineName: 'H5P.StandardPage', majorVersion: 1, minorVersion: 5 },
      { machineName: 'H5P.AdvancedText', majorVersion: 1, minorVersion: 1 },
      { machineName: 'H5P.Image', majorVersion: 1, minorVersion: 1 },
    ])
  })

  test('sub-content libraries join the package even when the main manifest omits them', async () => {
    const withSub = [
      ...records,
      R(
        'libraries',
        '/H5P.Sub-2.0/',
        'library.json',
        JSON.stringify({ machineName: 'H5P.Sub', preloadedJs: [{ path: 'sub.js' }] }),
      ),
      R('libraries', '/H5P.Sub-2.0/', 'sub.js', 'var sub = 1;'),
    ]
    const hvp = hvpFields(
      new Map([...fields, ['json_content', '{"a":{"library":"H5P.Sub 2.0","params":{}}}']]),
    )
    if (!hvp) throw new Error('fields')
    const entries = await composeHvpEntries(hvp, '42', withSub, read)
    expect([...entries.keys()]).toContain('H5P.Sub-2.0/sub.js')
  })
})
