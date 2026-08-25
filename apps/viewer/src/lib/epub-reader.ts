/**
 * EPUB reading (ADR-0024).
 *
 * An EPUB is a ZIP: `META-INF/container.xml` names an OPF package document,
 * whose `<manifest>` lists every resource and whose `<spine>` gives the
 * reading order. Chapters are XHTML, so once their relative references are
 * resolved they render through exactly the pipeline MBZoo already uses for
 * archive HTML (ADR-0014) — no new executable surface, no new permission.
 *
 * MBZoo parses the format itself rather than adopting a reader library.
 * Both candidates (foliate-js, epub.js) put chapter content in a nested
 * iframe hard-coded to `sandbox="allow-same-origin…"` and then drive their
 * layout engine through that frame's `contentDocument`; neither degrades
 * without it. Running one in the app origin is the arrangement ADR-0017
 * rejects outright, and running one inside the preview frame needs
 * `frame-src` opened up — a nested `srcdoc` does not help either, because a
 * sandboxed document's opaque origin is minted fresh for each nested
 * context, so the child is cross-origin with its own parent.
 */
import { unzipSync } from 'fflate'
import { guessMime } from './preview-utils.ts'

export type EpubEntries = Map<string, Uint8Array>

export interface EpubChapter {
  /** Path inside the package, normalized without a leading slash. */
  readonly path: string
  readonly title: string
}

export interface EpubBook {
  readonly title: string
  readonly chapters: EpubChapter[]
  readonly entries: EpubEntries
}

const CONTAINER_PATH = 'META-INF/container.xml'

/** Reads a ZIP into memory, dropping directory entries. */
export function unzipPackage(data: Uint8Array): EpubEntries {
  const entries: EpubEntries = new Map()
  for (const [path, bytes] of Object.entries(unzipSync(data))) {
    if (!path.endsWith('/')) entries.set(path, bytes)
  }
  return entries
}

export function unzipEpub(data: Uint8Array): EpubEntries {
  const entries: EpubEntries = new Map()
  for (const [path, bytes] of Object.entries(unzipSync(data))) {
    if (!path.endsWith('/')) entries.set(path, bytes)
  }
  if (!entries.has(CONTAINER_PATH)) {
    throw new Error('not an EPUB: missing META-INF/container.xml')
  }
  return entries
}

export function isEpubFileName(name: string): boolean {
  return /\.epub$/i.test(name)
}

/** Joins a package-relative reference onto the directory holding the OPF. */
export function joinEpubPath(dir: string, ref: string): string {
  const base = ref.startsWith('/') ? [] : dir.split('/').filter(Boolean)
  const out: string[] = [...base]
  for (const part of ref.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

function attr(tag: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return (m?.[2] ?? m?.[3] ?? '').trim()
}

/**
 * Reads the package document and returns the reading order.
 *
 * The XML is hostile input, so this is deliberately tolerant: a spine entry
 * whose idref does not resolve is skipped rather than failing the book, and
 * a book whose spine is empty falls back to the manifest's XHTML items in
 * document order — which is what a reader wants to see rather than an error.
 */
export function readEpub(entries: EpubEntries): EpubBook {
  const container = entries.get(CONTAINER_PATH)
  if (!container) throw new Error('not an EPUB: missing container')
  const containerXml = new TextDecoder().decode(container)
  const rootTag = /<rootfile\b[^>]*>/i.exec(containerXml)?.[0] ?? ''
  const opfPath = attr(rootTag, 'full-path')
  const opf = opfPath === '' ? undefined : entries.get(opfPath)
  if (!opf) throw new Error('not an EPUB: package document not found')

  const opfXml = new TextDecoder().decode(opf)
  const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]*$/, '') : ''

  const titleRaw = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opfXml)?.[1] ?? ''
  const title = xmlText(titleRaw)

  // id -> {path, mediaType}
  const manifest = new Map<string, { path: string; mediaType: string }>()
  for (const m of opfXml.matchAll(/<item\b[^>]*\/?>/gi)) {
    const tag = m[0]
    const id = attr(tag, 'id')
    const href = attr(tag, 'href')
    if (id === '' || href === '') continue
    manifest.set(id, {
      path: joinEpubPath(opfDir, decodeURIComponent(href)),
      mediaType: attr(tag, 'media-type'),
    })
  }

  const chapters: EpubChapter[] = []
  const spine = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opfXml)?.[1] ?? ''
  for (const m of spine.matchAll(/<itemref\b[^>]*\/?>/gi)) {
    const idref = attr(m[0], 'idref')
    const item = manifest.get(idref)
    if (!item || !entries.has(item.path)) continue
    chapters.push({ path: item.path, title: '' })
  }
  if (chapters.length === 0) {
    for (const item of manifest.values()) {
      if (/xhtml|html/i.test(item.mediaType) && entries.has(item.path)) {
        chapters.push({ path: item.path, title: '' })
      }
    }
  }

  return { title, chapters: withTitles(chapters, entries), entries }
}

