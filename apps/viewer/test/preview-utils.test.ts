import { describe, expect, test } from 'bun:test'
import {
  decodeRefPath,
  formatBytes,
  guessMime,
  H5P_CSP,
  injectCsp,
  injectHead,
  pageNavScript,
  parseNavigationRequest,
  resolveRelative,
  SANDBOX_CSP,
  splitRef,
} from '../src/lib/preview-utils.ts'

describe('formatBytes', () => {
  test('scales units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('guessMime', () => {
  test('maps known extensions and falls back to octet-stream', () => {
    expect(guessMime('a.PDF')).toBe('application/pdf')
    expect(guessMime('photo.jpeg')).toBe('image/jpeg')
    expect(guessMime('data.bin')).toBe('application/octet-stream')
    expect(guessMime('noextension')).toBe('application/octet-stream')
  })
})

describe('injectCsp', () => {
  test('injects into existing head', () => {
    const out = injectCsp('<html><head><title>t</title></head></html>', SANDBOX_CSP)
    expect(out).toContain('<meta http-equiv="Content-Security-Policy"')
    expect(out.indexOf('<meta')).toBeLessThan(out.indexOf('<title>'))
  })
  test('wraps headless documents and bare fragments', () => {
    expect(injectCsp('<html><body>x</body></html>', 'csp')).toContain('<head>')
    expect(injectCsp('<p>frag</p>', 'csp').startsWith('<meta')).toBe(true)
  })
})

describe('resolveRelative', () => {
  test('resolves sibling, subdirectory, parent and absolute refs', () => {
    expect(resolveRelative('', 'css/site.css')).toBe('css/site.css')
    expect(resolveRelative('pages/', './img/a.png')).toBe('pages/img/a.png')
    expect(resolveRelative('pages/deep/', '../shared/x.js')).toBe('pages/shared/x.js')
    expect(resolveRelative('pages/', '/top.css')).toBe('top.css')
  })
})

describe('sandbox CSP invariants', () => {
  // H5P_CSP is intentionally a separate, narrower constant (ADR-0018). These
  // lock what both must always deny, so widening one for archive HTML cannot
  // silently widen what backup-provided H5P code may load.
  for (const [name, csp] of [
    ['SANDBOX_CSP', SANDBOX_CSP],
    ['H5P_CSP', H5P_CSP],
  ] as const) {
    test(`${name} denies network egress, framing and form posts`, () => {
      expect(csp).toContain("default-src 'none'")
      expect(csp).toContain("connect-src 'none'")
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("form-action 'none'")
      expect(csp).not.toContain('*')
      expect(csp).not.toMatch(/https?:/)
    })
  }

  test('H5P_CSP is never wider than SANDBOX_CSP', () => {
    const sources = (csp: string, directive: string): string[] =>
      csp
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${directive} `))
        ?.slice(directive.length + 1)
        .split(/\s+/) ?? []
    for (const directive of ['img-src', 'style-src', 'script-src', 'media-src', 'font-src']) {
      const wide = new Set(sources(SANDBOX_CSP, directive))
      for (const source of sources(H5P_CSP, directive)) {
        expect(`${directive}:${source}`).toBe(
          `${directive}:${wide.has(source) ? source : '<not allowed by SANDBOX_CSP>'}`,
        )
      }
    }
  })
})

describe('splitRef', () => {
  test('separates path, query and fragment', () => {
    expect(splitRef('page2.html')).toEqual({ path: 'page2.html', hash: '' })
    expect(splitRef('page2.html#deep')).toEqual({ path: 'page2.html', hash: '#deep' })
    expect(splitRef('page2.html?v=1#deep')).toEqual({ path: 'page2.html', hash: '#deep' })
    expect(splitRef('#top')).toEqual({ path: '', hash: '#top' })
  })
})

describe('resolveRelative with query and fragment', () => {
  test('drops both so a file record can match', () => {
    expect(resolveRelative('/site/', 'page2.html#deep')).toBe('site/page2.html')
    expect(resolveRelative('/site/', '../other/page2.html?v=1')).toBe('other/page2.html')
  })
})

describe('parseNavigationRequest', () => {
  const TOKEN = 'a5f1c3d2-0000-4000-8000-000000000000'
  const ok = { source: 'mbzoo', type: 'navigate', token: TOKEN, page: 'page2.html' }

  test('accepts a well-formed MBZoo navigation message', () => {
    expect(parseNavigationRequest(ok, TOKEN)).toBe('page2.html')
  })

  test('rejects hostile shapes', () => {
    expect(parseNavigationRequest(null, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest(undefined, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest('navigate', TOKEN)).toBeUndefined()
    expect(parseNavigationRequest(42, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest([], TOKEN)).toBeUndefined()
    expect(parseNavigationRequest({ ...ok, source: undefined }, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest({ ...ok, source: 'other' }, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest({ ...ok, type: 'exec' }, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest({ ...ok, page: 42 }, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest({ ...ok, page: '' }, TOKEN)).toBeUndefined()
    expect(parseNavigationRequest({ ...ok, page: 'a'.repeat(513) }, TOKEN)).toBeUndefined()
  })

  test('refuses a message that does not echo this document token', () => {
    // The document a hostile frame navigated itself to keeps the same
    // WindowProxy, but never saw the token (ADR-0022).
    expect(parseNavigationRequest({ ...ok, token: 'wrong' }, TOKEN)).toBeUndefined()
    const { token: _dropped, ...withoutToken } = ok
    expect(parseNavigationRequest(withoutToken, TOKEN)).toBeUndefined()
    // An empty expected token never matches, so a render without one is inert.
    expect(parseNavigationRequest({ ...ok, token: '' }, '')).toBeUndefined()
  })

  test('is not fooled by a prototype-polluted payload', () => {
    const evil: unknown = JSON.parse(
      `{"__proto__":{"source":"mbzoo","type":"navigate","token":"${TOKEN}","page":"p.html"}}`,
    )
    expect(parseNavigationRequest(evil, TOKEN)).toBeUndefined()
  })
})

describe('decodeRefPath', () => {
  test('decodes percent-escapes and survives a malformed one', () => {
    expect(decodeRefPath('a%20b.html')).toBe('a b.html')
    expect(decodeRefPath('m%C3%A1quina.html')).toBe('máquina.html')
    // A lone % would make decodeURIComponent throw inside the message handler.
    expect(decodeRefPath('100%.html')).toBe('100%.html')
  })
})

describe('pageNavScript', () => {
  const TOKEN = 'a5f1c3d2-0000-4000-8000-000000000000'

  test('never breaks out of its own script element', () => {
    const script = pageNavScript(TOKEN)
    expect(script.match(/<\/script>/gi)).toHaveLength(1)
    expect(script.endsWith('</script>')).toBe(true)
  })

  test('asks the parent instead of navigating itself, and echoes the token', () => {
    const script = pageNavScript(TOKEN)
    expect(script).toContain('preventDefault')
    expect(script).toContain('postMessage')
    expect(script).toContain('data-mbz-page')
    expect(script).toContain(TOKEN)
  })

  test('a hostile token cannot terminate the script or inject syntax', () => {
    const script = pageNavScript('</script><img src=x onerror=alert(1)>')
    expect(script.match(/<\/script>/gi)).toHaveLength(1)
    expect(script.endsWith('</script>')).toBe(true)
  })

  test('only the live page attribute is a navigation hook, not the inert one', () => {
    expect(pageNavScript(TOKEN)).toContain('[data-mbz-page]')
  })

  test('the CSP meta precedes any script injected into a sandboxed page', () => {
    // injectHead prepends, so whatever is injected last ends up first. A
    // script placed before the CSP meta would run before the policy applied.
    const built = injectCsp(
      injectHead('<html><head></head><body></body></html>', pageNavScript(TOKEN)),
      SANDBOX_CSP,
    )
    expect(built.indexOf('Content-Security-Policy')).toBeLessThan(built.indexOf('<script'))
  })
})
