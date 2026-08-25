/**
 * Parsers for quiz inspection (read-only; ADR-0013 — never a faithful
 * Moodle Question Engine runtime, prompt §6).
 *
 * questions.xml shapes observed:
 * - Moodle 3.x (REPO-004, SMR_SEGI/SMR_SOR): root <question_categories>,
 *   <question id="…"> with plain-text <name>/<questiontext> leaves and
 *   <answertext>/<fraction> answers.
 * - Variant with <name><text>… wrappers also accepted.
 */
import { leafValue, parseXmlEvents } from './xml.ts'

export interface QuizQuestion {
  readonly id: number
  readonly qtype: string
  readonly name: string
  readonly questionText: string
  readonly answers: QuizAnswer[]
  /** Stem/response pairs of a `match` question; empty for every other type. */
  readonly matches: QuizMatchPair[]
  /**
   * Bank category this question lives in. A `random` question draws from
   * its own category at attempt time, so this is what turns a random slot
   * into the pool it will pick from — the pool ships in the same backup.
   */
  readonly categoryId: number
  readonly categoryName: string
}

export interface QuizAnswer {
  readonly text: string
  /** Moodle fraction: 1 = fully correct, 0 = neutral, negative = penalty. */
  readonly fraction: number
}

/**
 * One pair of a `match` question. Its stems and responses live in
 * <plugin_qtype_match_question><matches>, not in <answers>, so a parser that
 * only reads <answers> renders the stem with nothing under it.
 */
export interface QuizMatchPair {
  /** The stem shown to the student. */
  readonly stem: string
  /** The response it must be matched with. */
  readonly response: string
}

interface MutableQuestion {
  id: number
  qtype: string
  name: string
  questionText: string
  answers: Array<{ text: string; fraction: number }>
  matches: Array<{ stem: string; response: string }>
  categoryId: number
  categoryName: string
}

/**
 * Questions a `random` slot may draw, i.e. the rest of its bank category.
 *
 * Returns an empty array for a non-random question, and for a random one
 * whose category carries nothing else. Callers must not present an empty
 * result as "the questions are missing from the backup": it means this
 * category had no drawable questions, which is a different claim.
 */
export function randomQuestionPool(
  questions: ReadonlyMap<number, QuizQuestion>,
  questionId: number,
): QuizQuestion[] {
  const slot = questions.get(questionId)
  if (!slot || slot.qtype !== 'random') return []
  return [...questions.values()].filter(
    (q) => q.categoryId === slot.categoryId && q.qtype !== 'random',
  )
}

/**
 * What a quiz's slots actually offer a reader, once random slots are
 * expanded into the pools they draw from.
 *
 * A quiz built entirely from random slots serializes as N identical
 * placeholders. Showing those N placeholders tells the reader nothing: the
 * questions they can be asked are the pool, and the pool ships in the same
 * backup. So the plan lists the pool once and reports how many slots draw
 * from it, which is the fact the placeholders were standing in for.
 */
export interface QuizSlotPlan {
  /**
   * Questions to show, in slot order, with each random slot replaced by its
   * pool. Deduplicated: several slots normally draw from the same category
   * and the reader should meet each question once.
   */
  readonly questions: QuizQuestion[]
  /** Slots that always ask the same question. */
  readonly fixedSlots: number
  /** Slots filled by drawing from a bank category at attempt time. */
  readonly randomSlots: number
  /** Distinct questions those random slots can draw, across all categories. */
  readonly poolSize: number
  /** Ids of the questions contributed by a pool rather than by a fixed slot. */
  readonly drawnIds: ReadonlySet<number>
}

/**
 * Resolves a quiz's slot list into the questions a reader can inspect.
 *
 * A random slot whose category holds nothing drawable keeps its placeholder:
 * dropping it would hide a slot that exists, and the placeholder still names
 * the category the questions were expected in.
 */
export function resolveQuizSlots(
  questions: ReadonlyMap<number, QuizQuestion>,
  slotIds: readonly number[],
): QuizSlotPlan {
  const shown: QuizQuestion[] = []
  const seen = new Set<number>()
  const drawnIds = new Set<number>()
  let fixedSlots = 0
  let randomSlots = 0

  const push = (q: QuizQuestion): void => {
    if (seen.has(q.id)) return
    seen.add(q.id)
    shown.push(q)
  }

  for (const id of slotIds) {
    const slot = questions.get(id)
    if (!slot) continue
    if (slot.qtype !== 'random') {
      fixedSlots++
      push(slot)
      continue
    }
    randomSlots++
    const pool = randomQuestionPool(questions, id)
    if (pool.length === 0) {
      push(slot)
      continue
    }
    for (const candidate of pool) {
      drawnIds.add(candidate.id)
      push(candidate)
    }
  }

  return { questions: shown, fixedSlots, randomSlots, poolSize: drawnIds.size, drawnIds }
}

