/**
 * Locate XML elements without reserialising the document.
 * Bytes outside a replaced span stay as they were (ADR-0037).
 */

export interface XmlEl {
  readonly name: string
  readonly attrs: Readonly<Record<string, string>>
  readonly start: number
  readonly end: number
  readonly innerStart: number
  readonly innerEnd: number
  readonly parent: number
  readonly selfClosing: boolean
}

export function scanElements(xml: string): XmlEl[] {
  const out: XmlEl[] = []
  const stack: number[] = []
  let i = 0
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) break
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4)
      i = end < 0 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9)
      i = end < 0 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt + 2)
      i = end < 0 ? xml.length : end + 1
      continue
    }
    if (xml.startsWith('</', lt)) {
      const gt = xml.indexOf('>', lt + 2)
      if (gt < 0) break
      const name =
        xml
          .slice(lt + 2, gt)
          .trim()
          .split(/\s/)[0] ?? ''
      while (stack.length > 0) {
        const idx = stack.pop()
        if (idx === undefined) break
        const current = out[idx]
        if (!current || current.end !== -1) break
        const closed: XmlEl = {
          ...current,
          end: gt + 1,
          innerEnd: lt,
        }
        out[idx] = closed
        if (current.name === name) break
      }
      i = gt + 1
      continue
    }
    const gt = findTagEnd(xml, lt + 1)
    if (gt < 0) break
    const raw = xml.slice(lt + 1, gt)
    const selfClosing = /\/\s*$/.test(raw)
    const body = selfClosing ? raw.replace(/\/\s*$/, '') : raw
    const name = /^([^\s/>]+)/.exec(body)?.[1] ?? ''
    const el: XmlEl = {
      name,
      attrs: parseAttrs(body),
      start: lt,
      end: selfClosing ? gt + 1 : -1,
      innerStart: gt + 1,
      innerEnd: selfClosing ? gt + 1 : -1,
      parent: stack[stack.length - 1] ?? -1,
      selfClosing,
    }
    const idx = out.length
    out.push(el)
    if (!selfClosing) stack.push(idx)
    i = gt + 1
  }
  return out
}

export function childrenOf(elements: readonly XmlEl[], parent: number): XmlEl[] {
  const found: XmlEl[] = []
  for (const el of elements) {
    if (el.parent === parent) found.push(el)
  }
  return found
}

export function childNamed(
  elements: readonly XmlEl[],
  parent: XmlEl,
  name: string,
): XmlEl | undefined {
  const parentIndex = elements.indexOf(parent)
  if (parentIndex < 0) return undefined
  return childrenOf(elements, parentIndex).find((el) => el.name === name)
}

export function leafOf(
  xml: string,
  elements: readonly XmlEl[],
  parent: XmlEl,
  name: string,
): string {
  const child = childNamed(elements, parent, name)
  if (!child || child.innerEnd < child.innerStart) return ''
  const nested = childNamed(elements, child, 'text')
  const source = nested ?? child
  if (!nested && childrenOf(elements, elements.indexOf(child)).length > 0) return ''
  return decodeEntities(xml.slice(source.innerStart, source.innerEnd)).trim()
}

export function ancestorNamed(
  elements: readonly XmlEl[],
  start: XmlEl,
  name: string,
): XmlEl | undefined {
  let parent = start.parent
  while (parent >= 0) {
    const el = elements[parent]
    if (!el) return undefined
    if (el.name === name) return el
    parent = el.parent
  }
  return undefined
}

export function spliceRanges(
  xml: string,
  ranges: readonly { readonly start: number; readonly end: number; readonly replacement: string }[],
): string {
  const ordered = [...ranges].sort((a, b) => b.start - a.start)
  let out = xml
  let cursor = xml.length
  for (const range of ordered) {
    if (range.end > cursor || range.start < 0 || range.end < range.start) {
      throw new Error('Overlapping or inverted XML edit')
    }
    out = out.slice(0, range.start) + range.replacement + out.slice(range.end)
    cursor = range.start
  }
  return out
}

export function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;')
}

/** Short before/after window around the first differing character. */
export function previewEdit(
  entry: string,
  before: string,
  after: string,
): {
  entry: string
  before: string
  after: string
} {
  let i = 0
  const limit = Math.min(before.length, after.length)
  while (i < limit && before.charCodeAt(i) === after.charCodeAt(i)) i++
  const start = Math.max(0, i - 60)
  return {
    entry,
    before: snippet(before, start, Math.min(before.length, start + 420)),
    after: snippet(after, start, Math.min(after.length, start + 420)),
  }
}

export function snippet(xml: string, start: number, end: number, limit = 700): string {
  const text = xml.slice(start, end).replaceAll(/\s+/g, ' ').trim()
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

function findTagEnd(xml: string, from: number): number {
  let quote = ''
  for (let i = from; i < xml.length; i++) {
    const ch = xml[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i
  }
  return -1
}

function parseAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match = re.exec(body)
  let first = true
  while (match) {
    if (!first && match[1]) {
      const raw = match[2] ?? match[3] ?? match[4] ?? ''
      attrs[match[1]] = decodeEntities(raw)
    }
    first = false
    match = re.exec(body)
  }
  return attrs
}

export function decodeEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#(\d+);/g, (_all, digits: string) => fromCode(Number(digits)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex: string) => fromCode(Number.parseInt(hex, 16)))
    .replaceAll('&amp;', '&')
}

function fromCode(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return ''
  return String.fromCodePoint(code)
}
