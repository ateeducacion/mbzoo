import { describe, expect, test } from 'bun:test'
import { parseActivityGradesXml, parseGradebookXml } from '../src/moodle/grades-xml.ts'
import { parseGradingXml } from '../src/moodle/grading-xml.ts'

// Shapes verified against a Moodle 5.2.2 backup generated for this purpose and
// against SMR_SOR (REPO-004), whose gradebook has eight categories.
const ACTIVITY = `<?xml version="1.0"?>
<activity_gradebook>
  <grade_items>
    <grade_item id="4">
      <categoryid>1</categoryid>
      <itemname>Specimen assignment</itemname>
      <itemtype>mod</itemtype>
      <itemmodule>assign</itemmodule>
      <gradetype>1</gradetype>
      <grademax>100</grademax>
      <grademin>0</grademin>
      <gradepass>50</gradepass>
      <aggregationcoef2>0.5</aggregationcoef2>
      <hidden>0</hidden>
      <locked>0</locked>
      <sortorder>4</sortorder>
      <grade_grades>
        <grade_grade id="9"><userid>7</userid><rawgrade>88</rawgrade><itemname>LEAK</itemname></grade_grade>
      </grade_grades>
    </grade_item>
  </grade_items>
  <grade_letters>
  </grade_letters>
</activity_gradebook>`

describe('parseActivityGradesXml', () => {
  test('reads what the activity is worth and what passes', async () => {
    const [item] = await parseActivityGradesXml(ACTIVITY)
    expect(item?.name).toBe('Specimen assignment')
    expect(item?.kind).toBe('value')
    expect(item?.max).toBe(100)
    expect(item?.pass).toBe(50)
    expect(item?.weight).toBe(0.5)
    expect(item?.hidden).toBe(false)
  })

  // <grade_grades> is students' marks, gated behind userinfo. If it is ever
  // present its leaves must not be mistaken for the item's own.
  test("a student's mark never leaks into the item", async () => {
    const [item] = await parseActivityGradesXml(ACTIVITY)
    expect(item?.name).not.toBe('LEAK')
    expect(await parseActivityGradesXml(ACTIVITY)).toHaveLength(1)
  })

  test('grade types are named', async () => {
    const kindOf = async (gradetype: string): Promise<string | undefined> =>
      (
        await parseActivityGradesXml(
          ACTIVITY.replace('<gradetype>1</gradetype>', `<gradetype>${gradetype}</gradetype>`),
        )
      )[0]?.kind
    expect(await kindOf('0')).toBe('none')
    expect(await kindOf('2')).toBe('scale')
    expect(await kindOf('3')).toBe('text')
    expect(await kindOf('99')).toBe('unknown')
  })
})

describe('parseGradebookXml', () => {
  const BOOK = `<?xml version="1.0"?>
<gradebook>
  <grade_categories>
    <grade_category id="1"><parent>$@NULL@$</parent><depth>1</depth><fullname>?</fullname><aggregation>13</aggregation><keephigh>0</keephigh><droplow>0</droplow></grade_category>
    <grade_category id="2"><parent>1</parent><depth>2</depth><fullname>Coursework</fullname><aggregation>10</aggregation><keephigh>0</keephigh><droplow>1</droplow></grade_category>
  </grade_categories>
  <grade_items>
    <grade_item id="7"><categoryid>1</categoryid><itemname>Course total</itemname><itemtype>course</itemtype><gradetype>1</gradetype><grademax>100</grademax><sortorder>1</sortorder></grade_item>
  </grade_items>
  <grade_letters>
    <grade_letter id="1"><lowerboundary>90</lowerboundary><letter>A</letter></grade_letter>
  </grade_letters>
</gradebook>`

  test('reads the category tree with its aggregation', async () => {
    const book = await parseGradebookXml(BOOK)
    expect(book.categories).toHaveLength(2)
    expect(book.categories[0]?.aggregation).toBe('sum')
    expect(book.categories[1]?.name).toBe('Coursework')
    expect(book.categories[1]?.aggregation).toBe('weightedMean')
    expect(book.categories[1]?.dropLow).toBe(1)
  })

  // Moodle stores "?" as the implicit course category's name; printing it
  // verbatim would put a question mark on screen.
  test('the implicit course category has no name rather than "?"', async () => {
    const book = await parseGradebookXml(BOOK)
    expect(book.categories[0]?.name).toBe('')
  })

  test('reads items and letters', async () => {
    const book = await parseGradebookXml(BOOK)
    expect(book.items[0]?.itemType).toBe('course')
    expect(book.letters).toEqual([{ lowerBoundary: 90, letter: 'A' }])
  })
})

describe('parseGradingXml', () => {
  const RUBRIC = `<?xml version="1.0"?>
<areas>
  <area id="1">
    <areaname>submissions</areaname>
    <activemethod>rubric</activemethod>
    <definitions>
      <definition id="1">
        <method>rubric</method>
        <name>Report rubric</name>
        <description>&lt;p&gt;How it is assessed.&lt;/p&gt;</description>
        <plugin_gradingform_rubric_definition>
          <criteria>
            <criterion id="2">
              <sortorder>2</sortorder>
              <description>Evidence</description>
              <levels>
                <level id="4"><score>5</score><definition>Well cited</definition></level>
                <level id="3"><score>0</score><definition>None cited</definition></level>
              </levels>
            </criterion>
            <criterion id="1">
              <sortorder>1</sortorder>
              <description>Clarity</description>
              <levels>
                <level id="1"><score>0</score><definition>Hard to follow</definition></level>
              </levels>
            </criterion>
          </criteria>
        </plugin_gradingform_rubric_definition>
      </definition>
    </definitions>
  </area>
</areas>`

  test('reads the rubric, its criteria and their levels', async () => {
    const [area] = await parseGradingXml(RUBRIC)
    expect(area?.name).toBe('submissions')
    expect(area?.activeMethod).toBe('rubric')
    const def = area?.definitions[0]
    expect(def?.name).toBe('Report rubric')
    expect(def?.description).toContain('How it is assessed')
    expect(def?.criteria.map((c) => c.description)).toEqual(['Clarity', 'Evidence'])
  })

  test('levels read low to high, whatever order the file used', async () => {
    const [area] = await parseGradingXml(RUBRIC)
    const evidence = area?.definitions[0]?.criteria.find((c) => c.description === 'Evidence')
    expect(evidence?.levels.map((l) => l.score)).toEqual([0, 5])
  })

  // A level's own text is also called <definition>, which is what the whole
  // form element is called. Getting that wrong swallows the criteria.
  test("a level's definition does not close the form's definition", async () => {
    const [area] = await parseGradingXml(RUBRIC)
    expect(area?.definitions).toHaveLength(1)
    expect(area?.definitions[0]?.criteria).toHaveLength(2)
  })

  test('an area with no form parses to no definitions', async () => {
    const plain = `<?xml version="1.0"?>
<areas><area id="1"><areaname>submissions</areaname><activemethod>$@NULL@$</activemethod>
<definitions></definitions></area></areas>`
    const [area] = await parseGradingXml(plain)
    expect(area?.activeMethod).toBe('')
    expect(area?.definitions).toEqual([])
  })
})
