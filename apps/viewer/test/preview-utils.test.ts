import { describe, expect, test } from 'bun:test'
import {
  formatBytes,
  guessMime,
  injectCsp,
  resolveRelative,
  SANDBOX_CSP,
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
