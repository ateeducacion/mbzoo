/**
 * Experimental H5P playback (ADR-0018) built on h5p-standalone (TECH-014).
 *
 * Security model (ADR-0014, unchanged): the generated player page runs in an
 * opaque-origin iframe with `sandbox="allow-scripts"` and a default-deny CSP.
 * Every package file reaches the frame through an in-memory base64 map served
 * by a fetch/element shim — nothing is fetched from any network origin.
 */

import { unzipSync } from 'fflate'
import { H5P_CSP, injectCsp } from './preview-utils.ts'

/** Package files by path. A Map keeps every lookup O(1) (packages reach ~150 entries). */
export type H5pEntries = Map<string, Uint8Array>

/** Unzips a .h5p package; throws on malformed input (caller degrades). */
export function unzipH5p(data: Uint8Array): H5pEntries {
  const entries: H5pEntries = new Map()
  for (const [path, bytes] of Object.entries(unzipSync(data))) {
    if (!path.endsWith('/')) entries.set(path, bytes)
  }
  if (!entries.has('h5p.json')) {
    throw new Error('not an H5P package: missing h5p.json')
  }
  return entries
}

export function isH5pFileName(name: string): boolean {
  return /\.h5p$/i.test(name)
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
    // H5P.getPath() injects the content id ("content/<cid>/images/x.jpg") and
    // prefixes an absolute root, neither of which exist in the package. Match
    // on the longest trailing segment chain instead of the whole path.
    var seg = p.split('/');
    for (var s = 1; s < seg.length; s++) {
      var tail = seg.slice(s).join('/');
      if (Object.prototype.hasOwnProperty.call(VFS, tail)) return tail;
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].length > tail.length && keys[k].slice(-tail.length - 1) === '/' + tail) return keys[k];
      }
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
  // Interception must sit on the prototypes, not on document.createElement:
  // content types build media with new Image(), innerHTML and cloneNode,
  // none of which route through createElement.
  var IDL = [
    ['HTMLImageElement', 'src'], ['HTMLScriptElement', 'src'],
    ['HTMLMediaElement', 'src'], ['HTMLSourceElement', 'src'],
    ['HTMLEmbedElement', 'src'], ['HTMLTrackElement', 'src'],
    ['HTMLIFrameElement', 'src'], ['HTMLLinkElement', 'href']
  ];
  var REAL = typeof WeakMap === 'function' ? new WeakMap() : null;
  function mapped(value) {
    if (value == null) return null;
    var key = lookup(value);
    return key ? URL.createObjectURL(new Blob([bytesFor(key)], { type: mimeFor(key) })) : null;
  }
  IDL.forEach(function (pair) {
    var ctor = window[pair[0]];
    if (!ctor || !ctor.prototype) return;
    var desc = Object.getOwnPropertyDescriptor(ctor.prototype, pair[1]);
    if (!desc || !desc.set) return;
    try {
      Object.defineProperty(ctor.prototype, pair[1], {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () {
          var kept = REAL && REAL.get(this);
          return kept != null ? kept : desc.get.call(this);
        },
        set: function (value) {
          if (REAL) REAL.set(this, value == null ? null : String(value));
          desc.set.call(this, mapped(value) || value);
        }
      });
    } catch (e) {}
  });
  var ATTRS = { src: 1, href: 1, poster: 1, 'xlink:href': 1 };
  var origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name && ATTRS[String(name).toLowerCase()]) {
      if (REAL) REAL.set(this, value == null ? null : String(value));
      return origSetAttr.call(this, name, mapped(value) || value);
    }
    return origSetAttr.call(this, name, value);
  };
  var origSetAttrNS = Element.prototype.setAttributeNS;
  Element.prototype.setAttributeNS = function (ns, name, value) {
    if (name && ATTRS[String(name).toLowerCase()]) {
      return origSetAttrNS.call(this, ns, name, mapped(value) || value);
    }
    return origSetAttrNS.call(this, ns, name, value);
  };
  // XMLHttpRequest: a request for a package path is answered from the VFS,
  // synchronously or not as the caller asked; anything else reaches the
  // real XHR, where the injected CSP refuses it. Old runtimes (Captivate's
  // CPXHRLoader among them) load their own code this way.
  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var realOpen = XHR.prototype.open;
    var realSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url, async) {
      var key = null;
      try { key = lookup(url); } catch (e) {}
      this.__mbzooKey = key;
      this.__mbzooAsync = async !== false;
      if (key) return;
      return realOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      var key = this.__mbzooKey;
      if (!key) return realSend.apply(this, arguments);
      var xhr = this;
      var bytes = bytesFor(key);
      var mime = mimeFor(key);
      function deliver() {
        var text = null;
        var body;
        var type = xhr.responseType || '';
        if (type === 'arraybuffer') body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        else if (type === 'blob') body = new Blob([bytes], { type: mime });
        else {
          text = new TextDecoder('utf-8').decode(bytes);
          body = type === 'json' ? JSON.parse(text) : text;
        }
        var props = {
          readyState: 4, status: 200, statusText: 'OK', response: body,
          responseText: type === '' || type === 'text' ? text : undefined,
          responseURL: key
        };
        Object.keys(props).forEach(function (name) {
          try { Object.defineProperty(xhr, name, { value: props[name], configurable: true }); } catch (e) {}
        });
        xhr.getResponseHeader = function (h) { return String(h).toLowerCase() === 'content-type' ? mime : null; };
        xhr.getAllResponseHeaders = function () { return 'content-type: ' + mime + '\\r\\n'; };
        ['readystatechange', 'load', 'loadend'].forEach(function (name) {
          try { xhr.dispatchEvent(new Event(name)); } catch (e) {}
        });
      }
      if (this.__mbzooAsync) setTimeout(deliver, 0); else deliver();
    };
  }
})();
`

/**
 * The VFS bootstrap as head markup: the package bytes as base64 JSON plus the
 * shim that serves them. Any sandboxed page may prepend these (ADR-0032:
 * a SCO whose runtime injects its own scripts). `exclude` skips paths the
 * page inlines directly, which would otherwise ride along twice.
 */
export function vfsHeadScripts(
  entries: H5pEntries,
  exclude: ReadonlySet<string> = new Set(),
): string[] {
  const vfs: Record<string, string> = {}
  for (const [path, bytes] of entries) {
    if (!exclude.has(path)) vfs[path] = toBase64(bytes)
  }
  return [
    `<script id="mbzoo-vfs" type="application/json">${inlineJson(vfs)}</script>`,
    `<script>window.__MBZOO_VFS__ = JSON.parse(document.getElementById('mbzoo-vfs').textContent);</script>`,
    `<script>${SHIM_SOURCE}</script>`,
  ]
}

export interface PlayerAssets {
  /** Raw asset texts, inlined into the player page (ADR-0018 rule 3). */
  coreJs: string
  css: string
}

/** Neutralizes </script> sequences so bundled JS can be inlined safely. */
function inlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

/**
 * Neutralizes </style> so package CSS cannot close the element and inject
 * markup. CSS ignores the backslash-escaped form, browsers do not close on it.
 */
function inlineStyle(source: string): string {
  return source.replace(/<\/style/gi, '\\3c /style')
}

/**
 * Escapes a JSON payload for embedding inside a <script> element. `<` must
 * become the six-character \u003c sequence — a bare '\u003c' string literal is
 * the character itself and would leave `</script>` in a zip entry name or in
 * content.json free to close the block.
 */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
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
  /** [package path, decoded text] — the path lets the caller de-duplicate the VFS. */
  js: Array<[path: string, text: string]>
  css: Array<[path: string, text: string]>
}

const readJson = (entries: H5pEntries, path: string): Record<string, unknown> => {
  const bytes = entries.get(path)
  if (!bytes) throw new Error(`missing package file: ${path}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error(`malformed JSON in package file: ${path}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object in package file: ${path}`)
  }
  return parsed as Record<string, unknown>
}