export async function parseQuestionsXml(xml: string): Promise<Map<number, QuizQuestion>> {
  const questions = new Map<number, QuizQuestion>()
  const path: string[] = []
  let text = ''
  let current: MutableQuestion | undefined
  let nameDone = false
  let questionTextDone = false
  // Category context: <name> closes before the questions it contains.
  let categoryId = Number.NaN
  let categoryName = ''

  const leafOf = (): string | undefined => path[path.length - 1]
  const parentOf = (): string | undefined => path[path.length - 2]

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'question_category') {
        categoryId = Number(ev.attributes.id ?? Number.NaN)
        categoryName = ''
      }
      // Question entries live under <questions> (3.x) or directly under the
      // category (text-wrapper variant).
      if (
        ev.name === 'question' &&
        (leafOf() === 'questions' || leafOf() === 'question_category')
      ) {
        current = {
          id: Number.NaN,
          qtype: '',
          name: '',
          questionText: '',
          answers: [],
          matches: [],
          categoryId,
          categoryName,
        }
        nameDone = false
        questionTextDone = false
        const idAttr = ev.attributes.id
        if (current && idAttr !== undefined) current.id = Number(idAttr)
      }
      if (current && ev.name === 'answer' && leafOf() === 'answers') {
        current.answers.push({ text: '', fraction: 0 })
      }
      if (current && ev.name === 'match' && leafOf() === 'matches') {
        current.matches.push({ stem: '', response: '' })
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const value = leafValue(text)
    if (!current && leafOf() === 'name' && parentOf() === 'question_category') {
      categoryName = value
    }
    if (current) {
      const leaf = leafOf()
      const parent = parentOf()
      if (leaf === 'question' && (parent === 'questions' || parent === 'question_category')) {
        if (Number.isFinite(current.id)) questions.set(current.id, finalize(current))
        current = undefined
      } else if (leaf === 'qtype' && parent === 'question') {
        current.qtype = value
      } else if (leaf === 'name' && parent === 'question' && !nameDone) {
        current.name = value
        nameDone = true
      } else if (leaf === 'text' && parent === 'name' && !nameDone) {
        current.name = value
        nameDone = true
      } else if (leaf === 'questiontext' && parent === 'question' && !questionTextDone) {
        current.questionText = value
        questionTextDone = true
      } else if (leaf === 'text' && parent === 'questiontext' && !questionTextDone) {
        current.questionText = value
        questionTextDone = true
      } else if (leaf === 'answertext' && parent === 'answer') {
        const a = current.answers[current.answers.length - 1]
        if (a) a.text = value
      } else if (leaf === 'text' && parent === 'answer') {
        const a = current.answers[current.answers.length - 1]
        if (a && a.text === '') a.text = value
      } else if (leaf === 'questiontext' && parent === 'match') {
        const m = current.matches[current.matches.length - 1]
        if (m) m.stem = value
      } else if (leaf === 'answertext' && parent === 'match') {
        const m = current.matches[current.matches.length - 1]
        if (m) m.response = value
      } else if (leaf === 'fraction' && parent === 'answer') {
        const a = current.answers[current.answers.length - 1]
        const n = Number(value)
        if (a && Number.isFinite(n)) a.fraction = n
      }
    }

    path.pop()
    text = ''
  })
  return questions
}

function finalize(c: MutableQuestion): QuizQuestion {
  return {
    id: c.id,
    qtype: c.qtype,
    name: c.name,
    questionText: c.questionText,
    answers: c.answers,
    matches: c.matches,
    categoryId: c.categoryId,
    categoryName: c.categoryName,
  }
}

/** Extracts the question ids referenced by a quiz activity, in slot order. */
export async function parseQuizQuestionIds(xml: string): Promise<number[]> {
  const ids: number[] = []
  const path: string[] = []
  let text = ''
  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    const p = path.join('/')
    if (
      (ev.name === 'questionid' || ev.name === 'questionbankentryid') &&
      (p.includes('question_instance') || p.includes('question_reference'))
    ) {
      const n = Number(leafValue(text))
      if (Number.isFinite(n)) ids.push(n)
    }
    path.pop()
    text = ''
  })
  return ids
}
