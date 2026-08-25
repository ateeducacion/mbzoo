/**
 * Parser for `activities/<mod>_<cmid>/grading.xml` — advanced grading forms
 * (read-only inspection, ADR-0013).
 *
 * This is where a rubric or a marking guide lives. It is authored content and
 * travels without user data: the criteria, the levels and their scores are
 * often the clearest statement of what a task is actually assessed on, and
 * nothing else in the backup says it.
 *
 * Shape verified against a Moodle 5.2.2 backup carrying a real rubric:
 *   <areas><area id><areaname>submissions</areaname><activemethod>rubric</…>
 *     <definitions><definition id><method>rubric</method><name>…</name>
 *       <plugin_gradingform_rubric_definition><criteria><criterion id>
 *         <description>…</description><levels><level id><score>…<definition>
 */
import { leafValue, parseXmlEvents } from './xml.ts'

export interface RubricLevel {
  readonly score: number
  /** What earns this level; authored text, still unsanitized. */
  readonly definition: string
}

export interface RubricCriterion {
  /** What is being judged; authored text, still unsanitized. */
  readonly description: string
  readonly levels: RubricLevel[]
  readonly sortOrder: number
}

export interface GradingDefinition {
  /** Grading method: 'rubric', 'guide', or a third-party plugin's name. */
  readonly method: string
  readonly name: string
  /** Authored description, still unsanitized. */
  readonly description: string
  /**
   * Criteria and levels, for methods whose shape MBZoo reads. Empty for a
   * method it does not — which is not the same as a form with no criteria,
   * so callers should say "not shown" rather than "none".
   */
  readonly criteria: RubricCriterion[]
}

export interface GradingArea {
  /** Which part of the activity this grades, e.g. "submissions". */
  readonly name: string
  /** The method actually in use; '' when the author left the area plain. */
  readonly activeMethod: string
  readonly definitions: GradingDefinition[]
}

interface MutableDefinition {
  method: string
  name: string
  description: string
  criteria: Array<{ description: string; sortOrder: number; levels: RubricLevel[] }>
}

export async function parseGradingXml(xml: string): Promise<GradingArea[]> {
  const areas: GradingArea[] = []
  const path: string[] = []
  let text = ''
  let area: { name: string; activeMethod: string; definitions: GradingDefinition[] } | undefined
  let definition: MutableDefinition | undefined
  let criterion: { description: string; sortOrder: number; levels: RubricLevel[] } | undefined
  let level: { score: number; definition: string } | undefined

  const leafOf = (): string | undefined => path[path.length - 1]
  const parentOf = (): string | undefined => path[path.length - 2]

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'area' && leafOf() === 'areas') {
        area = { name: '', activeMethod: '', definitions: [] }
      } else if (ev.name === 'definition' && leafOf() === 'definitions') {
        definition = { method: '', name: '', description: '', criteria: [] }
      } else if (ev.name === 'criterion' && leafOf() === 'criteria') {
        criterion = { description: '', sortOrder: Number.NaN, levels: [] }
      } else if (ev.name === 'level' && leafOf() === 'levels') {
        level = { score: Number.NaN, definition: '' }
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

    if (level && criterion) {
      if (leaf === 'level') {
        criterion.levels.push({ score: level.score, definition: level.definition })
        level = undefined
      } else if (parent === 'level') {
        if (leaf === 'score') level.score = Number(value)
        // A level's own text is <definition>, which collides with the
        // <definition> element wrapping the whole form — hence the parent
        // check on every leaf here.
        else if (leaf === 'definition') level.definition = value
      }
    } else if (criterion && definition) {
      if (leaf === 'criterion') {
        definition.criteria.push(criterion)
        criterion = undefined
      } else if (parent === 'criterion') {
        if (leaf === 'description') criterion.description = value
        else if (leaf === 'sortorder') criterion.sortOrder = Number(value)
      }
    } else if (definition && area) {
      if (leaf === 'definition' && parent === 'definitions') {
        area.definitions.push(finalize(definition))
        definition = undefined
      } else if (parent === 'definition') {
        if (leaf === 'method') definition.method = value
        else if (leaf === 'name') definition.name = value
        else if (leaf === 'description') definition.description = value
      }
    } else if (area) {
      if (leaf === 'area' && parent === 'areas') {
        areas.push({
          name: area.name,
          activeMethod: area.activeMethod,
          definitions: area.definitions,
        })
        area = undefined
      } else if (parent === 'area') {
        if (leaf === 'areaname') area.name = value
        else if (leaf === 'activemethod') area.activeMethod = value
      }
    }

    path.pop()
    text = ''
  })

  return areas
}

function finalize(d: MutableDefinition): GradingDefinition {
  const criteria = [...d.criteria]
    .sort((a, b) => order(a.sortOrder) - order(b.sortOrder))
    .map((c) => ({
      description: c.description,
      sortOrder: c.sortOrder,
      // Levels read low-to-high so a reader meets the scale in the order the
      // rubric is filled in.
      levels: [...c.levels].sort((a, b) => a.score - b.score),
    }))
  return { method: d.method, name: d.name, description: d.description, criteria }
}

function order(sortOrder: number): number {
  return Number.isFinite(sortOrder) ? sortOrder : Number.MAX_SAFE_INTEGER
}
