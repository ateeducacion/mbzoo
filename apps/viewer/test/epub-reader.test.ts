import { describe, expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import {
  composeChapter,
  joinEpubPath,
  readEpub,
  unzipEpub,
  xmlText,
} from '../src/lib/epub-reader.ts'

function buildEpub(overrides: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
       <rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
    ),
    'OEBPS/content.opf': strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A Book</dc:title></metadata>
        <manifest>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
          <item id="css" href="s.css" media-type="text/css"/>
        </manifest>
        <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
      </package>`,
    ),
    'OEBPS/ch1.xhtml': strToU8(
      '<html><head><title>One</title><link rel="stylesheet" href="s.css"/></head>' +
        '<body><a href="ch2.xhtml">next</a><a href="https://example.org">out</a></body></html>',
    ),
    'OEBPS/ch2.xhtml': strToU8('<html><head><title>Two</title></head><body>two</body></html>'),
    'OEBPS/s.css': strToU8('body{color:red}'),
  }
  for (const [path, text] of Object.entries(overrides)) files[path] = strToU8(text)
  return zipSync(files)
}

describe('unzipEpub', () => {
  test('refuses anything without a container', () => {
    expect(() => unzipEpub(zipSync({ 'a.txt': strToU8('x') }))).toThrow()
  })
})

describe('readEpub', () => {
  test('reads the title and the spine in reading order', () => {
    const book = readEpub(unzipEpub(buildEpub()))
    expect(book.title).toBe('A Book')
    expect(book.chapters.map((c) => c.path)).toEqual(['OEBPS/ch1.xhtml', 'OEBPS/ch2.xhtml'])
    expect(book.chapters.map((c) => c.title)).toEqual(['One', 'Two'])
  })

  test('skips a spine entry whose idref does not resolve', () => {
    const book = readEpub(
      unzipEpub(
        buildEpub({
          'OEBPS/content.opf': `<package xmlns="http://www.idpf.org/2007/opf">
            <manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
            <spine><itemref idref="missing"/><itemref idref="c1"/></spine></package>`,
        }),
      ),
    )
    expect(book.chapters.map((c) => c.path)).toEqual(['OEBPS/ch1.xhtml'])
  })

  test('falls back to the manifest when the spine is empty', () => {
    const book = readEpub(
      unzipEpub(
        buildEpub({
          'OEBPS/content.opf': `<package xmlns="http://www.idpf.org/2007/opf">
            <manifest>
              <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
              <item id="css" href="s.css" media-type="text/css"/>
            </manifest>
            <spine></spine></package>`,
        }),
      ),
    )
    // The stylesheet is in the manifest too and must not become a chapter.
    expect(book.chapters.map((c) => c.path)).toEqual(['OEBPS/ch1.xhtml'])
  })
})

describe('joinEpubPath', () => {
  test('resolves against the package document directory', () => {
    expect(joinEpubPath('OEBPS', 'ch1.xhtml')).toBe('OEBPS/ch1.xhtml')
    expect(joinEpubPath('OEBPS/text', '../images/a.png')).toBe('OEBPS/images/a.png')
    expect(joinEpubPath('OEBPS', '../../../etc/passwd')).toBe('etc/passwd')
  })
})

describe('composeChapter', () => {
  test('inlines a relative asset and defuses a link to another chapter', () => {
    const book = readEpub(unzipEpub(buildEpub()))
    const html = composeChapter(book, 'OEBPS/ch1.xhtml')
    expect(html).toContain('href="data:text/css;base64,')
    // Another chapter must not be reachable as an unprocessed document.
    expect(html).toContain('data-mbz-page-inert="ch2.xhtml"')
    expect(html).not.toContain('href="ch2.xhtml"')
    // The author's external link is left for retargetExternalLinks.
    expect(html).toContain('href="https://example.org"')
  })

  test('leaves a reference the package does not carry alone', () => {
    const book = readEpub(
      unzipEpub(
        buildEpub({
          'OEBPS/ch1.xhtml':
            '<html><head><title>One</title></head><body><img src="missing.png"/></body></html>',
        }),
      ),
    )
    const html = composeChapter(book, 'OEBPS/ch1.xhtml')
    expect(html).toContain('src="missing.png"')
  })

  test('refuses a chapter that is not in the package', () => {
    const book = readEpub(unzipEpub(buildEpub()))
    expect(() => composeChapter(book, 'OEBPS/nope.xhtml')).toThrow()
  })
})

describe('xmlText', () => {
  test('decodes the predefined entities and leaves markup as text', () => {
    expect(xmlText('  Tom &amp; Jerry  ')).toBe('Tom & Jerry')
    expect(xmlText('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>')
  })

  test('does not try to strip tags, because a regex cannot do it safely', () => {
    // One pass of /<[^>]*>/g over this leaves "<script" behind. Nothing here
    // pretends to sanitize: every caller renders through textContent.
    expect(xmlText('<scr<script>ipt>')).toBe('<scr<script>ipt>')
  })
})
