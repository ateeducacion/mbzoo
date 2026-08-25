import { describe, expect, test } from 'bun:test'
import { parseQuestionsXml, parseQuizQuestionIds } from '../src/moodle/questions-xml.ts'

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
