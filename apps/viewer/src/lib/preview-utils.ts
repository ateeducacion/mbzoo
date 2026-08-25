/**
 * Pure helpers for content previews. Kept DOM-free so bun:test can cover
 * them (coverage gate, ADR-0008).
 */

/** Max PDF pages rendered inline; the rest are available via download. */
export const MAX_PDF_PAGES = 8

/**
 * CSP injected into sandboxed HTML previews (ADR-0014): opaque-origin iframe
 * plus no network access; sub-resources must come from rewritten blob URLs.
 */
export const SANDBOX_CSP =
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
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${meta}`)
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${meta}</head>`)
  }
  return `${meta}${html}`
}

/** Joins an archive directory with a possibly-relative reference. */
export function resolveRelative(dir: string, ref: string): string {
  const base = dir.replace(/^\//, '').replace(/\/$/, '')
  const parts: string[] = []
  if (ref.startsWith('/')) {
    parts.push(...ref.split('/'))
  } else {
    parts.push(...base.split('/').filter(Boolean), ...ref.split('/'))
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
