/**
 * Moodle "encoded link" tokens (`$@CODE*arg@$`).
 *
 * A backup cannot store absolute URLs for content that may be restored on a
 * different site, so Moodle rewrites internal links into these tokens at
 * backup time and decodes them again at restore time. MBZoo never restores
 * anything, so the tokens survive into rendered content: left untouched they
 * resolve against the MBZoo origin and produce links that look like ours and
 * lead nowhere.
 *
 * Templates below are the decode rules read from Moodle core (REPO-005,
 * read 2026-08-25): backup/moodle2/restore_course_task.class.php and the
 * per-module restore_<mod>_activity_task.class.php classes. Codes not listed
 * here decode to '' — callers must degrade, never guess a URL.
 */

/** Matches one token anywhere in a string, e.g. `$@COURSEVIEWBYID*62@$`. */
export const BACKUP_LINK_TOKEN = /\$@[A-Z0-9_]+(?:\*[^@*]*)*@\$/g

const ONE_TOKEN = /^\$@([A-Z0-9_]+)((?:\*[^@*]*)*)@\$$/

export interface BackupLink {
  /** Link code, e.g. "COURSEVIEWBYID". */
  readonly code: string
  /** Positional arguments, in `$1`…`$n` order. */
  readonly args: readonly string[]
  /**
   * Site-relative target the code decodes to, e.g. "/course/view.php?id=62".
   * Empty when the code is unknown or an argument is missing — an unknown
   * code is not a broken link, it is a link MBZoo cannot decode.
   */
  readonly path: string
  /** Course-module id, when the code addresses one (`$1` is a cmid). */
  readonly moduleId?: number
}

/** Course- and site-level rules plus the module rules that are not `*VIEWBYID`. */
const RULES: ReadonlyMap<string, string> = new Map([
  ['COURSEVIEWBYID', '/course/view.php?id=$1'],
  ['COURSESECTIONBYID', '/course/section.php?id=$1'],
  ['GRADEINDEXBYID', '/grade/index.php?id=$1'],
  ['GRADEREPORTINDEXBYID', '/grade/report/index.php?id=$1'],
  ['BADGESVIEWBYID', '/badges/index.php?type=2&id=$1'],
  ['USERINDEXVIEWBYID', '/user/index.php?id=$1'],
  ['FORUMVIEWBYF', '/mod/forum/view.php?f=$1'],
  ['FORUMDISCUSSIONVIEW', '/mod/forum/discuss.php?d=$1'],
  ['FORUMDISCUSSIONVIEWPARENT', '/mod/forum/discuss.php?d=$1&parent=$2'],
  ['FORUMDISCUSSIONVIEWINSIDE', '/mod/forum/discuss.php?d=$1#$2'],
  ['QUIZVIEWBYQ', '/mod/quiz/view.php?q=$1'],
  ['BOOKVIEWBYB', '/mod/book/view.php?b=$1'],
  ['BOOKVIEWBYBCH', '/mod/book/view.php?b=$1&chapterid=$2'],
  ['BOOKVIEWBYIDCH', '/mod/book/view.php?id=$1&chapterid=$2'],
  ['BOOKSTART', '/mod/book/view.php?id=$1'],
  ['BOOKCHAPTER', '/mod/book/view.php?id=$1&chapterid=$2'],
])

/** Rules above whose `$1` is a course-module id, like the generic ones. */
const CMID_RULES = new Set(['BOOKVIEWBYIDCH', 'BOOKSTART', 'BOOKCHAPTER'])

// Every activity module defines <MOD>VIEWBYID → /mod/<mod>/view.php?id=<cmid>
// and <MOD>INDEX → /mod/<mod>/index.php?id=<courseid>. Checked after RULES so
// codes like USERINDEXVIEWBYID are not mistaken for a "userindex" module.
const MODULE_VIEW = /^([A-Z0-9]+)VIEWBYID$/
const MODULE_INDEX = /^([A-Z0-9]+)INDEX$/

/**
 * Decodes one token. Returns undefined when the string is not a token at
 * all, and for `$@NULL@$` — Moodle's serialized SQL NULL, which shares the
 * grammar but is a field value, never a link.
 */
export function decodeBackupLink(token: string): BackupLink | undefined {
  const m = ONE_TOKEN.exec(token)
  if (!m) return undefined
  const code = m[1] ?? ''
  if (code === '' || code === 'NULL') return undefined
  // `*a*b` → ['', 'a', 'b']: the leading empty piece is the split artefact.
  const args = (m[2] ?? '').split('*').slice(1)
  const path = fill(templateFor(code), args)
  const cmid = Number(args[0])
  return isCmidCode(code) && Number.isSafeInteger(cmid) && cmid > 0
    ? { code, args, path, moduleId: cmid }
    : { code, args, path }
}

/**
 * Absolute URL of a decoded link on the site the backup came from, or
 * undefined when it cannot be built. `originalWwwroot` comes from the
 * backup and is therefore hostile: only http(s) is accepted, so a token
 * can never turn into a javascript:/data: link.
 */
export function backupLinkUrl(link: BackupLink, originalWwwroot: string): string | undefined {
  if (link.path === '') return undefined
  const root = originalWwwroot.trim()
  if (!/^https?:\/\/[^/?#\s]+/i.test(root)) return undefined
  // Trailing slashes are trimmed by scanning, not by /\/+$/: that pattern is
  // quadratic on a run of slashes, and this string comes out of the backup
  // (CodeQL js/polynomial-redos).
  let end = root.length
  while (end > 0 && root.charCodeAt(end - 1) === SLASH) end--
  return `${root.slice(0, end)}${link.path}`
}

/** '/' — compared by code unit so the trim above stays a linear scan. */
const SLASH = 47

function templateFor(code: string): string | undefined {
  const exact = RULES.get(code)
  if (exact !== undefined) return exact
  const view = MODULE_VIEW.exec(code)
  if (view?.[1]) return `/mod/${view[1].toLowerCase()}/view.php?id=$1`
  const index = MODULE_INDEX.exec(code)
  if (index?.[1]) return `/mod/${index[1].toLowerCase()}/index.php?id=$1`
  return undefined
}

function isCmidCode(code: string): boolean {
  return CMID_RULES.has(code) || (MODULE_VIEW.test(code) && !RULES.has(code))
}

/** Fills `$1`…`$n`; a missing argument voids the whole path. */
function fill(template: string | undefined, args: readonly string[]): string {
  if (template === undefined) return ''
  let complete = true
  const out = template.replace(/\$(\d)/g, (_whole, digit: string) => {
    const arg = args[Number(digit) - 1]
    if (arg === undefined || arg === '') {
      complete = false
      return ''
    }
    return encodeURIComponent(arg)
  })
  return complete ? out : ''
}