/**
 * Names each chapter from its own <title>, falling back to the file name.
 * EPUB navigation documents are optional and come in two incompatible
 * flavours (NCX and nav.xhtml), so the chapter's own title is both simpler
 * and always present.
 */
function withTitles(chapters: EpubChapter[], entries: EpubEntries): EpubChapter[] {
  return chapters.map((chapter, index) => {
    const bytes = entries.get(chapter.path)
    const html = bytes ? new TextDecoder().decode(bytes.slice(0, 4096)) : ''
    const found = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
    const name = chapter.path.split('/').pop() ?? chapter.path
    return { path: chapter.path, title: found !== '' ? found : `${index + 1}. ${name}` }
  })
}

/**
 * Text of an XML element, with the five predefined entities decoded.
 *
 * Deliberately does NOT strip tags: a regex cannot do that safely — one pass
 * over `<scr<script>ipt` leaves `<script` behind — and it does not need to.
 * Every value read here is rendered through `textContent`, which escapes
 * whatever it is given, so markup inside a title shows as the text it is.
 */
export function xmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

/** Cap on a single inlined asset; base64 inflates a payload by about a third. */
const MAX_ASSET_BYTES = 8 * 1024 * 1024

function dataUri(bytes: Uint8Array, mime: string): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${mime};base64,${btoa(binary)}`
}

/** Replaces the first literal occurrence, treating the replacement literally. */
function replaceOnce(haystack: string, needle: string, replacement: string): string {
  const at = haystack.indexOf(needle)
  if (at < 0) return haystack
  return haystack.slice(0, at) + replacement + haystack.slice(at + needle.length)
}

function resolveCss(css: string, dir: string, entries: EpubEntries): string {
  let out = css
  for (const m of css.matchAll(/url\((['"]?)([^)'"#]+)\1\)/g)) {
    const ref = (m[2] ?? '').trim()
    if (ref === '' || /^(data:|blob:|https?:)/i.test(ref)) continue
    const target = joinEpubPath(dir, decodeURIComponent(ref))
    const bytes = entries.get(target)
    if (!bytes || bytes.byteLength > MAX_ASSET_BYTES) continue
    out = out.split(m[0]).join(`url('${dataUri(bytes, guessMime(target))}')`)
  }
  return out
}

/**
 * Builds one chapter's document: relative references become inline data
 * URIs, and a link to another chapter is defused the way archive HTML is
 * (ADR-0020) so it cannot strand the reader on an unprocessed document.
 *
 * The result still goes through `retargetExternalLinks` and `injectCsp` in
 * the renderer — this only resolves what the package carries.
 */
export function composeChapter(book: EpubBook, path: string): string {
  const bytes = book.entries.get(path)
  if (!bytes) throw new Error(`chapter not in package: ${path}`)
  let html = new TextDecoder().decode(bytes)
  const dir = path.includes('/') ? path.replace(/\/[^/]*$/, '') : ''
  const spine = new Set(book.chapters.map((c) => c.path))

  const refs: Array<{ raw: string; ref: string }> = []
  for (const m of html.matchAll(/\s(src|href)=("([^"]*)"|'([^']*)')/gi)) {
    const ref = (m[3] ?? m[4] ?? '').trim()
    if (ref === '' || ref.startsWith('#')) continue
    if (/^(https?:|data:|blob:|mailto:|javascript:)/i.test(ref)) continue
    refs.push({ raw: m[0], ref })
  }

  for (const { raw, ref } of refs) {
    const quote = raw.includes('"') ? '"' : "'"
    const target = joinEpubPath(dir, decodeURIComponent(ref.split('#')[0] ?? ''))
    if (spine.has(target)) {
      // Another chapter: MBZoo moves between them through its own chrome.
      html = replaceOnce(html, raw, ` data-mbz-page-inert=${quote}${ref}${quote}`)
      continue
    }
    const asset = book.entries.get(target)
    if (!asset || asset.byteLength > MAX_ASSET_BYTES) continue
    const mime = guessMime(target)
    const payload =
      mime === 'text/css'
        ? new TextEncoder().encode(
            resolveCss(
              new TextDecoder().decode(asset),
              target.replace(/\/[^/]*$/, ''),
              book.entries,
            ),
          )
        : asset
    const attribute = /src=/i.test(raw) ? 'src' : 'href'
    html = replaceOnce(html, raw, ` ${attribute}=${quote}${dataUri(payload, mime)}${quote}`)
  }
  return html
}
