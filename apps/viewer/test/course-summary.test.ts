import { describe, expect, test } from 'bun:test'
import type { CourseInfo, ParsedBackup } from '@mbzoo/core'
import { buildCourseData, courseDataRows } from '../src/course-summary.ts'
import { appendRawXml, MAX_RAW_CHARS, rawXmlView } from '../src/lib/raw-xml.ts'

const COURSE: CourseInfo = {
  id: 1001,
  contextId: '101',
  fullname: 'Demo Course for MBZoo',
  shortname: 'DEMO-101',
  idNumber: 'MBZOO-DEMO',
  summary: '',
  startDate: 1700000000,
  format: 'topics',
  originalWwwroot: 'https://demo.example.invalid',
  source: { xmlPath: 'course/course.xml' },
}

function emptyBackup(course: CourseInfo = COURSE): ParsedBackup {
  return {
    format: 'zip',
    includesUserData: false,
    moodleRelease: '4.4',
    course,
    sections: [],
    activities: [],
    files: new Map(),
    warnings: [],
  }
}

describe('courseDataRows', () => {
  test('lists identifiers and config, with em dash for blanks', () => {
    const rows = Object.fromEntries(courseDataRows(COURSE, 'en'))
    expect(rows.courseid).toBe('1001')
    expect(rows.contextid).toBe('101')
    expect(rows.idnumber).toBe('MBZOO-DEMO')
    expect(rows.shortname).toBe('DEMO-101')
    expect(rows.format).toBe('topics')
    expect(rows.startdate).not.toBe('—')
    expect(rows.startdate).toContain('2023')
    expect(rows.original_wwwroot).toBe('https://demo.example.invalid')
  })

  test('missing id, dates and empty strings become an em dash', () => {
    const rows = Object.fromEntries(
      courseDataRows(
        {
          contextId: '',
          fullname: 'X',
          shortname: '',
          idNumber: '',
          summary: '',
          format: '',
          originalWwwroot: '',
          source: { xmlPath: 'course/course.xml' },
        },
        'en',
      ),
    )
    expect(rows.courseid).toBe('—')
    expect(rows.contextid).toBe('—')
    expect(rows.idnumber).toBe('—')
    expect(rows.startdate).toBe('—')
    expect(rows.original_wwwroot).toBe('—')
  })
})

describe('rawXmlView', () => {
  test('empty XML is a missing document, not a truncated one', () => {
    expect(rawXmlView('')).toEqual({ empty: true, truncated: false, source: '', size: 0 })
  })

  test('keeps short XML whole and slices a long one', () => {
    expect(rawXmlView('<course/>')).toEqual({
      empty: false,
      truncated: false,
      source: '<course/>',
      size: 9,
    })
    const big = 'x'.repeat(MAX_RAW_CHARS + 10)
    const view = rawXmlView(big)
    expect(view.truncated).toBe(true)
    expect(view.source).toHaveLength(MAX_RAW_CHARS)
    expect(view.size).toBe(big.length)
  })
})

// bun:test has no document. A tiny stand-in is enough to paint the Raw view
// and the course-data disclosure without pulling in a DOM library.
type FakeNode = {
  readonly nodeName: string
  className: string
  textContent: string
  hidden: boolean
  open: boolean
  isConnected: boolean
  childNodes: FakeNode[]
  listeners: Map<string, Array<() => void>>
  appendChild(node: FakeNode): FakeNode
  append(...nodes: Array<FakeNode | string>): void
  addEventListener(type: string, fn: () => void): void
  dispatchEvent(event: { type: string }): void
}

function fakeNode(nodeName: string, text = ''): FakeNode {
  const node: FakeNode = {
    nodeName,
    className: '',
    textContent: text,
    hidden: false,
    open: false,
    isConnected: true,
    childNodes: [],
    listeners: new Map(),
    appendChild(child) {
      node.childNodes.push(child)
      return child
    },
    append(...bits) {
      for (const bit of bits) {
        node.appendChild(typeof bit === 'string' ? fakeNode('#text', bit) : bit)
      }
    },
    addEventListener(type, fn) {
      const list = node.listeners.get(type) ?? []
      list.push(fn)
      node.listeners.set(type, list)
    },
    dispatchEvent(event) {
      for (const fn of node.listeners.get(event.type) ?? []) fn()
    },
  }
  return node
}

