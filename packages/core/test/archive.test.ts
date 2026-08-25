import { describe, expect, test } from 'bun:test'
import { detectFormat, sanitizeTarName } from '../src/index.ts'

describe('detectFormat', () => {
  test('zip magic', () => {
    expect(detectFormat(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('zip')
    expect(detectFormat(new Uint8Array([0x50, 0x4b, 5, 6]))).toBe('zip') // empty zip
  })
  test('gzip magic', () => {
    expect(detectFormat(new Uint8Array([0x1f, 0x8b, 8, 0]))).toBe('targz')
  })
  test('unknown / short inputs', () => {
    expect(detectFormat(new Uint8Array([1, 2]))).toBe('unknown')
    expect(detectFormat(new Uint8Array([]))).toBe('unknown')
  })
})

describe('sanitizeTarName (path traversal guard)', () => {
  test.each([
    ['normal/file.txt', 'normal/file.txt'],
    ['../../etc/passwd', undefined],
    ['/absolute/path', undefined],
    ['a/../../b', undefined],
  ])('%s → %s', (input, expected) => {
    expect(sanitizeTarName(input)).toBe(expected)
  })
})
