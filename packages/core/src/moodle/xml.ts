/**
 * XML parsing boundary (ADR-0006).
 *
 * Event-based (SAX-style) parsing with hard limits: no external entity
 * resolution, bounded input size. The underlying library is an
 * implementation detail behind these functions.
 */
import type { SaxesStartTag } from 'saxes'
import { MbzParseError } from '../model/backup.ts'

export interface XmlTextEvent {
  readonly type: 'text'
  readonly data: string
}

export interface XmlOpenTagEvent {
  readonly type: 'open'
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
}

export interface XmlCloseTagEvent {
  readonly type: 'close'
  readonly name: string
}

export type XmlEvent = XmlTextEvent | XmlOpenTagEvent | XmlCloseTagEvent

/** Hard ceiling on any single XML document we parse (bytes of decoded text). */
export const MAX_XML_BYTES = 512 * 1024 * 1024

/** Ceiling on total entity-expansion output to blunt XML bombs. */
const MAX_ENTITY_CHARS = 16 * 1024 * 1024

/**
 * Parse `text` and invoke `onEvent` for each element/text event.
 * Throws MbzParseError on malformed XML or limit violations.
 */
export async function parseXmlEvents(
  text: string,
  onEvent: (event: XmlEvent) => void,
): Promise<void> {
  if (text.length > MAX_XML_BYTES) {
    throw new MbzParseError(`XML document exceeds ${MAX_XML_BYTES} byte limit`)
  }
  const { SaxesParser } = await import('saxes')
  const parser = new SaxesParser({ fragment: false })
  let totalChars = 0
  const onText = (t: string): void => {
    totalChars += t.length
    if (totalChars > MAX_ENTITY_CHARS) {
      throw new MbzParseError('XML text content exceeds safety limit')
    }
    onEvent({ type: 'text', data: t })
  }
  parser.on('error', (e: Error) => {
    throw new MbzParseError(`Malformed XML: ${e.message}`, { cause: e })
  })
  parser.on('opentag', (tag: SaxesStartTag) => {
    const attributes: Record<string, string> = {}
    for (const [k, v] of Object.entries(tag.attributes)) {
      attributes[k] = typeof v === 'string' ? v : (v?.value ?? '')
    }
    onEvent({ type: 'open', name: tag.name, attributes })
  })
  parser.on('closetag', (tag: { name?: string }) => {
    if (!tag?.name) return // self-closing element: saxes emits one event with no close payload
    onEvent({ type: 'close', name: tag.name })
  })
  // Entity-decoded and CDATA text flow through these handlers; the shared
  // budget blunts internal entity expansion ("billion laughs"). saxes never
  // resolves external entities (ADR-0009).
  parser.on('text', onText)
  parser.on('cdata', onText)
  try {
    parser.write(text).close()
  } catch (e) {
    throw e instanceof MbzParseError ? e : new MbzParseError('Malformed XML', { cause: e })
  }
}
