import { describe, expect, test } from 'bun:test'
import type { ScormSco } from '@mbzoo/core'
import {
  runtimeScript,
  scormBootScript,
  scormToc,
  scoVfsKey,
  splitLaunch,
  stripSourceMap,
} from '../src/lib/scorm-player.ts'

const sco = (identifier: string, parent: string, launch = ''): ScormSco => ({
  id: 0,
  identifier,
  parent,
  organization: parent === '/' ? '' : 'ORG',
  title: identifier,
  launch,
  scormType: launch === '' ? '' : 'sco',
  sortOrder: 0,
  visible: true,
  parameters: '',
})

describe('scormToc', () => {
  test('flattens Moodle parent identifiers into a depth-annotated list', () => {
    const toc = scormToc([
      sco('ORG', '/'),
      sco('A', 'ORG', 'a.html'),
      sco('A1', 'A', 'a1.html'),
      sco('B', 'ORG', 'b.html'),
    ])
    expect(toc.map((n) => [n.sco.identifier, n.depth])).toEqual([
      ['ORG', 0],
      ['A', 1],
      ['A1', 2],
      ['B', 1],
    ])
  })

  test('a parent that never appears still lists the row instead of losing it', () => {
    const toc = scormToc([sco('ORG', '/'), sco('LOST', 'NOPE', 'x.html')])
    expect(toc.map((n) => n.sco.identifier)).toEqual(['ORG', 'LOST'])
  })

  test('a cycle in the parent chain terminates', () => {
    const toc = scormToc([sco('A', 'B', 'a.html'), sco('B', 'A', 'b.html')])
    expect(toc).toHaveLength(2)
  })
})

describe('splitLaunch', () => {
  test('separates the archive path from a query, joining sco_data parameters', () => {
    expect(splitLaunch('index.html')).toEqual({ path: 'index.html', query: '' })
    expect(splitLaunch('index.html?page=2')).toEqual({ path: 'index.html', query: '?page=2' })
    expect(splitLaunch('index.html?page=2', 'mode=demo')).toEqual({
      path: 'index.html',
      query: '?page=2&mode=demo',
    })
    expect(splitLaunch('index.html', '?a=1')).toEqual({ path: 'index.html', query: '?a=1' })
  })
})

describe('scormBootScript', () => {
  test('defines the global each standard looks for, and keeps the runtime offline', () => {
    const v12 = scormBootScript(false)
    expect(v12).toContain('window.API=new Scorm12API(')
    expect(v12).toContain('"lmsCommitUrl":false')
    expect(v12).toContain('"enableOfflineSupport":false')
    const v2004 = scormBootScript(true)
    expect(v2004).toContain('window.API_1484_11=new Scorm2004API(')
  })
})

describe('runtimeScript', () => {
  test('drops the source map comment, which would resolve against a blob: document', () => {
    expect(stripSourceMap('var a=1;\n//# sourceMappingURL=scorm12.min.js.map\n')).not.toContain(
      'sourceMappingURL',
    )
    expect(runtimeScript('var a=1;')).toBe('<script>var a=1;</script>')
  })
})

describe('scoVfsKey', () => {
  test('is the package-relative path a SCO uses', () => {
    expect(scoVfsKey({ filePath: '/', fileName: 'index.html' })).toBe('index.html')
    expect(scoVfsKey({ filePath: '/assets/js/', fileName: 'CPM.js' })).toBe('assets/js/CPM.js')
  })
})
