/**
 * eXeLearning package inspection (ADR-0025).
 *
 * Classification is by ZIP entry names, never by file extension: real files
 * are routinely mislabelled — a `.elpx` may hold a legacy project, and the
 * Moodle plugins accept a `.elpx` that is really a plain `.zip`.
 *
 * Format facts were established from the vendor's own format documentation
 * and from inspecting real archives. They are facts about a file layout, not
 * code: eXeLearning and the Moodle plugins are GPL/AGPL and MBZoo is MIT, so
 * nothing is ported from them (REPO-005).
 */
import { type EpubBook, type EpubChapter, type EpubEntries, xmlText } from './epub-reader.ts'

export type ExeKind =
  /** eXeLearning 3.x/4.x package: `content.xml`, usually with a rendered site. */
  | 'elpx-source'
  /** eXeLearning 2.x project whose XML mirror is present and parseable. */
  | 'elp-legacy-xml'
  /** eXeLearning 2.x project with only the binary jelly stream. */
  | 'elp-legacy-opaque'
  /** A published site, modern layout. */
  | 'exe-site-modern'
  /** A published site, legacy layout. */
  | 'exe-site-legacy'
  | 'unknown'

export interface ExePackage {
  readonly kind: ExeKind
  readonly title: string
  /** Entry path of the site's landing page, '' when there is no site. */
  readonly entry: string
  readonly entries: EpubEntries
}

function has(entries: EpubEntries, path: string): boolean {
  const wanted = path.toLowerCase()
  for (const key of entries.keys()) {
    if (key.toLowerCase() === wanted) return true
  }
  return false
}

function find(entries: EpubEntries, path: string): string | undefined {
  const wanted = path.toLowerCase()
  for (const key of entries.keys()) {
    if (key.toLowerCase() === wanted) return key
  }
  return undefined
}

/** True for the extensions eXeLearning uses, whatever is actually inside. */
export function isExeFileName(name: string): boolean {
  return /\.elpx?$/i.test(name)
}

export function classifyExe(entries: EpubEntries): ExeKind {
  // A published site is recognised by its own marker files. Checked first
  // because a .elpx carries BOTH the re-importable source and the site, and
  // the site is what a reader wants to see.
  if (
    has(entries, 'index.html') &&
    has(entries, 'content/css/base.css') &&
    has(entries, 'libs/exe_export.js')
  ) {
    return 'exe-site-modern'
  }
  if (
    has(entries, 'index.html') &&
    has(entries, 'base.css') &&
    has(entries, 'nav.css') &&
    has(entries, 'exe_jquery.js')
  ) {
    return 'exe-site-legacy'
  }
  if (has(entries, 'content.xml')) return 'elpx-source'
  if (has(entries, 'contentv3.xml') || has(entries, 'contentv2.xml')) return 'elp-legacy-xml'
  if (has(entries, 'content.data')) return 'elp-legacy-opaque'
  return 'unknown'
}

/** Project title, read from whichever project XML the package carries. */
function readTitle(entries: EpubEntries): string {
  for (const candidate of ['content.xml', 'contentv3.xml', 'contentv2.xml']) {
    const key = find(entries, candidate)
    const bytes = key === undefined ? undefined : entries.get(key)
    if (!bytes) continue
    const xml = new TextDecoder().decode(bytes.slice(0, 65536))
    const title =
      /<title>([\s\S]*?)<\/title>/i.exec(xml)?.[1] ?? /\bname\s*=\s*"([^"]+)"/i.exec(xml)?.[1] ?? ''
    // Decoded, never tag-stripped: the value is only ever rendered through
    // textContent, and a regex cannot strip tags safely.
    const clean = xmlText(title)
    if (clean !== '') return clean
  }
  return ''
}

export function readExePackage(entries: EpubEntries): ExePackage {
  const kind = classifyExe(entries)
  const entry = find(entries, 'index.html') ?? ''
  return { kind, title: readTitle(entries), entry, entries }
}

/**
 * Presents a package's rendered site as a page list the ZIP-page renderer can
 * show: entry page first, then every other HTML file, so pages the landing
 * page never links to are reachable too.
 */
export function exeSiteBook(pkg: ExePackage): EpubBook {
  const pages: EpubChapter[] = []
  for (const path of pkg.entries.keys()) {
    if (!/\.x?html?$/i.test(path)) continue
    const bytes = pkg.entries.get(path)
    if (!bytes || bytes.byteLength === 0) continue
    const head = new TextDecoder().decode(bytes.slice(0, 4096))
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim() ?? ''
    pages.push({ path, title: title !== '' ? title : (path.split('/').pop() ?? path) })
  }
  pages.sort((a, b) => {
    if (a.path === pkg.entry) return -1
    if (b.path === pkg.entry) return 1
    return a.path.localeCompare(b.path)
  })
  return { title: pkg.title, chapters: pages, entries: pkg.entries }
}
