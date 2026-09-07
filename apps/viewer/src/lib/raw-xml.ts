/**
 * Shared Raw XML view (activity tab and course summary).
 *
 * Security: tokenizeXml classifies text runs; this paints them with
 * createElement + textContent, so backup XML never reaches innerHTML
 * (ADR-0012).
 */

import { t } from './i18n.ts'
import { formatBytes } from './preview-utils.ts'
import { tokenizeXml } from './xml-highlight.ts'

/** Beyond this the view shows a head rather than the whole document. */
export const MAX_RAW_CHARS = 200_000

export interface RawXmlView {
  readonly empty: boolean
  readonly truncated: boolean
  readonly source: string
  readonly size: number
}

/** Slice and flag the XML that the Raw view will paint. */
export function rawXmlView(xmlText: string): RawXmlView {
  if (xmlText === '') return { empty: true, truncated: false, source: '', size: 0 }
  const truncated = xmlText.length > MAX_RAW_CHARS
  return {
    empty: false,
    truncated,
    source: truncated ? xmlText.slice(0, MAX_RAW_CHARS) : xmlText,
    size: xmlText.length,
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Appends the path bar + coloured XML, or a missing note. */
export function appendRawXml(
  panel: HTMLElement,
  xmlText: string,
  xmlPath: string,
  missing = t('raw.missing'),
): void {
  const view = rawXmlView(xmlText)
  if (view.empty) {
    panel.appendChild(el('p', 'fallback-note', missing))
    return
  }

  const bar = el('div', 'raw-bar')
  bar.appendChild(el('code', 'raw-path', xmlPath))
  bar.appendChild(el('span', 'raw-size', formatBytes(view.size)))
  panel.appendChild(bar)

  const pre = el('pre', 'raw-xml')
  for (const token of tokenizeXml(view.source)) {
    if (token.kind === 'text') {
      pre.appendChild(document.createTextNode(token.text))
      continue
    }
    pre.appendChild(el('span', `x-${token.kind}`, token.text))
  }
  if (view.truncated) pre.appendChild(document.createTextNode('\n…'))
  panel.appendChild(pre)

  if (view.truncated) {
    panel.appendChild(
      el('p', 'fallback-note', t('raw.truncated', { n: MAX_RAW_CHARS, total: view.size })),
    )
  }
}
