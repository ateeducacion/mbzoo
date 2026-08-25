import { describe, expect, test } from 'bun:test'
import { parseFeedbackXml } from '../src/moodle/feedback-xml.ts'

// Shape of SMR_SOR_01_09 "Encuesta sobre la asignatura" (REPO-004): labels
// carrying HTML, multichoice items whose options are packed into
// `presentation`, a page break, and a free-text item.
const FEEDBACK = `<?xml version="1.0"?>
<activity id="377" moduleid="57633" modulename="feedback" contextid="100339">
  <feedback id="377">
    <name>Encuesta</name>
    <anonymous>1</anonymous>
    <autonumbering>1</autonumbering>
    <page_after_submit>&lt;p&gt;Gracias&lt;/p&gt;</page_after_submit>
    <items>
      <item id="7008">
        <name>label</name>
        <label></label>
        <presentation>&lt;p&gt;&lt;strong&gt;Intro&lt;/strong&gt;&lt;/p&gt;</presentation>
        <typ>label</typ>
        <hasvalue>0</hasvalue>
        <position>1</position>
        <required>0</required>
      </item>
      <item id="7010">
        <name>¿Has leído la guía?</name>
        <label>Pregunta1</label>
        <presentation>r&gt;&gt;&gt;&gt;&gt;Sí|No&lt;&lt;&lt;&lt;&lt;1</presentation>
        <typ>multichoice</typ>
        <hasvalue>1</hasvalue>
        <position>3</position>
        <required>1</required>
      </item>
      <item id="7009">
        <name>pagebreak</name>
        <presentation></presentation>
        <typ>pagebreak</typ>
        <hasvalue>0</hasvalue>
        <position>2</position>
        <required>0</required>
      </item>
      <item id="7011">
        <name>¿Por qué no?</name>
        <presentation>30|5</presentation>
        <typ>textarea</typ>
        <hasvalue>1</hasvalue>
        <position>4</position>
        <required>0</required>
      </item>
    </items>
  </feedback>
</activity>`

describe('parseFeedbackXml', () => {
  test('reads items in author order, not document order', async () => {
    const fb = await parseFeedbackXml(FEEDBACK)
    expect(fb.items.map((i) => i.position)).toEqual([1, 2, 3, 4])
    expect(fb.items.map((i) => i.type)).toEqual(['label', 'pagebreak', 'multichoice', 'textarea'])
  })

  test('carries the activity flags a renderer needs', async () => {
    const fb = await parseFeedbackXml(FEEDBACK)
    expect(fb.anonymous).toBe(true)
    expect(fb.autoNumbering).toBe(true)
    expect(fb.pageAfterSubmit).toContain('Gracias')
  })

  test('a label keeps its HTML body and asks nothing', async () => {
    const fb = await parseFeedbackXml(FEEDBACK)
    const label = fb.items[0]
    expect(label?.html).toContain('<strong>Intro</strong>')
    expect(label?.text).toBe('')
    expect(label?.hasValue).toBe(false)
  })

  // mod/feedback/item/multichoice/lib.php (REPO-005): the options are packed
  // as <subtype>>>>>><values joined by |><<<<<<horizontal>.
  test('unpacks multichoice options and their input style', async () => {
    const fb = await parseFeedbackXml(FEEDBACK)
    const q = fb.items.find((i) => i.type === 'multichoice')
    expect(q?.choices).toEqual(['Sí', 'No'])
    expect(q?.choiceStyle).toBe('radio')
    expect(q?.required).toBe(true)
    expect(q?.label).toBe('Pregunta1')
    // The horizontal flag is layout, and must not leak in as an option.
    expect(q?.choices).not.toContain('1')
  })

  test('checkbox and dropdown subtypes are recognised', async () => {
    const build = (presentation: string): string =>
      FEEDBACK.replace(
        'r&gt;&gt;&gt;&gt;&gt;Sí|No&lt;&lt;&lt;&lt;&lt;1',
        presentation.replace(/>/g, '&gt;').replace(/</g, '&lt;'),
      )
    const checkbox = await parseFeedbackXml(build('c>>>>>A|B<<<<<0'))
    expect(checkbox.items.find((i) => i.type === 'multichoice')?.choiceStyle).toBe('checkbox')
    // A dropdown carries no adjustment tail, so nothing may be trimmed off.
    const dropdown = await parseFeedbackXml(build('d>>>>>A|B'))
    const item = dropdown.items.find((i) => i.type === 'multichoice')
    expect(item?.choiceStyle).toBe('dropdown')
    expect(item?.choices).toEqual(['A', 'B'])
  })

  test('multichoicerated drops the stored weight from each option', async () => {
    const rated = await parseFeedbackXml(
      FEEDBACK.replace('<typ>multichoice</typ>', '<typ>multichoicerated</typ>').replace(
        'r&gt;&gt;&gt;&gt;&gt;Sí|No&lt;&lt;&lt;&lt;&lt;1',
        'r&gt;&gt;&gt;&gt;&gt;1####Sí|0####No&lt;&lt;&lt;&lt;&lt;1',
      ),
    )
    expect(rated.items.find((i) => i.type === 'multichoicerated')?.choices).toEqual(['Sí', 'No'])
  })

  test('a non-multichoice presentation is layout, never rendered as options', async () => {
    const fb = await parseFeedbackXml(FEEDBACK)
    // "30|5" is width|height, not two choices.
    expect(fb.items.find((i) => i.type === 'textarea')?.choices).toEqual([])
  })

  test('an activity with no items parses to an empty questionnaire', async () => {
    const empty = FEEDBACK.replace(/<items>[\s\S]*<\/items>/, '<items></items>')
    expect((await parseFeedbackXml(empty)).items).toEqual([])
  })
})
