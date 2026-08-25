/**
 * Reader for PHP's `serialize()` format, which Moodle uses for a handful of
 * backup fields that hold structured data inside a single XML leaf:
 * `imscp.structure` (the package table of contents), `resource.displayoptions`,
 * and assign's `plugin_config` values.
 *
 * This never reconstructs objects. `O:` (object), `C:` (custom-serialized)
 * and `R:`/`r:` (back-references) are refused outright: the first two exist
 * to instantiate classes, which has no meaning here and is the root of PHP's
 * deserialization vulnerabilities, and references can describe cycles that a
 * consumer walking the result would not survive.
 *
 * Every `.mbz` is hostile input (AGENTS.md §1), so this is a strict reader:
 * anything malformed throws instead of guessing.
 */

/** A value read from a serialized payload. Arrays keep PHP's key order. */
export type PhpValue = null | boolean | number | string | PhpArray

/** PHP arrays are ordered maps whose keys are ints or strings. */
export type PhpArray = Map<string | number, PhpValue>

/** Refuses a payload larger than this before parsing anything. */
export const MAX_PHP_BYTES = 4 * 1024 * 1024
const MAX_DEPTH = 32
const MAX_NODES = 20_000

class PhpParseError extends Error {}

/**
 * Parses one serialized value, or returns undefined when the payload is not
 * PHP-serialized at all — Moodle leaves these fields empty, `$@NULL@$` or
 * plain text often enough that a caller should not have to guard first.
 */
export function parsePhpSerialized(raw: string): PhpValue | undefined {
  const text = raw.trim()
  if (text === '' || !/^[NbidsaOCRr]:|^N;$/.test(text)) return undefined
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength > MAX_PHP_BYTES) return undefined
  try {
    const reader = new Reader(bytes)
    const value = reader.value(0)
    return value
  } catch {
    return undefined
  }
}

/** Reads `imscp.structure`: a tree of {title, href, subitems} entries. */
export interface ImscpItem {
  readonly title: string
  /** Package-relative file the entry opens, '' for a heading-only node. */
  readonly href: string
  readonly children: ImscpItem[]
}

export function parseImscpStructure(raw: string): ImscpItem[] {
  const value = parsePhpSerialized(raw)
  return value instanceof Map ? itemsOf(value) : []
}

function itemsOf(array: PhpArray): ImscpItem[] {
  const out: ImscpItem[] = []
  for (const entry of array.values()) {
    if (!(entry instanceof Map)) continue
    const title = entry.get('title')
    const href = entry.get('href')
    const subitems = entry.get('subitems')
    out.push({
      title: typeof title === 'string' ? title : '',
      href: typeof href === 'string' ? href : '',
      children: subitems instanceof Map ? itemsOf(subitems) : [],
    })
  }
  return out
}

/**
 * Byte-oriented cursor: PHP counts string lengths in bytes, so a payload
 * holding any non-ASCII character cannot be scanned by JS string index.
 */
class Reader {
  private pos = 0
  private nodes = 0
  private readonly decoder = new TextDecoder('utf-8', { fatal: false })

  constructor(private readonly bytes: Uint8Array) {}

  value(depth: number): PhpValue {
    if (depth > MAX_DEPTH) throw new PhpParseError('nesting too deep')
    if (++this.nodes > MAX_NODES) throw new PhpParseError('too many nodes')
    const type = String.fromCharCode(this.byte())
    switch (type) {
      case 'N':
        this.expect(';')
        return null
      case 'b': {
        this.expect(':')
        const digit = String.fromCharCode(this.byte())
        this.expect(';')
        if (digit !== '0' && digit !== '1') throw new PhpParseError('bad bool')
        return digit === '1'
      }
      case 'i': {
        this.expect(':')
        const n = Number(this.until(';'))
        if (!Number.isSafeInteger(n)) throw new PhpParseError('bad int')
        return n
      }
      case 'd': {
        this.expect(':')
        const text = this.until(';')
        if (text === 'NAN' || text === 'INF' || text === '-INF') return Number.NaN
        const n = Number(text)
        if (!Number.isFinite(n)) throw new PhpParseError('bad float')
        return n
      }
      case 's':
        return this.string()
      case 'a':
        return this.array(depth)
      default:
        // O:/C: instantiate classes, R:/r: are back-references. None of them
        // can appear in data MBZoo reads, and all four are how this format
        // gets weaponized. Refuse rather than skip.
        throw new PhpParseError(`unsupported type "${type}"`)
    }
  }

  private string(): string {
    this.expect(':')
    const length = Number(this.until(':'))
    if (!Number.isSafeInteger(length) || length < 0) throw new PhpParseError('bad length')
    this.expect('"')
    const end = this.pos + length
    if (end > this.bytes.byteLength) throw new PhpParseError('string runs past end')
    const text = this.decoder.decode(this.bytes.subarray(this.pos, end))
    this.pos = end
    this.expect('"')
    this.expect(';')
    return text
  }

  private array(depth: number): PhpArray {
    this.expect(':')
    const count = Number(this.until(':'))
    if (!Number.isSafeInteger(count) || count < 0) throw new PhpParseError('bad count')
    // One entry costs at least 8 bytes ("i:0;N;"), so a count far beyond what
    // the payload can hold is a malformed header, not a big array.
    if (count > this.bytes.byteLength) throw new PhpParseError('count exceeds payload')
    this.expect('{')
    const out: PhpArray = new Map()
    for (let i = 0; i < count; i++) {
      const key = this.value(depth + 1)
      if (typeof key !== 'string' && typeof key !== 'number') {
        throw new PhpParseError('array key must be int or string')
      }
      out.set(key, this.value(depth + 1))
    }
    this.expect('}')
    return out
  }

  private byte(): number {
    const b = this.bytes[this.pos]
    if (b === undefined) throw new PhpParseError('unexpected end')
    this.pos++
    return b
  }

  private expect(char: string): void {
    if (String.fromCharCode(this.byte()) !== char) {
      throw new PhpParseError(`expected "${char}"`)
    }
  }

  /** Reads ASCII up to `stop`, which is consumed. */
  private until(stop: string): string {
    let out = ''
    for (;;) {
      const char = String.fromCharCode(this.byte())
      if (char === stop) return out
      if (out.length > 32) throw new PhpParseError('scalar too long')
      out += char
    }
  }
}
