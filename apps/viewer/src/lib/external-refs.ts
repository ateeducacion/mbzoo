/**
 * External reference scanner (REPO-006 inspiration): detect and classify
 * outbound URLs in backup HTML — never fetch them (ADR-0009/PRIVACY).
 */
export interface ExternalRef {
  readonly provider: string
  readonly url: string
}

/** Attributes and elements that can carry remote URLs. */
const URL_ATTRS = '(?:href|src|data|poster)'
const PROVIDERS: Array<[RegExp, string]> = [
  [/youtu\.?be/i, 'YouTube'],
  [/vimeo/i, 'Vimeo'],
  [/dailymotion|dai\.ly/i, 'Dailymotion'],
  [/panopto/i, 'Panopto'],
  [/(\.|\/\/)(microsoftstream|stream\.microsoft)\b/i, 'Microsoft Stream'],
  [/sharepoint|onedrive|1drv\.ms/i, 'SharePoint/OneDrive'],
  [/kaltura/i, 'Kaltura'],
  [/zoom\.us/i, 'Zoom'],
  [/teams\.microsoft|teams\.com/i, 'Teams'],
  [/drive\.google|docs\.google/i, 'Google Drive'],
]

export function classifyProvider(url: string): string {
  for (const [re, name] of PROVIDERS) {
    if (re.test(url)) return name
  }
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] ?? ''
  return host || 'other external'
}

/** Collects absolute http(s) URLs from URL-bearing attributes. */
export function scanExternalRefs(html: string): ExternalRef[] {
  const out: ExternalRef[] = []
  const seen = new Set<string>()
  const re = new RegExp(`${URL_ATTRS}\\s*=\\s*["'](https?://[^"']+)["']`, 'gi')
  for (const m of html.matchAll(re)) {
    const url = m[1] ?? ''
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ provider: classifyProvider(url), url })
  }
  return out
}

/** Escapes a string for safe use inside an HTML attribute or text node. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Replaces an embedded element that points at a remote host with an inert
 * card naming where it lives (ADR-0009: nothing is fetched). A sandboxed
 * document's CSP blocks such a frame outright, so it would otherwise render
 * blank; the card is honest about why. Local and inlined references
 * (`blob:`, `data:`, relative) are left untouched.
 *
 * `labels` supplies the localized "external content" / "open" copy so this
 * stays free of the i18n module (the core-facing lib rule).
 */
export function nameRemoteEmbeds(
  html: string,
  labels: { readonly external: string; readonly open: string },
): string {
  return html.replace(
    /<(iframe|embed|video|audio|object)\b([^>]*)>(?:[\s\S]*?<\/\1\s*>)?/gi,
    (whole, _tag: string, attrs: string) => {
      const attr = /\bdata\s*=/.test(attrs) && !/\bsrc\s*=/.test(attrs) ? 'data' : 'src'
      const m = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs)
      const url = (m?.[2] ?? m?.[3] ?? '').trim()
      if (!/^https?:\/\//i.test(url)) return whole
      const title = /\btitle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)
      const label = (title?.[2] ?? title?.[3] ?? '').trim() || classifyProvider(url)
      return (
        `<div class="mbz-remote-embed" role="group" ` +
        `style="border:1px solid #d9d4cc;border-radius:8px;padding:12px 14px;margin:8px 0;` +
        `background:#faf8f4;font-family:system-ui,sans-serif">` +
        `<div style="font:600 12px system-ui;color:#8a3600">${escapeHtml(labels.external)} · ${escapeHtml(classifyProvider(url))}</div>` +
        `<div style="margin:4px 0 8px">${escapeHtml(label)}</div>` +
        `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener nofollow" ` +
        `style="color:#b34700">${escapeHtml(labels.open)}</a></div>`
      )
    },
  )
}
