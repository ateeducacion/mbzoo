import { describe, expect, test } from 'bun:test'
import {
  parseQuestionsXml,
  parseQuizQuestionIds,
  randomQuestionPool,
  resolveQuizSlots,
} from '../src/moodle/questions-xml.ts'

// Moodle 3.x shape (verified on SMR_SEGI/SMR_SOR, REPO-004).
const V3 = `<?xml version="1.0"?>
<question_categories>
  <question_category id="1">
    <name>Default</name>
    <questions>
      <question id="50">
        <qtype>multichoice</qtype>
        <name>Capital of France</name>
        <questiontext>&lt;p&gt;What is the capital of &lt;b&gt;France&lt;/b&gt;?&lt;/p&gt;</questiontext>
        <answers>
          <answer id="1"><answertext>Paris</answertext><fraction>1.0000000</fraction></answer>
          <answer id="2"><answertext>Madrid</answertext><fraction>0.0000000</fraction></answer>
          <answer id="3"><answertext>Rome</answertext><fraction>-0.3333333</fraction></answer>
        </answers>
      </question>
      <question id="51">
        <qtype>truefalse</qtype>
        <name>TF question</name>
        <questiontext>&lt;p&gt;Is this a test?&lt;/p&gt;</questiontext>
      </question>
    </questions>
  </question_category>
</question_categories>`

// Text-wrapper variant.
const WRAPPED = `<?xml version="1.0"?>
<question_bank>
  <question_category id="1">
    <question id="70">
      <qtype>shortanswer</qtype>
      <name><text>Wrapped</text></name>
      <questiontext><text>&lt;p&gt;Wrapped body&lt;/p&gt;</text></questiontext>
      <plugin_qtype_shortanswer_question>
        <answers>
          <answer id="9"><text>paris</text><fraction>1</fraction></answer>
        </answers>
      </plugin_qtype_shortanswer_question>
    </question>
  </question_category>
</question_bank>`

describe('parseQuestionsXml', () => {
  test('parses Moodle 3.x questions with answers and fractions', async () => {
    const q = await parseQuestionsXml(V3)
    expect(q.size).toBe(2)
    const mc = q.get(50)
    expect(mc?.qtype).toBe('multichoice')
    expect(mc?.name).toBe('Capital of France')
    expect(mc?.questionText).toContain('capital of')
    expect(mc?.answers).toHaveLength(3)
    expect(mc?.answers[0]?.text).toBe('Paris')
    expect(mc?.answers[0]?.fraction).toBe(1)
    expect(mc?.answers[2]?.fraction).toBeLessThan(0)
  })

  test('parses the text-wrapper variant', async () => {
    const q = await parseQuestionsXml(WRAPPED)
    const sa = q.get(70)
    expect(sa?.name).toBe('Wrapped')
    expect(sa?.questionText).toContain('Wrapped body')
    expect(sa?.answers[0]?.text).toBe('paris')
  })
})

describe('parseQuizQuestionIds', () => {
  test('extracts referenced question ids in slot order', async () => {
    const quiz = `<quiz>
      <question_instances>
        <question_instance><slot>1</slot><questionid>50</questionid></question_instance>
        <question_instance><slot>2</slot><questionid>51</questionid></question_instance>
      </question_instances>
    </quiz>`
    expect(await parseQuizQuestionIds(quiz)).toEqual([50, 51])
  })
})

describe('random questions (regression: SMR_SEGI exam)', () => {
  test('flags are reset between questions so all names/texts are captured', async () => {
    const two = `<?xml version="1.0"?>
    <question_categories><question_category id="1"><questions>
      <question id="1"><qtype>random</qtype><name>Random A</name><questiontext>1</questiontext></question>
      <question id="2"><qtype>multichoice</qtype><name>Real Q</name><questiontext>&lt;p&gt;Body&lt;/p&gt;</questiontext></question>
    </questions></question_category></question_categories>`
    const q = await parseQuestionsXml(two)
    expect(q.get(1)?.name).toBe('Random A')
    expect(q.get(2)?.name).toBe('Real Q')
    expect(q.get(2)?.questionText).toContain('Body')
  })
})

// A random slot is not a missing question: it draws from the category it
// lives in, whose pool travels in the same backup (observed in real
// SMR_SR / SMR_MME exports).
const RANDOM = `<?xml version="1.0"?>
<question_categories>
  <question_category id="6980">
    <name>Examen para MME01</name>
    <questions>
      <question id="900">
        <qtype>random</qtype>
        <name>Organizado al azar (Examen para MME01)</name>
        <questiontext>1</questiontext>
      </question>
      <question id="901">
        <qtype>multichoice</qtype>
        <name>Pool question A</name>
        <questiontext>Body A</questiontext>
        <answers>
          <answer id="1"><answertext>Si</answertext><fraction>1.0000000</fraction></answer>
        </answers>
      </question>
      <question id="902">
        <qtype>truefalse</qtype>
        <name>Pool question B</name>
        <questiontext>Body B</questiontext>
      </question>
    </questions>
  </question_category>
  <question_category id="7000">
    <name>Otra categoria</name>
    <questions>
      <question id="910">
        <qtype>multichoice</qtype>
        <name>Unrelated</name>
        <questiontext>Body C</questiontext>
      </question>
    </questions>
  </question_category>
</question_categories>`