function installFakeDom(): void {
  const doc = {
    createElement(tag: string) {
      return fakeNode(tag.toUpperCase())
    },
    createTextNode(text: string) {
      return fakeNode('#text', text)
    },
  }
  Object.assign(globalThis, { document: doc })
}

function treeText(node: FakeNode): string {
  if (node.childNodes.length === 0) return node.textContent
  return node.childNodes.map(treeText).join('')
}

function findClass(node: FakeNode, className: string): FakeNode | undefined {
  if (node.className.split(/\s+/).includes(className)) return node
  for (const child of node.childNodes) {
    const hit = findClass(child, className)
    if (hit) return hit
  }
  return undefined
}

describe('appendRawXml', () => {
  test('paints XML as classified text and never creates a script node', () => {
    installFakeDom()
    const panel = fakeNode('DIV')
    appendRawXml(
      panel as unknown as HTMLElement,
      '<course id="1"><summary><script>alert(1)</script></summary></course>',
      'course/course.xml',
    )
    expect(treeText(panel)).toContain('course/course.xml')
    expect(treeText(panel)).toContain('<course')
    expect(treeText(panel)).toContain('script')
    expect(panel.childNodes.some((n) => n.nodeName === 'SCRIPT')).toBe(false)
    const pre = findClass(panel, 'raw-xml')
    expect(pre).toBeDefined()
    expect(pre?.childNodes.some((n) => n.nodeName === 'SCRIPT')).toBe(false)
  })

  test('empty XML shows the missing note', () => {
    installFakeDom()
    const panel = fakeNode('DIV')
    appendRawXml(panel as unknown as HTMLElement, '', 'course/course.xml', 'gone')
    expect(treeText(panel)).toBe('gone')
  })

  test('truncates a huge document and notes the cut', () => {
    installFakeDom()
    const panel = fakeNode('DIV')
    appendRawXml(
      panel as unknown as HTMLElement,
      `<course>${'x'.repeat(MAX_RAW_CHARS)}</course>`,
      'p.xml',
    )
    expect(treeText(panel)).toContain('…')
    expect(treeText(panel)).toContain(String(MAX_RAW_CHARS))
  })
})

describe('buildCourseData', () => {
  test('folds identifiers behind a disclosure and loads course.xml on open', async () => {
    installFakeDom()
    const xml = '<course id="1001" contextid="101"><idnumber>MBZOO-DEMO</idnumber></course>'
    const details = buildCourseData(
      emptyBackup(),
      {
        readEntry: async () => new TextEncoder().encode(xml),
        badgeTone: () => '',
      },
      'en',
    ) as unknown as FakeNode

    expect(details.nodeName).toBe('DETAILS')
    expect(treeText(details)).toContain('courseid')
    expect(treeText(details)).toContain('1001')
    expect(treeText(details)).toContain('MBZOO-DEMO')
    expect(findClass(details, 'raw-xml')).toBeUndefined()

    details.open = true
    details.dispatchEvent({ type: 'toggle' })
    await Promise.resolve()
    await Promise.resolve()

    expect(findClass(details, 'raw-path')?.textContent).toBe('course/course.xml')
    expect(treeText(findClass(details, 'raw-xml') ?? fakeNode('PRE'))).toContain('<course')
    expect(treeText(findClass(details, 'raw-xml') ?? fakeNode('PRE'))).toContain('MBZOO-DEMO')
  })

  test('a missing course.xml still shows identifiers and the missing note', async () => {
    installFakeDom()
    const details = buildCourseData(
      emptyBackup(),
      {
        readEntry: async () => {
          throw new Error('absent')
        },
        badgeTone: () => '',
      },
      'en',
    ) as unknown as FakeNode

    details.open = true
    details.dispatchEvent({ type: 'toggle' })
    await Promise.resolve()
    await Promise.resolve()

    expect(treeText(details)).toContain('1001')
    expect(treeText(details)).toContain('No course.xml')
  })
})
