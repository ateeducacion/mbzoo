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
import { parseXmlEvents } from './xml.ts'

export interface QuizQuestion {
  readonly id: number
  readonly qtype: string
  readonly name: string
  readonly questionText: string
  readonly answers: QuizAnswer[]
}

export interface QuizAnswer {
  readonly text: string
  /** Moodle fraction: 1 = fully correct, 0 = neutral, negative = penalty. */
  readonly fraction: number
}

interface MutableQuestion {
  id: number
  qtype: string
  name: string
  questionText: string
  answers: Array<{ text: string; fraction: number }>
}

export async function parseQuestionsXml(xml: string): Promise<Map<number, QuizQuestion>> {
  const questions = new Map<number, QuizQuestion>()
  const path: string[] = []
  let text = ''
  let current: MutableQuestion | undefined
  let nameDone = false
  let questionTextDone = false

  const leafOf = (): string | undefined => path[path.length - 1]
  const parentOf = (): string | undefined => path[path.length - 2]

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      // Question entries live under <questions> (3.x) or directly under the
      // category (text-wrapper variant).
      if (
        ev.name === 'question' &&
        (leafOf() === 'questions' || leafOf() === 'question_category')
      ) {
        current = { id: Number.NaN, qtype: '', name: '', questionText: '', answers: [] }
        const idAttr = ev.attributes['id']
        if (current && idAttr !== undefined) current.id = Number(idAttr)
      }
      if (current && ev.name === 'answer' && leafOf() === 'answers') {
        current.answers.push({ text: '', fraction: 0 })
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const value = text.trim()
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
      const n = Number(text.trim())
      if (Number.isFinite(n)) ids.push(n)
    }
    path.pop()
    text = ''
  })
  return ids
}
