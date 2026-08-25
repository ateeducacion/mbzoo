/**
 * XML tokenizer for the detail pane's Raw tab (mockup 2c).
 *
 * Security: this is a *classifier*, never a generator. It returns plain
 * text runs tagged with a kind; the caller paints them with createElement
 * + textContent. Backup-derived XML therefore never reaches innerHTML and
 * ADR-0012's single sanitization path stays single.
 *
 * The invariant that makes that safe is total coverage: concatenating
 * every token reproduces the source verbatim, so no character can be
 * dropped, merged or invented on the way to the DOM.
 */

export type XmlTokenKind = 'tag' | 'attr' | 'value' | 'text'

export interface XmlToken {
  readonly kind: XmlTokenKind
  readonly text: string
}

/**
 * Regions copied through verbatim: their payload is not markup, so angle
 * brackets inside them must not open a tag. Longer prefixes come first —
 * "<!--" and "<![CDATA[" would both be shadowed by "<!".
 */
const LITERAL_BLOCKS: readonly (readonly [string, string])[] = [
  ['<!--', '-->'],
  ['<![CDATA[', ']]>'],
  ['<?', '?>'],
  ['<!', '>'],
]

/** Characters that may appear in an element or attribute name. */
function isNameChar(ch: string | undefined): boolean {
  return ch !== undefined && !/[\s/>=<"']/.test(ch)
}

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch)
}

/** End offset of a literal block starting at `start`, if one starts there. */
function literalBlockEnd(source: string, start: number): number | undefined {
  for (const [open, close] of LITERAL_BLOCKS) {
    if (!source.startsWith(open, start)) continue
    const end = source.indexOf(close, start + open.length)
    // Unterminated block: the rest of the document is payload.
    return end === -1 ? source.length : end + close.length
  }
  return undefined
}

type Push = (kind: XmlTokenKind, text: string) => void

/** Consumes one tag starting at `<`; returns the offset just past it. */
function readTag(source: string, start: number, push: Push): number {
  let i = start + 1
  let opener = '<'
  if (source[i] === '/') {
    opener = '</'
    i++
  }
  push('text', opener)

  const nameStart = i
  while (isNameChar(source[i])) i++
  push('tag', source.slice(nameStart, i))

  while (i < source.length) {
    const ch = source[i]
    if (ch === '>') {
      push('text', '>')
      return i + 1
    }
    if (ch === '/' && source[i + 1] === '>') {
      push('text', '/>')
      return i + 2
    }
    if (isSpace(ch)) {
      const runStart = i
      while (isSpace(source[i])) i++
      push('text', source.slice(runStart, i))
      continue
    }
    if (ch === '=') {
      push('text', '=')
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const closing = source.indexOf(ch, i + 1)
      const stop = closing === -1 ? source.length : closing + 1
      push('value', source.slice(i, stop))
      i = stop
      continue
    }
    const nameRunStart = i
    while (isNameChar(source[i])) i++
    if (i === nameRunStart) {
      // Nothing consumed (stray punctuation): emit one char so the scan
      // always advances. A stalled loop here would hang the tab.
      push('text', ch ?? '')
      i++
      continue
    }
    push('attr', source.slice(nameRunStart, i))
  }
  return i
}

/** Splits XML into kinded runs. See the module invariant above. */
export function tokenizeXml(source: string): XmlToken[] {
  const tokens: XmlToken[] = []
  const push: Push = (kind, text) => {
    if (text !== '') tokens.push({ kind, text })
  }

  let i = 0
  while (i < source.length) {
    const next = source.indexOf('<', i)
    if (next === -1) {
      push('text', source.slice(i))
      break
    }
    push('text', source.slice(i, next))
    i = next

    const blockEnd = literalBlockEnd(source, i)
    if (blockEnd !== undefined) {
      push('text', source.slice(i, blockEnd))
      i = blockEnd
      continue
    }
    i = readTag(source, i, push)
  }
  return tokens
}
