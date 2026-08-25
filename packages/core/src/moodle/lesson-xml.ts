/**
 * Parser for mod_lesson's lesson.xml (read-only inspection, ADR-0013).
 *
 * A lesson is a branching sequence of pages. Unlike a forum or a wiki, all
 * of it travels in a content-only backup: `backup_lesson_stepslib.php` sets
 * the sources for <page> and <answer> unconditionally and gates only
 * attempts, branches, grades and timers behind `userinfo` (REPO-005, read
 * 2026-08-25). So the whole authored lesson — every page's HTML and every
 * answer's jump target — is readable from any course backup.
 *
 * Page order is a linked list: each page names its `prevpageid` and
 * `nextpageid`, and the first page is the one whose `prevpageid` is 0.
 */
import { leafValue, parseXmlEvents } from './xml.ts'

/**
 * Lesson page kinds, from the `define("LESSON_PAGE_…")` constants in
 * mod/lesson/pagetypes/*.php (REPO-005). A content page is a "branch table";
 * everything else is a question.
 */
const PAGE_TYPES: Record<number, LessonPageKind> = {
  1: 'shortanswer',
  2: 'truefalse',
  3: 'multichoice',
  5: 'matching',
  8: 'numerical',
  10: 'essay',
  20: 'content',
  21: 'endofbranch',
  30: 'cluster',
  31: 'endofcluster',
}

export type LessonPageKind =
  | 'shortanswer'
  | 'truefalse'
  | 'multichoice'
  | 'matching'
  | 'numerical'
  | 'essay'
  | 'content'
  | 'endofbranch'
  | 'cluster'
  | 'endofcluster'
  | 'unknown'

/**
 * Special `jumpto` targets an answer can carry.
 *
 * This is exactly the set Moodle's own `lesson_page::get_jump_name()` tests
 * (mod/lesson/locallib.php, REPO-005); everything else is looked up as a page
 * id. That distinction matters: `LESSON_UNSEENPAGE` (1) and
 * `LESSON_UNANSWEREDPAGE` (2) are also defined in that file, but they belong
 * to the lesson-level `nextpagedefault` setting and never to an answer — and
 * because page ids are small positive integers, treating them as jump
 * constants silently renames a jump to page 1 or 2. A real Moodle 5.2 backup
 * caught exactly that.
 */
const JUMPS: Record<number, LessonJumpKind> = {
  0: 'thisPage',
  [-1]: 'nextPage',
  [-9]: 'endOfLesson',
  [-40]: 'previousPage',
  [-50]: 'unseenBranchPage',
  [-60]: 'randomPage',
  [-70]: 'randomBranch',
  [-80]: 'clusterJump',
  [-99]: 'undefined',
}

export type LessonJumpKind =
  | 'thisPage'
  | 'nextPage'
  | 'endOfLesson'
  | 'previousPage'
  | 'unseenBranchPage'
  | 'randomPage'
  | 'randomBranch'
  | 'clusterJump'
  | 'undefined'
  | 'page'

export interface LessonJump {
  readonly kind: LessonJumpKind
  /** Target page id when `kind` is 'page'; NaN otherwise. */
  readonly pageId: number
}

export interface LessonAnswer {
  /**
   * Answer id — the itemid of its `mod_lesson/page_answers` and
   * `page_responses` files (REPO-005).
   */
  readonly id: number
  /** Answer text on a question page; the button label on a content page. */
  readonly text: string
  /** Feedback shown for this answer. */
  readonly response: string
  readonly jump: LessonJump
  /** Moodle stores 1 for a correct answer on most question types. */
  readonly grade: number
}

export interface LessonPage {
  readonly id: number
  readonly title: string
  /** Authored page body, still unsanitized. */
  readonly contents: string
  readonly kind: LessonPageKind
  readonly answers: LessonAnswer[]
  readonly prevPageId: number
  readonly nextPageId: number
}

export interface MoodleLesson {
  /** Pages in the order a reader walks them, first page first. */
  readonly pages: LessonPage[]
}

interface MutablePage {
  id: number
  title: string
  contents: string
  qtype: number
  answers: LessonAnswer[]
  prevPageId: number
  nextPageId: number
}

export async function parseLessonXml(xml: string): Promise<MoodleLesson> {
  const pages: MutablePage[] = []
  const path: string[] = []
  let text = ''
  let page: MutablePage | undefined
  let answer:
    | { id: number; text: string; response: string; jumpto: number; grade: number }
    | undefined

  const leafOf = (): string | undefined => path[path.length - 1]
  const parentOf = (): string | undefined => path[path.length - 2]

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'page' && leafOf() === 'pages') {
        page = {
          id: Number(ev.attributes.id ?? Number.NaN),
          title: '',
          contents: '',
          qtype: Number.NaN,
          answers: [],
          prevPageId: Number.NaN,
          nextPageId: Number.NaN,
        }
      }
      if (page && ev.name === 'answer' && leafOf() === 'answers') {
        answer = {
          id: Number(ev.attributes.id ?? Number.NaN),
          text: '',
          response: '',
          jumpto: Number.NaN,
          grade: 0,
        }
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const value = leafValue(text)
    const leaf = leafOf()
    const parent = parentOf()

    if (answer && page) {
      if (leaf === 'answer' && parent === 'answers') {
        page.answers.push({
          id: answer.id,
          text: answer.text,
          response: answer.response,
          jump: jumpOf(answer.jumpto),
          grade: answer.grade,
        })
        answer = undefined
      } else if (parent === 'answer') {
        if (leaf === 'answer_text') answer.text = value
        else if (leaf === 'response') answer.response = value
        else if (leaf === 'jumpto') answer.jumpto = Number(value)
        else if (leaf === 'grade') answer.grade = Number(value) || 0
      }
    } else if (page) {
      if (leaf === 'page' && parent === 'pages') {
        pages.push(page)
        page = undefined
      } else if (parent === 'page') {
        if (leaf === 'title') page.title = value
        else if (leaf === 'contents') page.contents = value
        else if (leaf === 'qtype') page.qtype = Number(value)
        else if (leaf === 'prevpageid') page.prevPageId = Number(value)
        else if (leaf === 'nextpageid') page.nextPageId = Number(value)
      }
    }

    path.pop()
    text = ''
  })

  return { pages: order(pages).map(finalize) }
}

/**
 * Walks the prevpageid/nextpageid chain from the first page.
 *
 * Backups are written in `prevpageid ASC` order, which is not reading order,
 * and a lesson edited over years can carry a page whose chain is broken.
 * Anything the walk does not reach is appended in document order rather than
 * dropped: an unreachable page is still authored content.
 */
function order(pages: MutablePage[]): MutablePage[] {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const out: MutablePage[] = []
  const seen = new Set<number>()
  let current = pages.find((p) => p.prevPageId === 0)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    out.push(current)
    current = byId.get(current.nextPageId)
  }
  for (const p of pages) {
    if (!seen.has(p.id)) out.push(p)
  }
  return out
}

function finalize(p: MutablePage): LessonPage {
  return {
    id: p.id,
    title: p.title,
    contents: p.contents,
    kind: PAGE_TYPES[p.qtype] ?? 'unknown',
    answers: p.answers,
    prevPageId: p.prevPageId,
    nextPageId: p.nextPageId,
  }
}

function jumpOf(jumpto: number): LessonJump {
  if (!Number.isFinite(jumpto)) return { kind: 'undefined', pageId: Number.NaN }
  const kind = JUMPS[jumpto]
  if (kind) return { kind, pageId: Number.NaN }
  return { kind: 'page', pageId: jumpto }
}
