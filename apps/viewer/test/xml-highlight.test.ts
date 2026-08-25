import { describe, expect, test } from 'bun:test'
import { tokenizeXml } from '../src/lib/xml-highlight.ts'

/** Concatenated token text must always reproduce the source verbatim. */
function roundTrip(source: string): string {
  return tokenizeXml(source)
    .map((tk) => tk.text)
    .join('')
}

describe('tokenizeXml', () => {
  test('separates element names, attribute names and attribute values', () => {
    const tokens = tokenizeXml('<activity id="201" modulename="page">')

    expect(tokens.filter((tk) => tk.kind === 'tag').map((tk) => tk.text)).toEqual(['activity'])
    expect(tokens.filter((tk) => tk.kind === 'attr').map((tk) => tk.text)).toEqual([
      'id',
      'modulename',
    ])
    expect(tokens.filter((tk) => tk.kind === 'value').map((tk) => tk.text)).toEqual([
      '"201"',
      '"page"',
    ])
  })

  test('marks the element name of a closing tag', () => {
    const tokens = tokenizeXml('</page>')
    expect(tokens.filter((tk) => tk.kind === 'tag').map((tk) => tk.text)).toEqual(['page'])
  })

  test('treats element text content as text, not markup', () => {
    const tokens = tokenizeXml('<name>Presentación del curso</name>')
    const text = tokens.filter((tk) => tk.kind === 'text').map((tk) => tk.text)
    expect(text.join('')).toContain('Presentación del curso')
    expect(tokens.filter((tk) => tk.kind === 'tag').map((tk) => tk.text)).toEqual(['name', 'name'])
  })

  test('does not treat escaped markup inside text as a tag', () => {
    const tokens = tokenizeXml('<intro>&lt;script&gt;alert(1)&lt;/script&gt;</intro>')
    expect(tokens.filter((tk) => tk.kind === 'tag').map((tk) => tk.text)).toEqual([
      'intro',
      'intro',
    ])
  })

  test('keeps CDATA payload as text even when it contains angle brackets', () => {
    const tokens = tokenizeXml('<content><![CDATA[<h2>Ecosistemas</h2>]]></content>')
    expect(tokens.filter((tk) => tk.kind === 'tag').map((tk) => tk.text)).toEqual([
      'content',
      'content',
    ])
  })

  test('round-trips arbitrary input without losing or inventing characters', () => {
    const samples = [
      '<a b="c">text</a>',
      '<content><![CDATA[<h2>x</h2> & "quotes"]]></content>',
      '<!-- a comment with <tags> -->',
      '<?xml version="1.0" encoding="UTF-8"?>\n<root/>',
      '<unterminated attr="value',
      '<empty></empty>',
      'bare text with < and > and & symbols',
      '',
      '<n>Presentación · tróficas</n>',
    ]
    for (const sample of samples) {
      expect(roundTrip(sample)).toBe(sample)
    }
  })

  test('round-trips a single-quoted attribute value', () => {
    const source = "<a href='x.html'>y</a>"
    expect(roundTrip(source)).toBe(source)
    expect(
      tokenizeXml(source)
        .filter((tk) => tk.kind === 'value')
        .map((tk) => tk.text),
    ).toEqual(["'x.html'"])
  })
})
