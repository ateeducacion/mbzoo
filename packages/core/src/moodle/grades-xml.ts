/**
 * Parsers for Moodle's grade structures (read-only inspection, ADR-0013).
 *
 * Two files carry it, and both travel without user data:
 * - `activities/<mod>_<cmid>/grades.xml` — the activity's own grade item:
 *   what it is out of, what counts as a pass, how it is weighted.
 * - `gradebook.xml` — the course-wide category tree, the course total and
 *   the grade letters.
 *
 * `<grade_grades>` inside an item is the students' marks and is gated behind
 * `userinfo`, so it is ignored here rather than parsed and discarded.
 *
 * Constants below are from lib/grade/constants.php (REPO-005, read
 * 2026-08-25); shapes verified against a Moodle 5.2.2 backup and SMR_SOR.
 */
import { leafValue, parseXmlEvents } from './xml.ts'

/** GRADE_TYPE_*: how the item is marked. */
export type GradeKind = 'none' | 'value' | 'scale' | 'text' | 'unknown'

const GRADE_TYPES: Record<number, GradeKind> = {
  0: 'none',
  1: 'value',
  2: 'scale',
  3: 'text',
}

/** GRADE_AGGREGATE_*: how a category combines the items under it. */
export type GradeAggregation =
  | 'mean'
  | 'median'
  | 'min'
  | 'max'
  | 'mode'
  | 'weightedMean'
  | 'simpleWeightedMean'
  | 'meanWithExtraCredit'
  | 'sum'
  | 'unknown'

const AGGREGATIONS: Record<number, GradeAggregation> = {
  0: 'mean',
  2: 'median',
  4: 'min',
  6: 'max',
  8: 'mode',
  10: 'weightedMean',
  11: 'simpleWeightedMean',
  12: 'meanWithExtraCredit',
  13: 'sum',
}

export interface GradeItem {
  /** Author's name for the item; '' when it inherits the activity's. */
  readonly name: string
  /** `mod`, `course`, `category` or `manual`. */
  readonly itemType: string
  readonly kind: GradeKind
  readonly max: number
  readonly min: number
  /** Mark needed to pass; 0 when the author set none. */
  readonly pass: number
  /** `aggregationcoef2` — the item's share when a category weights by it. */
  readonly weight: number
  readonly hidden: boolean
  readonly locked: boolean
  readonly categoryId: number
  readonly sortOrder: number
}

export interface GradeCategory {
  readonly id: number
  /** Category name; Moodle stores '?' for the implicit course category. */
  readonly name: string
  readonly parentId: number
  readonly depth: number
  readonly aggregation: GradeAggregation
  readonly keepHigh: number
  readonly dropLow: number
}

export interface GradeLetter {
  readonly lowerBoundary: number
  readonly letter: string
}

export interface CourseGradebook {
  readonly categories: GradeCategory[]
  readonly items: GradeItem[]
  readonly letters: GradeLetter[]
}

/**
 * Reads the grade item(s) an activity declares. Usually one; a module with
 * several graded parts (workshop: submission and assessment) declares more.
 */
export async function parseActivityGradesXml(xml: string): Promise<GradeItem[]> {
  return (await parseGradeStructures(xml)).items
}

/** Reads the course-wide gradebook: categories, items and letters. */
export async function parseGradebookXml(xml: string): Promise<CourseGradebook> {
  return await parseGradeStructures(xml)
}

async function parseGradeStructures(xml: string): Promise<CourseGradebook> {
  const items: GradeItem[] = []
  const categories: GradeCategory[] = []
  const letters: GradeLetter[] = []
  const path: string[] = []
  let text = ''
  let fields: Map<string, string> | undefined
  let kind: 'item' | 'category' | 'letter' | undefined
  let currentId = Number.NaN
  // <grade_grades> holds students' marks: never read, so its leaves cannot
  // be mistaken for the item's own.
  let inGrades = false

  const leafOf = (): string | undefined => path[path.length - 1]

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'grade_grades') inGrades = true
      const starts =
        ev.name === 'grade_item'
          ? 'item'
          : ev.name === 'grade_category'
            ? 'category'
            : ev.name === 'grade_letter'
              ? 'letter'
              : undefined
      if (starts && !inGrades) {
        fields = new Map()
        kind = starts
        currentId = Number(ev.attributes.id ?? Number.NaN)
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const leaf = leafOf()
    if (leaf === 'grade_grades') inGrades = false
    if (fields && !inGrades) {
      if (
        (leaf === 'grade_item' && kind === 'item') ||
        (leaf === 'grade_category' && kind === 'category') ||
        (leaf === 'grade_letter' && kind === 'letter')
      ) {
        if (kind === 'item') items.push(toItem(fields))
        else if (kind === 'category') categories.push(toCategory(fields, currentId))
        else letters.push(toLetter(fields))
        fields = undefined
        kind = undefined
      } else if (leaf !== undefined) {
        fields.set(leaf, leafValue(text))
      }
    }

    path.pop()
    text = ''
  })

  return { categories, items, letters }
}

function num(fields: Map<string, string>, key: string): number {
  const n = Number(fields.get(key) ?? '')
  return Number.isFinite(n) ? n : 0
}

function toItem(f: Map<string, string>): GradeItem {
  return {
    name: f.get('itemname') ?? '',
    itemType: f.get('itemtype') ?? '',
    kind: GRADE_TYPES[num(f, 'gradetype')] ?? 'unknown',
    max: num(f, 'grademax'),
    min: num(f, 'grademin'),
    pass: num(f, 'gradepass'),
    weight: num(f, 'aggregationcoef2'),
    hidden: (f.get('hidden') ?? '0') !== '0',
    locked: (f.get('locked') ?? '0') !== '0',
    categoryId: num(f, 'categoryid'),
    sortOrder: num(f, 'sortorder'),
  }
}

function toCategory(f: Map<string, string>, id: number): GradeCategory {
  const parent = f.get('parent') ?? ''
  return {
    id,
    // Moodle stores "?" as the implicit course category's name.
    name: (f.get('fullname') ?? '') === '?' ? '' : (f.get('fullname') ?? ''),
    parentId: parent === '' ? Number.NaN : Number(parent),
    depth: num(f, 'depth'),
    aggregation: AGGREGATIONS[num(f, 'aggregation')] ?? 'unknown',
    keepHigh: num(f, 'keephigh'),
    dropLow: num(f, 'droplow'),
  }
}

function toLetter(f: Map<string, string>): GradeLetter {
  return { lowerBoundary: num(f, 'lowerboundary'), letter: f.get('letter') ?? '' }
}
