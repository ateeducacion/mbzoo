import { describe, expect, test } from 'bun:test'
import { parseImscpStructure, parsePhpSerialized } from '../src/moodle/php-serialized.ts'

describe('parsePhpSerialized', () => {
  test('reads the scalar types Moodle stores', () => {
    expect(parsePhpSerialized('N;')).toBe(null)
    expect(parsePhpSerialized('b:1;')).toBe(true)
    expect(parsePhpSerialized('b:0;')).toBe(false)
    expect(parsePhpSerialized('i:42;')).toBe(42)
    expect(parsePhpSerialized('i:-7;')).toBe(-7)
    expect(parsePhpSerialized('d:1.5;')).toBe(1.5)
    expect(parsePhpSerialized('s:5:"hello";')).toBe('hello')
  })

  // The shape of resource.displayoptions in every REPO-004 backup.
  test('reads a keyed array', () => {
    const value = parsePhpSerialized('a:1:{s:10:"printintro";i:1;}')
    expect(value).toBeInstanceOf(Map)
    expect((value as Map<string, unknown>).get('printintro')).toBe(1)
  })

  test('keeps array order and mixed key types', () => {
    const value = parsePhpSerialized('a:3:{i:0;s:1:"a";i:1;s:1:"b";s:3:"key";i:9;}')
    expect([...(value as Map<string | number, unknown>).keys()]).toEqual([0, 1, 'key'])
  })

  // PHP counts string length in bytes; "ñ" is two. Scanning by JS string
  // index would cut the value short and desynchronise everything after it.
  test('measures string lengths in bytes, not characters', () => {
    expect(parsePhpSerialized('s:7:"españa";')).toBe('españa')
    const nested = parsePhpSerialized('a:1:{s:7:"título";s:4:"día";}')
    expect((nested as Map<string, unknown>).get('título')).toBe('día')
  })

  test('returns undefined for input that is not serialized at all', () => {
    expect(parsePhpSerialized('')).toBeUndefined()
    expect(parsePhpSerialized('just text')).toBeUndefined()
    expect(parsePhpSerialized('$@NULL@$')).toBeUndefined()
  })

  // O:/C: instantiate classes and R:/r: describe cycles. None can appear in
  // data MBZoo reads, and all four are how this format gets weaponized.
  test('refuses objects and back-references', () => {
    expect(parsePhpSerialized('O:8:"stdClass":0:{}')).toBeUndefined()
    expect(parsePhpSerialized('a:1:{i:0;O:8:"stdClass":0:{}}')).toBeUndefined()
    expect(parsePhpSerialized('a:2:{i:0;i:1;i:1;R:2;}')).toBeUndefined()
    expect(parsePhpSerialized('C:3:"Foo":3:{bar}')).toBeUndefined()
  })

  test('refuses malformed payloads instead of guessing', () => {
    expect(parsePhpSerialized('s:99:"short";')).toBeUndefined()
    expect(parsePhpSerialized('a:2:{i:0;i:1;}')).toBeUndefined()
    expect(parsePhpSerialized('i:notanumber;')).toBeUndefined()
    expect(parsePhpSerialized('b:9;')).toBeUndefined()
  })

  test('a header claiming more entries than the payload can hold is refused', () => {
    expect(parsePhpSerialized('a:999999999:{}')).toBeUndefined()
  })

  test('deep nesting is bounded rather than recursing without limit', () => {
    const deep = `${'a:1:{i:0;'.repeat(200)}i:1;${'}'.repeat(200)}`
    expect(parsePhpSerialized(deep)).toBeUndefined()
  })
})

// mod/imscp/lib.php serializes the package TOC as {title, href, subitems}.
describe('parseImscpStructure', () => {
  const TOC =
    'a:2:{i:0;a:3:{s:5:"title";s:7:"Chapter";s:4:"href";s:10:"page1.html";' +
    's:8:"subitems";a:1:{i:0;a:3:{s:5:"title";s:5:"Inner";s:4:"href";' +
    's:10:"page2.html";s:8:"subitems";a:0:{}}}}' +
    'i:1;a:3:{s:5:"title";s:7:"Heading";s:4:"href";s:0:"";s:8:"subitems";a:0:{}}}'

  test('reads the table of contents as a tree', () => {
    const items = parseImscpStructure(TOC)
    expect(items).toHaveLength(2)
    expect(items[0]?.title).toBe('Chapter')
    expect(items[0]?.href).toBe('page1.html')
    expect(items[0]?.children[0]?.title).toBe('Inner')
    expect(items[0]?.children[0]?.href).toBe('page2.html')
  })

  test('a heading with no file is kept, not dropped', () => {
    const items = parseImscpStructure(TOC)
    expect(items[1]?.title).toBe('Heading')
    expect(items[1]?.href).toBe('')
  })

  test('an unreadable structure yields no entries rather than throwing', () => {
    expect(parseImscpStructure('')).toEqual([])
    expect(parseImscpStructure('O:8:"stdClass":0:{}')).toEqual([])
    expect(parseImscpStructure('a:1:{i:0;s:4:"junk";}')).toEqual([])
  })
})
