/**
 * Experimental H5P playback (ADR-0017) built on h5p-standalone (TECH-014).
 *
 * Security model (ADR-0014, unchanged): the generated player page runs in an
 * opaque-origin iframe with `sandbox="allow-scripts"` and a default-deny CSP.
 * Every package file reaches the frame through an in-memory base64 map served
 * by a fetch/element shim — nothing is fetched from any network origin.
 */

import { unzipSync } from 'fflate'
import { H5P_CSP, injectCsp } from './preview-utils.ts'

export type H5pEntries = Array<[path: string, bytes: Uint8Array]>

/** Unzips a .h5p package; throws on malformed input (caller degrades). */
export function unzipH5p(data: Uint8Array): H5pEntries {
  const unzipped = unzipSync(data)
  const entries: H5pEntries = []
  for (const [path, bytes] of Object.entries(unzipped)) {
    if (!path.endsWith('/')) entries.push([path, bytes])
  }
  if (!entries.some(([p]) => p === 'h5p.json')) {
    throw new Error('not an H5P package: missing h5p.json')
  }
  return entries
}

export function isH5pFileName(name: string): boolean {
  return /\.h5p$/i.test(name)
}

/** Strips query/hash and leading relative segments for virtual lookup. */
export function normalizeVfsPath(path: string): string {
  return (
    path
      .split(/[?#]/)[0]
      ?.replace(/^\.?\//, '')
      .replace(/\/{2,}/g, '/') ?? ''
  )
}

const MIME_BY_EXTENSION: Record<string, string> = {
  json: 'application/json',
  js: 'text/javascript',
  css: 'text/css',
  html: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
}

export function vfsMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

/**
 * Resolves a requested URL against the package map: exact match first, then
 * suffix match, because the player prefixes requests with configurable root
 * paths ("/pkg/libraries/…" vs the stored "H5P.Lib-1.0/library.json").
 */
export function resolveVfsEntry(
  entries: H5pEntries,
  path: string,
): [path: string, bytes: Uint8Array] | undefined {
  const wanted = normalizeVfsPath(path)
  if (wanted === '') return undefined
  const exact = entries.find(([p]) => p === wanted)
  if (exact) return exact
  return (
    entries.find(([p]) => wanted.endsWith(`/${p}`)) ??
    entries.find(([p]) => p.endsWith(`/${wanted}`))
  )
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Runtime shim injected into the player page before any other script:
 * answers fetch() from the virtual filesystem and rewrites subresource
 * elements to blob URLs. Everything outside the package is refused.
 */
const SHIM_SOURCE = `
(function () {
  var VFS = window.__MBZOO_VFS__ || {};
  // Sandboxed frames cannot touch storage: substitute in-memory stubs.
  function memStorage() {
    var s = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
      setItem: function (k, v) { s[k] = String(v); },
      removeItem: function (k) { delete s[k]; },
      clear: function () { s = {}; },
      key: function (i) { return Object.keys(s)[i] || null; },
      get length() { return Object.keys(s).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { window[name].getItem('__mbzoo__'); } catch (e) {
      try { Object.defineProperty(window, name, { value: memStorage(), configurable: true }); } catch (e2) {}
    }
  });
  var MIME = ${JSON.stringify(MIME_BY_EXTENSION)};
  function norm(p) {
    return String(p).split('?')[0].split('#')[0].replace(/^\\.?\\//, '').replace(/\\/{2,}/g, '/');
  }
  function lookup(path) {
    var p = norm(path);
    if (Object.prototype.hasOwnProperty.call(VFS, p)) return p;
    var keys = Object.keys(VFS);
    for (var i = 0; i < keys.length; i++) {
      if (p.length > keys[i].length && p.slice(-keys[i].length - 1) === '/' + keys[i]) return keys[i];
    }
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].length > p.length && keys[j].slice(-p.length - 1) === '/' + p) return keys[j];
    }
    return null;
  }
  var decoded = Object.create(null);
  function bytesFor(key) {
    if (!decoded[key]) {
      var raw = atob(VFS[key]);
      var arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      decoded[key] = arr;
    }
    return decoded[key];
  }
  function mimeFor(key) {
    var ext = key.split('.').pop().toLowerCase();
    return MIME[ext] || 'application/octet-stream';
  }
  window.fetch = function (input) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url);
      var key = lookup(url);
      if (key) {
        return Promise.resolve(new Response(new Blob([bytesFor(key)], { type: mimeFor(key) })));
      }
    } catch (e) {}
    return Promise.reject(new TypeError('Blocked: outside the H5P virtual filesystem'));
  };
  var ATTR = { SCRIPT: 'src', LINK: 'href', IMG: 'src', SOURCE: 'src', VIDEO: 'src', AUDIO: 'src', EMBED: 'src', TRACK: 'src' };
  var origCreate = document.createElement.bind(document);
  document.createElement = function (tag) {
    var el = origCreate(tag);
    var attrKey = ATTR[String(tag).toUpperCase()];
    if (!attrKey) return el;
    var real = null;
    var origSet = el.setAttribute.bind(el);
    var origGet = el.getAttribute.bind(el);
    var apply = function (value) {
      real = value == null ? null : String(value);
      var key = real != null ? lookup(real) : null;
      if (key) {
        origSet(attrKey, URL.createObjectURL(new Blob([bytesFor(key)], { type: mimeFor(key) })));
      }
    };
    try {
      Object.defineProperty(el, attrKey, { configurable: true, get: function () { return real; }, set: apply });
    } catch (e) { return el; }
    el.setAttribute = function (name, value) {
      if (String(name).toLowerCase() === attrKey) { apply(value); return; }
      return origSet(name, value);
    };
    el.getAttribute = function (name) {
      if (name && String(name).toLowerCase() === attrKey && real != null) return real;
      return origGet(name);
    };
    return el;
  };
})();
`

export interface PlayerAssets {
  /** Raw asset texts, inlined into the player page (ADR-0017 rule 3). */
  coreJs: string
  css: string
}

/** Neutralizes </script> sequences so bundled JS can be inlined safely. */
function inlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

interface LibraryDependency {
  machineName: string
  majorVersion: number
  minorVersion: number
}

interface LibraryDefinition extends LibraryDependency {
  preloadedDependencies?: LibraryDependency[]
  preloadedJs?: Array<{ path: string }>
  preloadedCss?: Array<{ path: string }>
}

export interface PreloadLibrary {
  folder: string
  definition: LibraryDefinition
  js: string[]
  css: string[]
}

const readJson = (entries: H5pEntries, path: string): Record<string, unknown> => {
  const bytes = entries.find(([p]) => p === path)?.[1]
  if (!bytes) throw new Error(`missing package file: ${path}`)
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
}

/**
 * Walks the package dependency graph depth-first, returning each library in
 * dependency order together with its JS/CSS file paths (relative to the
 * library folder). The caller inlines them after the H5P core so execution
 * order matches what a real H5P server produces.
 */
export function orderedLibraries(entries: H5pEntries): PreloadLibrary[] {
  const out: PreloadLibrary[] = []
  const visited = new Set<string>()
  const visit = (deps: LibraryDependency[] | undefined): void => {
    for (const dep of deps ?? []) {
      const folder = `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`
      if (visited.has(folder)) continue
      visited.add(folder)
      const definition = readJson(entries, `${folder}/library.json`) as unknown as LibraryDefinition
      visit(definition.preloadedDependencies)
      const collect = (files?: Array<{ path: string }>): string[] => {
        const texts: string[] = []
        for (const file of files ?? []) {
          const bytes = entries.find(([p]) => p === `${folder}/${file.path}`)?.[1]
          if (!bytes) throw new Error(`missing library file: ${folder}/${file.path}`)
          texts.push(new TextDecoder().decode(bytes))
        }
        return texts
      }
      out.push({
        folder,
        definition,
        js: collect(definition.preloadedJs),
        css: collect(definition.preloadedCss),
      })
    }
  }
  const h5p = readJson(entries, 'h5p.json') as { preloadedDependencies?: LibraryDependency[] }
  visit(h5p.preloadedDependencies)
  return out
}

/** Minimal English strings covering every key H5P core may request. */
const L10N_EN: Record<string, string> = {
  fullscreen: 'Fullscreen',
  disableFullscreen: 'Disable fullscreen',
  contentChanged: 'This content has changed since you last used it.',
  startingOver: "You'll be starting over.",
  copyrightInformation: 'Copyright information',
  close: 'Close',
  reuseContent: 'Reuse Content',
  reuse: 'Reuse',
  copyrights: 'Copyrights',
  embed: 'Embed',
  showMore: 'Show more',
  showLess: 'Show less',
  subLevel: 'Sublevel',
  confirmDialogHeader: 'Confirm action',
  confirmDialogBody: 'Please confirm that you wish to proceed. This action is not reversible.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Confirm',
  licenseU: 'Undisclosed',
  offlineDialogHeader: 'Your connection to the server was lost',
  offlineDialogBody:
    'We were unable to send information about your completion of this task. Please check your internet connection.',
  offlineDialogRetryMessage: 'Retrying in :num…',
  offlineDialogRetryButtonLabel: 'Retry now',
  offlineSuccessfulSubmit: 'Successfully submitted results.',
  hideAdvanced: 'Hide advanced text options',
  showAdvanced: 'Show advanced text options',
  advancedHelp: 'Include these options when publishing new content.',
  thumbnail: 'Thumbnail',
  contentType: 'Content Type',
  title: 'Title',
  author: 'Author',
  year: 'Year',
  source: 'Source',
  license: 'License',
  licenseExtras: 'License extras',
  changes: 'Changelog',
  next: 'Next',
  previous: 'Previous',
}

/** Builds the complete player document loaded into the sandboxed iframe. */
export function buildPlayerHtml(entries: H5pEntries, assets: PlayerAssets): string {
  const h5p = readJson(entries, 'h5p.json') as {
    title?: string
    mainLibrary: string
    license?: string
    preloadedDependencies?: LibraryDependency[]
  }
  const mainDep = h5p.preloadedDependencies?.find((d) => d.machineName === h5p.mainLibrary)
  if (!mainDep) throw new Error(`main library ${h5p.mainLibrary} not declared`)
  const contentBytes = entries.find(([p]) => p === 'content/content.json')?.[1]
  if (!contentBytes) throw new Error('missing package file: content/content.json')
  const jsonContent = new TextDecoder().decode(contentBytes)

  const libs = orderedLibraries(entries)
  const cid = 'mbzoo-h5p'
  const integration = {
    baseUrl: '',
    url: '',
    saveFreq: false,
    postUserStatistics: false,
    ajax: {},
    l10n: { H5P: L10N_EN },
    contents: {
      [`cid-${cid}`]: {
        title: h5p.title ?? '',
        url: '',
        library: `${h5p.mainLibrary} ${mainDep.majorVersion}.${mainDep.minorVersion}`,
        jsonContent,
        scripts: [] as string[],
        styles: [] as string[],
        fullScreen: false,
        embedCode: '',
        displayOptions: {
          frame: false,
          export: false,
          embed: false,
          copyright: false,
          icon: false,
          copy: false,
        },
        metadata: { title: h5p.title ?? '', license: h5p.license ?? 'U' },
      },
    },
  }

  const libCss = libs.map((l) => l.css.join('\n')).join('\n')
  const libJs = libs.map((l) => l.js.join('\n;\n')).join('\n;\n')
  const vfs: Record<string, string> = {}
  for (const [path, bytes] of entries) vfs[path] = toBase64(bytes)

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>H5P preview</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; }
${assets.css}
${libCss}
</style>
<script id="mbzoo-vfs" type="application/json">${JSON.stringify(vfs).replace(/</g, '\u003c')}</script>
<script>window.__MBZOO_VFS__ = JSON.parse(document.getElementById('mbzoo-vfs').textContent);
window.H5PIntegration = ${JSON.stringify(integration).replace(/</g, '\u003c')};</script>
</head>
<body>
<div class="h5p-content" data-content-id="${cid}"></div>
<script>${SHIM_SOURCE}</script>
<script>${inlineScript(assets.coreJs)}</script>
<script>window.H5P.externalEmbed = true;</script>
<script>${inlineScript(libJs)}</script>
<script>window.H5P.init(document.body);</script>
</body>
</html>`
  return injectCsp(page, H5P_CSP)
}
