import { describe, expect, test } from 'bun:test'
import { parseRelease, targetIsOlder } from '../src/doctor/versions.ts'

describe('parseRelease', () => {
  test('reads major and minor from a Moodle release string', () => {
    expect(parseRelease('4.1.2+ (Build: 20230317)')).toEqual({ major: 4, minor: 1 })
    expect(parseRelease('Moodle 3.11')).toEqual({ major: 3, minor: 11 })
    expect(parseRelease('2023 build 4.5')).toEqual({ major: 4, minor: 5 })
  })

  test('a release without a dotted pair has no major or minor', () => {
    expect(parseRelease('')).toEqual({ major: undefined, minor: undefined })
    expect(parseRelease('20230317')).toEqual({ major: undefined, minor: undefined })
    expect(parseRelease('4.')).toEqual({ major: undefined, minor: undefined })
    expect(targetIsOlder('4', '4.1')).toBeUndefined()
  })

  // CodeQL js/polynomial-redos: the release comes out of the backup, so a long
  // digit run without a dot must not be rescanned from every position.
  test('a release of many digits without a dot is parsed quickly', () => {
    const started = performance.now()
    expect(parseRelease('9'.repeat(50_000))).toEqual({ major: undefined, minor: undefined })
    expect(parseRelease(`${'9'.repeat(50_000)}x`)).toEqual({ major: undefined, minor: undefined })
    expect(performance.now() - started).toBeLessThan(250)
  })
})
