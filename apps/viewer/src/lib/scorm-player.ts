/**
 * Experimental SCORM playback (ADR-0023) built on scorm-again (TECH-015).
 *
 * A SCO looks for its LMS with the ADL `findAPI(window)` walk, which checks
 * `window.API` (SCORM 1.2) or `window.API_1484_11` (2004) on the current
 * window first. MBZoo therefore composes the SCO and the runtime into ONE
 * document rather than putting the SCO in a nested frame: a blob URL minted
 * inside an opaque origin is cross-origin to its own parent, so a nested SCO
 * could not reach `window.parent.API`, and `SANDBOX_CSP` sets
 * `frame-src 'none'` anyway.
 *
 * Nothing about the sandbox changes: same opaque-origin iframe, same
 * injected CSP, no new iframe permission (ADR-0014, ADR-0022).
 */
import type { ScormSco } from '@mbzoo/core'

/**
 * Runtime settings that keep the API offline.
 *
 * `lmsCommitUrl` defaults to `false` and every commit path is gated on
 * `typeof settings.lmsCommitUrl === "string"` upstream of the only HTTP call
 * site, so the default already makes the network unreachable; it is set
 * explicitly here so the intent survives a dependency upgrade.
 * `enableOfflineSupport` is the other gate — it is what would construct the
 * component that touches `localStorage` and holds the second `fetch`.
 * `connect-src 'none'` in the injected CSP is the backstop for both.
 */
const RUNTIME_SETTINGS = {
  lmsCommitUrl: false,
  autocommit: false,
  throttleCommits: false,
  useAsynchronousCommits: false,
  enableOfflineSupport: false,
  logLevel: 4,
}

/**
 * Boot script for the composed SCO document. It must run before any script
 * the package ships, which is why it is injected into the head as a classic
 * script: classic scripts execute during parsing, a module would be deferred
 * until after the SCO had already looked for the API and failed.
 */
export function scormBootScript(is2004: boolean): string {
  const ctor = is2004 ? 'Scorm2004API' : 'Scorm12API'
  const global = is2004 ? 'API_1484_11' : 'API'
  const settings = JSON.stringify(RUNTIME_SETTINGS)
  return (
    '<script>(function(){try{' +
    `if(typeof ${ctor}==="function"){window.${global}=new ${ctor}(${settings});}` +
    '}catch(err){}})()</script>'
  )
}

/** Strips the sourceMappingURL comment: it resolves against a blob: document. */
export function stripSourceMap(source: string): string {
  return source.replace(/\/\/#\s*sourceMappingURL=.*$/gm, '')
}

/** Wraps a runtime bundle for injection as a classic, parser-blocking script. */
export function runtimeScript(source: string): string {
  // The bundle is an IIFE that self-assigns this.Scorm12API / this.Scorm2004API.
  return `<script>${stripSourceMap(source)}</script>`
}

export interface ScormTocNode {
  readonly sco: ScormSco
  readonly depth: number
}

/**
 * Flattens Moodle's parent-identifier chain into a depth-annotated list.
 *
 * Moodle stores the organization as a row whose parent is '/', its items
 * with parent = the organization identifier, and nested items with parent =
 * the enclosing item's identifier. A cycle in that chain is backup-controlled
 * input, so traversal is bounded by the number of rows.
 */
export function scormToc(scoes: readonly ScormSco[]): ScormTocNode[] {
  const byParent = new Map<string, ScormSco[]>()
  for (const sco of scoes) {
    const siblings = byParent.get(sco.parent)
    if (siblings) siblings.push(sco)
    else byParent.set(sco.parent, [sco])
  }
  const seen = new Set<string>()
  const out: ScormTocNode[] = []
  const walk = (parent: string, depth: number): void => {
    if (depth > scoes.length) return
    for (const sco of byParent.get(parent) ?? []) {
      if (seen.has(sco.identifier)) continue
      seen.add(sco.identifier)
      out.push({ sco, depth })
      walk(sco.identifier, depth + 1)
    }
  }
  walk('/', 0)
  // Rows whose parent never appears (a manifest Moodle could not fully
  // resolve) would otherwise vanish from the table of contents.
  for (const sco of scoes) {
    if (!seen.has(sco.identifier)) out.push({ sco, depth: 0 })
  }
  return out
}

/**
 * Splits a SCO launch value into the archive path and its query string.
 * Moodle stores `index.html?page=2` verbatim in the launch column and
 * appends `parameters` to it at runtime; the archive lookup needs the path.
 */
export function splitLaunch(launch: string, parameters = ''): { path: string; query: string } {
  const at = launch.indexOf('?')
  const path = at < 0 ? launch : launch.slice(0, at)
  const own = at < 0 ? '' : launch.slice(at)
  if (parameters === '') return { path, query: own }
  const extra =
    parameters.startsWith('?') || parameters.startsWith('&') ? parameters : `?${parameters}`
  const joined = own === '' ? extra : `${own}${extra.replace(/^\?/, '&')}`
  return { path, query: joined }
}
