/**
 * Pure helpers for content previews. Kept DOM-free so bun:test can cover
 * them (coverage gate, ADR-0008).
 */

/** Max PDF pages rendered inline; the rest are available via download. */
export const MAX_PDF_PAGES = 8

/**
 * CSP injected into sandboxed HTML previews (ADR-0014): opaque-origin iframe
 * plus no network access; sub-resources must come from rewritten references.
 *
 * data: sits alongside blob: because the frame runs on an opaque origin,
 * where a blob: URL minted by the app origin is not loadable — the browser
 * rejects it as a cross-origin local resource. Archive assets therefore
 * travel inline (ADR-0017). This widens what the frame may *inline*, never
 * what it may fetch: connect-src stays 'none'.
 */
export const SANDBOX_CSP =
  "default-src 'none'; img-src blob: data:; style-src blob: data: 'unsafe-inline'; " +
  "script-src blob: data: 'unsafe-inline'; media-src blob: data:; font-src blob: data:; " +
  "connect-src 'none'; frame-src 'none'; form-action 'none'"

/**
 * CSP injected into the experimental H5P player page (ADR-0018). Same
 * default-deny model as SANDBOX_CSP but deliberately narrower: the player's
 * own shim mints every package asset as a blob inside the frame, so data: is
 * only needed for CSS-embedded images and fonts. Kept as a separate constant
 * on purpose — SANDBOX_CSP widening for archive HTML must not silently widen
 * what backup-provided H5P code may load. `preview-utils.test.ts` locks the
 * invariants both must keep.
 */
export const H5P_CSP =
  "default-src 'none'; img-src blob: data:; style-src blob: 'unsafe-inline'; " +
  "script-src blob: 'unsafe-inline'; media-src blob:; font-src blob: data:; " +
  "connect-src 'none'; frame-src 'none'; form-action 'none'"

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/plain',
    html: 'text/html',
    json: 'application/json',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
  }
  return map[ext] ?? 'application/octet-stream'
}

/** Injects a CSP <meta> as the first head child (or wraps fragment HTML). */
export function injectCsp(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}">`
  return injectHead(html, meta)
}

/** Injects markup we author as the first head child (or wraps fragment HTML). */
export function injectHead(html: string, markup: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${markup}`)
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${markup}</head>`)
  }
  return `${markup}${html}`
}

/** Longest page reference a navigation message may carry. */
const MAX_NAV_REF_LENGTH = 512

/** Splits a reference into the part that addresses a file and its fragment. */
export function splitRef(ref: string): { path: string; hash: string } {
  const hashAt = ref.indexOf('#')
  const hash = hashAt < 0 ? '' : ref.slice(hashAt)
  const head = hashAt < 0 ? ref : ref.slice(0, hashAt)
  const queryAt = head.indexOf('?')
  return { path: queryAt < 0 ? head : head.slice(0, queryAt), hash }
}

/**
 * Validates a navigation message posted by a sandboxed preview (ADR-0021).
 * The frame is hostile input: nothing here trusts the message beyond its
 * shape, and the reference it returns is only ever used as a lookup key
 * against records the backup cannot extend.
 */
export function parseNavigationRequest(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const message = data as Record<string, unknown>
  // Own properties only: a payload can reach us with a polluted prototype.
  if (!Object.hasOwn(message, 'page')) return undefined
  if (message.source !== 'mbzoo' || message.type !== 'navigate') return undefined
  const page = message.page
  if (typeof page !== 'string') return undefined
  if (page === '' || page.length > MAX_NAV_REF_LENGTH) return undefined
  return page
}

/**
 * Injected into a sandboxed page that belongs to a multi-page site
 * (ADR-0021). It turns a click on a defused page link into a request the
 * parent may refuse. It carries no authority: any script already in the
 * frame can post the same message, so the security of the feature lives
 * entirely in the parent's validation, never here.
 */
export const PAGE_NAV_SCRIPT =
  '<script>(function(){document.addEventListener("click",function(e){' +
  'var t=e.target;if(!t||!t.closest)return;' +
  'var a=t.closest("[data-mbz-page]");if(!a)return;' +
  'e.preventDefault();e.stopPropagation();' +
  'try{parent.postMessage({source:"mbzoo",type:"navigate",' +
  'page:String(a.getAttribute("data-mbz-page")||"")},"*")}catch(err){}' +
  '},true)})()</script>'

/** Joins an archive directory with a possibly-relative reference. */
export function resolveRelative(dir: string, ref: string): string {
  const base = dir.replace(/^\//, '').replace(/\/$/, '')
  const { path } = splitRef(ref)
  const parts: string[] = []
  if (path.startsWith('/')) {
    parts.push(...path.split('/'))
  } else {
    parts.push(...base.split('/').filter(Boolean), ...path.split('/'))
  }
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** Human label for a stored file: what kind of content is it? */
export function contentKind(mime: string, fileName: string): string {
  const m = mime.toLowerCase()
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (m === 'text/html' || ext === 'html' || ext === 'htm') return 'Website'
  if (m === 'application/pdf' || ext === 'pdf') return 'PDF'
  if (m.startsWith('image/')) return 'Image'
  if (m.startsWith('video/')) return 'Video'
  if (m.startsWith('audio/')) return 'Audio'
  if (ext === 'h5p') return 'H5P package'
  if (ext === 'elpx') return 'eXeLearning 4.x'
  if (ext === 'elp') return 'eXeLearning 2.x'
  if (m === 'application/zip' || ext === 'zip' || ext === 'scorm') return 'Archive'
  if (/\bword|document\b/.test(m) || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'Document'
  if (/\bpowerpoint|presentation\b/.test(m) || ['ppt', 'pptx', 'odp'].includes(ext)) return 'Slides'
  if (/\bexcel|sheet\b/.test(m) || ['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'Spreadsheet'
  if (m.startsWith('text/') || ext === 'json' || ext === 'xml' || ext === 'md') return 'Text'
  return 'File'
}

/** Formats a Moodle unix timestamp for the UI language. */
export function formatDate(ts: number, lang: string): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  return new Date(ts * 1000).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