describe('question categories', () => {
  test('records the category each question belongs to', async () => {
    const q = await parseQuestionsXml(RANDOM)
    expect(q.get(901)?.categoryId).toBe(6980)
    expect(q.get(901)?.categoryName).toBe('Examen para MME01')
    expect(q.get(910)?.categoryId).toBe(7000)
    expect(q.get(910)?.categoryName).toBe('Otra categoria')
  })

  test('resolves a random slot to the pool it draws from', async () => {
    const q = await parseQuestionsXml(RANDOM)
    const pool = randomQuestionPool(q, 900)

    expect(pool.map((p) => p.id).sort()).toEqual([901, 902])
    // The random placeholder itself is never part of its own pool.
    expect(pool.some((p) => p.qtype === 'random')).toBe(false)
    // Questions from other categories stay out.
    expect(pool.some((p) => p.id === 910)).toBe(false)
  })

  test('returns an empty pool for a question that is not random', async () => {
    const q = await parseQuestionsXml(RANDOM)
    expect(randomQuestionPool(q, 901)).toEqual([])
  })

  test('returns an empty pool when the category holds nothing else', async () => {
    const only = `<?xml version="1.0"?>
<question_categories>
  <question_category id="1">
    <name>Empty</name>
    <questions>
      <question id="5"><qtype>random</qtype><name>r</name><questiontext>1</questiontext></question>
    </questions>
  </question_category>
</question_categories>`
    const q = await parseQuestionsXml(only)
    expect(randomQuestionPool(q, 5)).toEqual([])
  })
})

// Real exams draw every slot at random: SMR_SEGI "Examen (SEGI01)" is ten
// random slots over a 30-question category, SMR_SOR "Examen para SOR01"
// twenty over thirty (REPO-004 corpus, inspected 2026-08-25).
describe('resolveQuizSlots', () => {
  test('expands random slots into the pool, once, and counts the draw', async () => {
    const bank = await parseQuestionsXml(RANDOM)
    // Three slots, all the same random placeholder: one attempt asks three.
    const plan = resolveQuizSlots(bank, [900, 900, 900])

    expect(plan.randomSlots).toBe(3)
    expect(plan.fixedSlots).toBe(0)
    expect(plan.poolSize).toBe(2)
    expect(plan.questions.map((q) => q.id)).toEqual([901, 902])
    expect(plan.drawnIds.has(901)).toBe(true)
  })

  test('keeps fixed slots in slot order and marks only pool questions as drawn', async () => {
    const bank = await parseQuestionsXml(RANDOM)
    const plan = resolveQuizSlots(bank, [910, 900])

    expect(plan.fixedSlots).toBe(1)
    expect(plan.randomSlots).toBe(1)
    expect(plan.questions.map((q) => q.id)).toEqual([910, 901, 902])
    expect(plan.drawnIds.has(910)).toBe(false)
    expect(plan.poolSize).toBe(2)
  })

  test('a fixed slot that is also in the pool is shown once', async () => {
    const bank = await parseQuestionsXml(RANDOM)
    const plan = resolveQuizSlots(bank, [901, 900])

    expect(plan.questions.map((q) => q.id)).toEqual([901, 902])
    expect(plan.fixedSlots).toBe(1)
  })

  test('a random slot with nothing to draw keeps its placeholder', async () => {
    const empty = `<?xml version="1.0"?>
<question_categories>
  <question_category id="1">
    <name>Empty</name>
    <questions>
      <question id="5"><qtype>random</qtype><name>r</name><questiontext>1</questiontext></question>
    </questions>
  </question_category>
</question_categories>`
    const bank = await parseQuestionsXml(empty)
    const plan = resolveQuizSlots(bank, [5])

    expect(plan.questions.map((q) => q.id)).toEqual([5])
    expect(plan.randomSlots).toBe(1)
    expect(plan.poolSize).toBe(0)
  })

  test('slots missing from the bank are skipped, not rendered as blanks', async () => {
    const bank = await parseQuestionsXml(RANDOM)
    const plan = resolveQuizSlots(bank, [4242, 901])

    expect(plan.questions.map((q) => q.id)).toEqual([901])
    expect(plan.fixedSlots).toBe(1)
  })
})

// A match question keeps its pairs in <plugin_qtype_match_question>, not in
// <answers> — parsing only <answers> renders the stem with nothing under it
// (SMR_SOR "Relaciona:", REPO-004).
describe('match questions', () => {
  const MATCH = `<?xml version="1.0"?>
<question_categories>
  <question_category id="1">
    <name>Bank</name>
    <questions>
      <question id="91205">
        <qtype>match</qtype>
        <name>Relaciona:</name>
        <questiontext>Relaciona:</questiontext>
        <plugin_qtype_match_question>
          <matchoptions id="2712"><shuffleanswers>1</shuffleanswers></matchoptions>
          <matches>
            <match id="13530">
              <questiontext>aragorn@gondor.tm</questiontext>
              <answertext>Usuario de AD.</answertext>
            </match>
            <match id="13531">
              <questiontext>aragorn.gondor.tm</questiontext>
              <answertext>Equipo de AD.</answertext>
            </match>
          </matches>
        </plugin_qtype_match_question>
      </question>
    </questions>
  </question_category>
</question_categories>`

  test('reads the stem/response pairs', async () => {
    const q = (await parseQuestionsXml(MATCH)).get(91205)
    expect(q?.matches).toEqual([
      { stem: 'aragorn@gondor.tm', response: 'Usuario de AD.' },
      { stem: 'aragorn.gondor.tm', response: 'Equipo de AD.' },
    ])
  })

  test("a match's inner questiontext does not overwrite the question's own", async () => {
    const q = (await parseQuestionsXml(MATCH)).get(91205)
    expect(q?.questionText).toBe('Relaciona:')
  })

  test('questions of other types carry no pairs', async () => {
    const q = await parseQuestionsXml(V3)
    expect(q.get(50)?.matches).toEqual([])
  })
})
