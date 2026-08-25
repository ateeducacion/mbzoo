import { describe, expect, test } from 'bun:test'
import { classifyProvider, nameRemoteEmbeds } from '../src/lib/external-refs.ts'

const L = { external: 'Embedded from another site', open: 'Open in a new tab ↗' }

describe('classifyProvider', () => {
  test('names known providers', () => {
    expect(classifyProvider('https://player.vimeo.com/video/1')).toBe('Vimeo')
    expect(classifyProvider('https://www.youtube-nocookie.com/embed/x')).toBe('YouTube')
    expect(classifyProvider('https://www.dailymotion.com/embed/video/x')).toBe('Dailymotion')
  })
  test('falls back to the host, never a bare label', () => {
    expect(classifyProvider('https://example.com/')).toBe('example.com')
  })
})

describe('nameRemoteEmbeds', () => {
  // sandbox-video-probe.elpx: four remote iframes + one local one.
  const html =
    '<iframe src="https://player.vimeo.com/video/76979871" title="Clip"></iframe>' +
    '<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"></iframe>' +
    '<iframe src="https://www.dailymotion.com/embed/video/x2jvvep"></iframe>' +
    '<iframe src="https://example.com/"></iframe>' +
    '<iframe src="../probe-embed.pdf"></iframe>'

  test('a remote iframe becomes an inert card with the provider and a link', () => {
    const out = nameRemoteEmbeds(html, L)
    expect(out).not.toContain('player.vimeo.com/video/76979871"></iframe>')
    expect(out).toContain('Vimeo')
    // the iframe title, when present, labels the card
    expect(out).toContain('Clip')
    // the URL survives only as a link the user must click — never auto-loaded
    expect(out).toContain('href="https://player.vimeo.com/video/76979871"')
    expect(out).toContain('rel="noreferrer noopener nofollow"')
    expect(out).toContain(L.open)
  })

  test('every remote host is carded; a relative/local ref is left intact', () => {
    const out = nameRemoteEmbeds(html, L)
    for (const host of ['YouTube', 'Dailymotion', 'example.com']) {
      expect(out).toContain(host)
    }
    // the local iframe is the only one left; every remote one is now a card
    expect(out).toContain('<iframe src="../probe-embed.pdf"></iframe>')
    expect(out.match(/<iframe/g)?.length).toBe(1)
  })

  test('blob: and data: sources are never touched', () => {
    const local = '<iframe src="blob:abc"></iframe><video src="data:video/mp4;base64,AA"></video>'
    expect(nameRemoteEmbeds(local, L)).toBe(local)
  })

  test('object[data] and video[src] to a remote host are carded too', () => {
    const out = nameRemoteEmbeds(
      '<object data="https://evil.example/x.swf"></object>' +
        '<video src="https://cdn.example/v.mp4"></video>',
      L,
    )
    expect(out).not.toContain('<object')
    expect(out).not.toContain('<video')
    expect(out).toContain('cdn.example')
  })

  test('ampersands in the URL are escaped into the href', () => {
    const out = nameRemoteEmbeds('<iframe src="https://x.example/?a=1&b=2"></iframe>', L)
    expect(out).toContain('href="https://x.example/?a=1&amp;b=2"')
  })
})
