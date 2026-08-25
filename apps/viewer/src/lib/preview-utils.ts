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

/**
 * URI schemes backup HTML may keep after sanitization. This is DOMPurify's
 * own default list plus `blob:`.
 *
 * `blob:` is not a concession to the backup — it is how MBZoo's own content
 * reaches the reader. resolveHtml replaces every `@@PLUGINFILE@@` token with
 * a managed blob URL *before* sanitizing (the refs are URL-encoded in backup
 * HTML, so they must be matched on the raw text), and DOMPurify's default
 * policy rejects `blob:` on every attribute. Without this, every image a
 * teacher embedded in a Page arrived with no `src` at all.
 *
 * It grants a hostile backup nothing: a `blob:` URL only resolves if this
 * origin minted it, and the ones we mint hold that backup's own files.
 */
export const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|ftp|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

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
 * Validates a navigation message posted by a sandboxed preview (ADR-0022).
 * The frame is hostile input: nothing here trusts the message beyond its
 * shape, and the reference it returns is only ever used as a lookup key
 * against records the backup cannot extend.
 *
 * The token is what makes this authenticate a *document* rather than a
 * browsing context. `event.source` identifies a WindowProxy, and that
 * identity survives the frame navigating itself elsewhere — a sandboxed
 * frame may replace its own document, and the replacement does not carry
 * the CSP we injected. Only the document MBZoo composed saw this token.
 */
export function parseNavigationRequest(data: unknown, expectedToken: string): string | undefined {
  if (expectedToken === '') return undefined
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const message = data as Record<string, unknown>
  // Own properties only: a payload can reach us with a polluted prototype.
  if (!Object.hasOwn(message, 'page') || !Object.hasOwn(message, 'token')) return undefined
  if (message.source !== 'mbzoo' || message.type !== 'navigate') return undefined
  if (message.token !== expectedToken) return undefined
  const page = message.page
  if (typeof page !== 'string') return undefined
  if (page === '' || page.length > MAX_NAV_REF_LENGTH) return undefined
  return page
}

/**
 * Percent-decodes a reference for comparison against archive record paths,
 * which are stored decoded. A lone '%' makes decodeURIComponent throw, and
 * that must not escape into the message handler.
 */
export function decodeRefPath(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/**
 * Builds the script injected into a sandboxed page of a multi-page site
 * (ADR-0022). It turns a click on a defused page link into a request the
 * parent may refuse. It carries no authority of its own: any script already
 * in the frame can post the same message, so the security of the feature
 * lives in the parent's validation. The token it echoes proves only that
 * the message came from the document MBZoo composed.
 */
export function pageNavScript(token: string): string {
  // JSON.stringify keeps the token a well-formed JS string literal, but it
  // does not escape '<', so a literal </script> would still close the element
  // early. Escaping '<' as \u003c leaves the value identical at runtime.
  const literal = JSON.stringify(token).replace(/</g, '\\u003c')
  return (
    `<script>(function(){var T=${literal};` +
    'document.addEventListener("click",function(e){' +
    'var t=e.target;if(!t||!t.closest)return;' +
    'var a=t.closest("[data-mbz-page]");if(!a)return;' +
    'e.preventDefault();e.stopPropagation();' +
    'try{parent.postMessage({source:"mbzoo",type:"navigate",token:T,' +
    'page:String(a.getAttribute("data-mbz-page")||"")},"*")}catch(err){}' +
    '},true)})()</script>'
  )
}

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
