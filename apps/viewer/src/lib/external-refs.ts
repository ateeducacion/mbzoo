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
