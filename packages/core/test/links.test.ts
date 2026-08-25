import { describe, expect, test } from 'bun:test'
import { backupLinkUrl, decodeBackupLink } from '../src/moodle/links.ts'

const SITE = 'https://learn.saylor.org'

describe('decodeBackupLink', () => {
  // Observed in CS401-2017-07-19 (REPO-004): a page linking prerequisite courses.
  test('decodes a course link', () => {
    const link = decodeBackupLink('$@COURSEVIEWBYID*62@$')
    expect(link?.code).toBe('COURSEVIEWBYID')
    expect(link?.args).toEqual(['62'])
    expect(link?.path).toBe('/course/view.php?id=62')
    // A course id is not a course-module id.
    expect(link?.moduleId).toBeUndefined()
  })

  test('decodes the generic per-module rules', () => {
    expect(decodeBackupLink('$@PAGEVIEWBYID*921@$')?.path).toBe('/mod/page/view.php?id=921')
    expect(decodeBackupLink('$@PAGEVIEWBYID*921@$')?.moduleId).toBe(921)
    expect(decodeBackupLink('$@FORUMINDEX*94@$')?.path).toBe('/mod/forum/index.php?id=94')
    // An index is a course listing, not a module.
    expect(decodeBackupLink('$@FORUMINDEX*94@$')?.moduleId).toBeUndefined()
  })

  test('decodes multi-argument rules', () => {
    expect(decodeBackupLink('$@BOOKCHAPTER*12*34@$')?.path).toBe(
      '/mod/book/view.php?id=12&chapterid=34',
    )
    expect(decodeBackupLink('$@BOOKCHAPTER*12*34@$')?.moduleId).toBe(12)
    expect(decodeBackupLink('$@FORUMDISCUSSIONVIEWINSIDE*7*9@$')?.path).toBe(
      '/mod/forum/discuss.php?d=7#9',
    )
  })

  test('site-level codes win over the generic module pattern', () => {
    // Would otherwise be read as a "userindex" module.
    expect(decodeBackupLink('$@USERINDEXVIEWBYID*94@$')?.path).toBe('/user/index.php?id=94')
    expect(decodeBackupLink('$@USERINDEXVIEWBYID*94@$')?.moduleId).toBeUndefined()
    expect(decodeBackupLink('$@GRADEINDEXBYID*94@$')?.path).toBe('/grade/index.php?id=94')
  })

  test('$@NULL@$ is a field value, never a link', () => {
    expect(decodeBackupLink('$@NULL@$')).toBeUndefined()
  })

  test('non-tokens are rejected', () => {
    expect(decodeBackupLink('https://example.com')).toBeUndefined()
    expect(decodeBackupLink('see $@COURSEVIEWBYID*1@$ here')).toBeUndefined()
    expect(decodeBackupLink('$@lowercase*1@$')).toBeUndefined()
  })

  test('an unknown code decodes to no path instead of a guessed URL', () => {
    const link = decodeBackupLink('$@SOMETHINGENTIRELYNEW*1*2@$')
    expect(link?.code).toBe('SOMETHINGENTIRELYNEW')
    expect(link?.path).toBe('')
  })

  test('a missing argument voids the path', () => {
    expect(decodeBackupLink('$@BOOKCHAPTER*12@$')?.path).toBe('')
    expect(decodeBackupLink('$@COURSEVIEWBYID@$')?.path).toBe('')
  })

  test('arguments are URL-encoded, so an argument cannot inject query syntax', () => {
    expect(decodeBackupLink('$@PAGEVIEWBYID*a b@$')?.path).toBe('/mod/page/view.php?id=a%20b')
    expect(decodeBackupLink('$@COURSEVIEWBYID*1&x=2@$')?.path).toBe('/course/view.php?id=1%26x%3D2')
  })
})

describe('backupLinkUrl', () => {
  test('builds an absolute URL on the original site', () => {
    const link = decodeBackupLink('$@COURSEVIEWBYID*62@$')
    expect(link && backupLinkUrl(link, SITE)).toBe('https://learn.saylor.org/course/view.php?id=62')
  })

  test('tolerates a trailing slash and surrounding whitespace', () => {
    const link = decodeBackupLink('$@COURSEVIEWBYID*62@$')
    expect(link && backupLinkUrl(link, `  ${SITE}/  `)).toBe(`${SITE}/course/view.php?id=62`)
  })

  test('returns nothing when the backup records no site', () => {
    const link = decodeBackupLink('$@COURSEVIEWBYID*62@$')
    expect(link && backupLinkUrl(link, '')).toBeUndefined()
  })

  test('a hostile wwwroot cannot turn a token into a script URL', () => {
    const link = decodeBackupLink('$@COURSEVIEWBYID*62@$')
    for (const root of [
      'javascript:alert(1)//',
      'data:text/html,x',
      'file:///etc',
      '//evil.test',
    ]) {
      expect(link && backupLinkUrl(link, root)).toBeUndefined()
    }
  })

  test('an undecodable code never produces a URL', () => {
    const link = decodeBackupLink('$@SOMETHINGENTIRELYNEW*1@$')
    expect(link && backupLinkUrl(link, SITE)).toBeUndefined()
  })
})
