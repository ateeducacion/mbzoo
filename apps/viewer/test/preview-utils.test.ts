import { describe, expect, test } from 'bun:test'
import {
  formatBytes,
  guessMime,
  H5P_CSP,
  injectCsp,
  injectHead,
  PAGE_NAV_SCRIPT,
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
  test('accepts a well-formed MBZoo navigation message', () => {
    expect(parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: 'page2.html' })).toBe(
      'page2.html',
    )
  })

  test('rejects hostile shapes', () => {
    expect(parseNavigationRequest(null)).toBeUndefined()
    expect(parseNavigationRequest(undefined)).toBeUndefined()
    expect(parseNavigationRequest('navigate')).toBeUndefined()
    expect(parseNavigationRequest(42)).toBeUndefined()
    expect(parseNavigationRequest([])).toBeUndefined()
    expect(parseNavigationRequest({ type: 'navigate', page: 'p.html' })).toBeUndefined()
    expect(
      parseNavigationRequest({ source: 'other', type: 'navigate', page: 'p.html' }),
    ).toBeUndefined()
    expect(
      parseNavigationRequest({ source: 'mbzoo', type: 'exec', page: 'p.html' }),
    ).toBeUndefined()
    expect(parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: 42 })).toBeUndefined()
    expect(parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: '' })).toBeUndefined()
    expect(
      parseNavigationRequest({ source: 'mbzoo', type: 'navigate', page: 'a'.repeat(513) }),
    ).toBeUndefined()
  })

  test('is not fooled by a prototype-polluted payload', () => {
    const evil: unknown = JSON.parse(
      '{"__proto__":{"source":"mbzoo","type":"navigate","page":"p.html"}}',
    )
    expect(parseNavigationRequest(evil)).toBeUndefined()
  })
})

describe('PAGE_NAV_SCRIPT', () => {
  test('never breaks out of its own script element', () => {
    expect(PAGE_NAV_SCRIPT.match(/<\/script>/gi)).toHaveLength(1)
    expect(PAGE_NAV_SCRIPT.endsWith('</script>')).toBe(true)
  })

  test('asks the parent instead of navigating itself', () => {
    expect(PAGE_NAV_SCRIPT).toContain('preventDefault')
    expect(PAGE_NAV_SCRIPT).toContain('postMessage')
    expect(PAGE_NAV_SCRIPT).toContain('data-mbz-page')
  })

  test('the CSP meta precedes any script injected into a sandboxed page', () => {
    // injectHead prepends, so whatever is injected last ends up first. A
    // script placed before the CSP meta would run before the policy applied.
    const built = injectCsp(
      injectHead('<html><head></head><body></body></html>', PAGE_NAV_SCRIPT),
      SANDBOX_CSP,
    )
    expect(built.indexOf('Content-Security-Policy')).toBeLessThan(built.indexOf('<script'))
  })
})