/**
 * H5P writes library versions as numbers in some packages and as decimal
 * strings in others (H5P.DragText 1.8 ships `"majorVersion": "1"`), so accept
 * both and normalize. Anything else is rejected.
 */
function asVersion(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : undefined
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

/** Narrows one dependency entry; everything in a package is hostile input. */
function asDependency(value: unknown): LibraryDependency | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const d = value as Record<string, unknown>
  const majorVersion = asVersion(d.majorVersion)
  const minorVersion = asVersion(d.minorVersion)
  if (typeof d.machineName !== 'string' || d.machineName === '') return undefined
  if (majorVersion === undefined || minorVersion === undefined) return undefined
  return { machineName: d.machineName, majorVersion, minorVersion }
}

function asDependencies(value: unknown): LibraryDependency[] {
  if (!Array.isArray(value)) return []
  const out: LibraryDependency[] = []
  for (const item of value) {
    const dep = asDependency(item)
    if (dep) out.push(dep)
  }
  return out
}

/** Narrows a preloadedJs/preloadedCss list to the in-package paths it declares. */
function asFilePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const path = (item as Record<string, unknown>).path
    if (typeof path === 'string' && path !== '') out.push(path)
  }
  return out
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
  const visit = (deps: LibraryDependency[]): void => {
    for (const dep of deps) {
      const folder = `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`
      if (visited.has(folder)) continue
      visited.add(folder)
      const raw = readJson(entries, `${folder}/library.json`)
      const definition: LibraryDefinition = {
        ...dep,
        preloadedDependencies: asDependencies(raw.preloadedDependencies),
        preloadedJs: asFilePaths(raw.preloadedJs).map((path) => ({ path })),
        preloadedCss: asFilePaths(raw.preloadedCss).map((path) => ({ path })),
      }
      visit(definition.preloadedDependencies ?? [])
      const collect = (files: Array<{ path: string }>): Array<[path: string, text: string]> =>
        files.map((file) => {
          const key = `${folder}/${file.path}`
          const bytes = entries.get(key)
          if (!bytes) throw new Error(`missing library file: ${key}`)
          return [key, new TextDecoder().decode(bytes)]
        })
      out.push({
        folder,
        definition,
        js: collect(definition.preloadedJs ?? []),
        css: collect(definition.preloadedCss ?? []),
      })
    }
  }
  visit(asDependencies(readJson(entries, 'h5p.json').preloadedDependencies))
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
  const h5p = readJson(entries, 'h5p.json')
  const mainLibrary = typeof h5p.mainLibrary === 'string' ? h5p.mainLibrary : ''
  if (mainLibrary === '') throw new Error('h5p.json declares no mainLibrary')
  const mainDep = asDependencies(h5p.preloadedDependencies).find(
    (d) => d.machineName === mainLibrary,
  )
  if (!mainDep) throw new Error(`main library ${mainLibrary} not declared`)
  const contentBytes = entries.get('content/content.json')
  if (!contentBytes) throw new Error('missing package file: content/content.json')
  const jsonContent = new TextDecoder().decode(contentBytes)
  // H5P core parses this string itself and throws inside the frame if it is
  // malformed, which the app cannot observe: reject it here so the caller can
  // degrade to the download card instead of showing an empty player.
  try {
    JSON.parse(jsonContent)
  } catch {
    throw new Error('malformed JSON in package file: content/content.json')
  }
  const title = typeof h5p.title === 'string' ? h5p.title : ''
  const license = typeof h5p.license === 'string' ? h5p.license : 'U'

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
        title,
        url: '',
        library: `${mainLibrary} ${mainDep.majorVersion}.${mainDep.minorVersion}`,
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
        metadata: { title, license },
      },
    },
  }

  const libCss = libs.flatMap((l) => l.css.map(([, text]) => text)).join('\n')
  const libJs = libs.flatMap((l) => l.js.map(([, text]) => text)).join('\n;\n')

  // Library JS/CSS and content.json are already inlined above; carrying their
  // bytes in the base64 VFS as well tripled the page against real packages.
  const inlined = new Set<string>([
    'content/content.json',
    ...libs.flatMap((l) => [...l.js, ...l.css].map(([path]) => path)),
  ])
  const vfs: Record<string, string> = {}
  for (const [path, bytes] of entries) {
    if (!inlined.has(path)) vfs[path] = toBase64(bytes)
  }

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>H5P preview</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; }
${inlineStyle(assets.css)}
${inlineStyle(libCss)}
</style>
<script id="mbzoo-vfs" type="application/json">${inlineJson(vfs)}</script>
<script>window.__MBZOO_VFS__ = JSON.parse(document.getElementById('mbzoo-vfs').textContent);
window.H5PIntegration = ${inlineJson(integration)};</script>
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
