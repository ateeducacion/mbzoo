/**
 * Question-bank diagnostics and the one random-question repair Moodle's
 * own restore code supports structurally (REPO-005, ADR-0037).
 *
 * Moodle 5.2 `process_question` throws
 * `You cannot restore a question with qtype "random"` only on the modern
 * insert path. A pre-4.0 backup is stashed and converted by the quiz step.
 * This module never renames qtype, never invents a context id, and never
 * deletes a bank entry that still has a slot we could not convert.
 */
import { makeFinding } from './catalog.ts'
import type { Finding, RepairPlan, RepairStep } from './types.ts'
import { multipleTopCategoriesFail, parseRelease, type RandomRestorePath } from './versions.ts'
import {
  ancestorNamed,
  childrenOf,
  escapeText,
  leafOf,
  previewEdit,
  scanElements,
  spliceRanges,
  type XmlEl,
} from './xml-span.ts'

export interface NamedXml {
  readonly name: string
  readonly xml: string
  readonly activityId?: number
}

export interface QuestionPlan {
  readonly findings: Finding[]
  readonly steps: RepairStep[]
  readonly categories: number
  readonly questions: number
}

const CORE_QTYPES = new Set([
  'calculated',
  'calculatedmulti',
  'calculatedsimple',
  'ddimageortext',
  'ddmarker',
  'ddwtos',
  'description',
  'essay',
  'gapselect',
  'match',
  'missingtype',
  'multianswer',
  'multichoice',
  'numerical',
  'random',
  'shortanswer',
  'truefalse',
])

interface Category {
  readonly id: string
  readonly parent: string
  readonly contextId: string
}

interface QuestionRow {
  readonly id: string
  readonly qtype: string
  readonly text: string
  readonly categoryId: string
  readonly bankEntryId: string
  readonly file: string
  readonly tags: readonly string[]
}

interface SlotRef {
  readonly file: string
  readonly activityId?: number
  readonly bankEntryId: string
  readonly questionId: string
  readonly using: string
  readonly component: string
  readonly area: string
  readonly hasSet: boolean
}

export function planQuestions(
  questionFiles: readonly NamedXml[],
  activityFiles: readonly NamedXml[],
  path: RandomRestorePath,
  targetRelease: string,
  backupRelease = '',
  moodleVersion = '',
): QuestionPlan {
  const findings: Finding[] = []
  const categories: Category[] = []
  const questions: QuestionRow[] = []
  const seenQuestionIds = new Map<string, number>()

  for (const file of questionFiles) {
    const elements = scanElements(file.xml)
    for (const el of elements) {
      if (el.name !== 'question_category' || el.end < 0) continue
      const id = elementId(file.xml, elements, el)
      if (id === '') continue
      categories.push({
        id,
        parent: leafOf(file.xml, elements, el, 'parent'),
        contextId: leafOf(file.xml, elements, el, 'contextid'),
      })
    }
    for (const el of elements) {
      if (el.name !== 'question' || el.end < 0) continue
      const id = elementId(file.xml, elements, el)
      if (id === '') continue
      seenQuestionIds.set(id, (seenQuestionIds.get(id) ?? 0) + 1)
      const bank = ancestorNamed(elements, el, 'question_bank_entry')
      const category = ancestorNamed(elements, el, 'question_category')
      questions.push({
        id,
        qtype: leafOf(file.xml, elements, el, 'qtype'),
        text: leafOf(file.xml, elements, el, 'questiontext'),
        categoryId: category ? elementId(file.xml, elements, category) : '',
        bankEntryId: bank ? elementId(file.xml, elements, bank) : '',
        file: file.name,
        tags: tagNames(file.xml, elements, el),
      })
    }
  }

  const slots = activityFiles.flatMap((file) => readSlots(file))
  const categoryById = new Map<string, Category>()
  for (const category of categories) categoryById.set(category.id, category)

  const duplicateIds = [...seenQuestionIds.entries()].filter(([, count]) => count > 1)
  if (duplicateIds.length > 0) {
    findings.push(
      makeFinding('questions.duplicate-id', {
        id: 'questions.duplicate-id',
        evidence: duplicateIds.slice(0, 8).map(([id, count]) => ({
          ...questionIdOf(id),
          detail: `Question id ${id} appears ${count} times`,
        })),
        params: { count: duplicateIds.length },
      }),
    )
  }

  const catIds = new Set(categories.map((category) => category.id))
  const missingParents = categories.filter(
    (category) => category.parent !== '' && category.parent !== '0' && !catIds.has(category.parent),
  )
  if (missingParents.length > 0) {
    findings.push(
      makeFinding('questions.missing-parent', {
        id: 'questions.missing-parent',
        evidence: missingParents.slice(0, 8).map((category) => ({
          detail: `Category ${category.id} names parent ${category.parent}, which is not in this backup`,
        })),
        params: { count: missingParents.length },
      }),
    )
  }

  const cyclic = categoryCycles(categories)
  if (cyclic.length > 0) {
    findings.push(
      makeFinding('questions.category-cycle', {
        id: 'questions.category-cycle',
        evidence: cyclic.slice(0, 8).map((id) => ({
          detail: `Category ${id} is its own ancestor`,
        })),
        params: { count: cyclic.length },
      }),
    )
  }

  const unknownTypes = new Set<string>()
  for (const question of questions) {
    if (question.qtype !== '' && !CORE_QTYPES.has(question.qtype)) unknownTypes.add(question.qtype)
  }
  for (const qtype of [...unknownTypes].sort()) {
    findings.push(
      makeFinding('plugins.unknown-qtype', {
        id: `plugins.unknown-qtype:${qtype}`,
        evidence: [{ detail: `Question type ${qtype} is not in MBZoo's core list` }],
        params: { qtype },
      }),
    )
  }

  const steps: RepairStep[] = []
  const reportedLegacy = new Set<string>()
  const emptyPools = new Set<string>()
  const bankIds = new Set(
    questions.map((question) => question.bankEntryId).filter((id) => id !== ''),
  )

  const randomQuestions = questions.filter((question) => question.qtype === 'random')
  const groups = new Map<string, QuestionRow[]>()
  for (const question of randomQuestions) {
    const key =
      question.bankEntryId !== '' ? `bank:${question.bankEntryId}` : `question:${question.id}`
    const list = groups.get(key) ?? []
    list.push(question)
    groups.set(key, list)
  }

  for (const [key, group] of groups) {
    const first = group[0]
    if (!first) continue
    const category = categoryById.get(first.categoryId)
    noteEmptyPool(questions, first.categoryId, emptyPools, findings)
    if (path === 'legacy') {
      if (reportedLegacy.has(key)) continue
      reportedLegacy.add(key)
      findings.push(
        makeFinding('questions.legacy-random', {
          id: `questions.legacy-random:${key}`,
          evidence: [
            {
              entry: first.file,
              ...questionIdOf(first.id),
              detail: `qtype random on the pre-4.0 restore path (question ${first.id})`,
            },
          ],
          params: { questionId: first.id, bankEntryId: first.bankEntryId },
        }),
      )
      continue
    }

    const siblings =
      first.bankEntryId === ''
        ? group
        : questions.filter((question) => question.bankEntryId === first.bankEntryId)
    const reason = blockReason(path, targetRelease, first, siblings, category, slots)
    if (reason !== undefined) {
      findings.push(
        makeFinding('questions.random-blocked', {
          id: `questions.random-blocked:${key}`,
          evidence: [
            {
              entry: first.file,
              ...questionIdOf(first.id),
              detail: reason,
            },
          ],
          params: { questionId: first.id, bankEntryId: first.bankEntryId },
        }),
      )
      continue
    }

    const refs = slots.filter((slot) => slot.bankEntryId === first.bankEntryId && !slot.hasSet)
    const includeSubs = first.text === '1'
    const spec: RandomSpec = {
      questionsEntry: first.file,
      bankEntryId: first.bankEntryId,
      categoryId: first.categoryId,
      contextId: category?.contextId ?? '',
      includeSubs,
      tags: first.tags,
    }
    const quizEntries = [...new Set(refs.map((slot) => slot.file))]
    const built = buildRandomRepair(key, spec, quizEntries, questionFiles, activityFiles, first)
    findings.push(built.finding)
    steps.push(...built.steps)
  }

  const outside = slots.filter((slot) => {
    if (slot.bankEntryId !== '' && !bankIds.has(slot.bankEntryId)) return true
    if (
      slot.bankEntryId === '' &&
      slot.questionId !== '' &&
      !seenQuestionIds.has(slot.questionId)
    ) {
      return true
    }
    return false
  })
  if (outside.length > 0) {
    findings.push(
      makeFinding('questions.outside-bank', {
        id: 'questions.outside-bank',
        evidence: outside.slice(0, 8).map((slot) => ({
          entry: slot.file,
          ...(slot.activityId !== undefined ? { activityId: slot.activityId } : {}),
          detail:
            slot.bankEntryId !== ''
              ? `Slot references question bank entry ${slot.bankEntryId}, which is not in this backup`
              : `Slot references question ${slot.questionId}, which is not in this backup`,
        })),
        params: { count: outside.length },
      }),
    )
  }

  for (const file of activityFiles) {
    const elements = scanElements(file.xml)
    for (const el of elements) {
      if (el.name !== 'question_set_reference' || el.end < 0) continue
      const raw = leafOf(file.xml, elements, el, 'filtercondition')
      if (raw === '') continue
      try {
        JSON.parse(raw)
      } catch {
        findings.push(
          makeFinding('questions.bad-filter', {
            id: `questions.bad-filter:${file.name}:${el.start}`,
            evidence: [
              {
                entry: file.name,
                ...(file.activityId !== undefined ? { activityId: file.activityId } : {}),
                detail: 'filtercondition is not valid JSON',
              },
            ],
            ...(file.activityId !== undefined ? { activityId: file.activityId } : {}),
          }),
        )
      }
    }
  }

  noteMultipleTopCategories(categories, backupRelease, moodleVersion, findings)
  noteLegacyAttempts(activityFiles, seenQuestionIds, findings)

  return { findings, steps, categories: categories.length, questions: questions.length }
}

interface RandomSpec {
  readonly questionsEntry: string
  readonly bankEntryId: string
  readonly categoryId: string
  readonly contextId: string
  readonly includeSubs: boolean
  readonly tags: readonly string[]
}

function blockReason(
  path: RandomRestorePath,
  targetRelease: string,
  question: QuestionRow,
  siblings: readonly QuestionRow[],
  category: Category | undefined,
  slots: readonly SlotRef[],
): string | undefined {
  if (path === 'unknown') {
    return 'Backup release and backup version are both missing, so the legacy and modern restore paths cannot be told apart'
  }
  const target = parseRelease(targetRelease)
  if (target.major !== undefined && target.major < 4) {
    return `Target Moodle ${targetRelease} is older than 4.0, so a set reference would not match its restore path`
  }
  if (question.bankEntryId === '') {
    return 'The random question is not inside a question_bank_entry, so there is no question_reference to rewrite and no context id to copy'
  }
  if (siblings.length !== 1 || siblings.some((row) => row.qtype !== 'random')) {
    return `Question bank entry ${question.bankEntryId} holds ${siblings.length} questions. A mixed entry is not converted, and nothing is deleted`
  }
  if (question.text !== '' && question.text !== '0' && question.text !== '1') {
    return 'The random question text is not 0 or 1, so subcategory inclusion cannot be copied from the legacy questiontext field'
  }
  if (!category || category.contextId === '') {
    return `Category ${question.categoryId || '(missing)'} has no context id to copy into questionscontextid`
  }
  if (question.tags.some((tag) => tag.includes(','))) {
    return 'A question tag name contains a comma. Moodle splits legacy tags on the first comma, so the tag would be ambiguous'
  }
  const legacySlots = slots.filter(
    (slot) => slot.questionId === question.id && slot.bankEntryId === '' && !slot.hasSet,
  )
  if (legacySlots.length > 0) {
    return 'A quiz slot still points at this question by question id. usingcontextid is not in that XML and is not invented'
  }
  const refs = slots.filter((slot) => slot.bankEntryId === question.bankEntryId)
  const broken = refs.find(
    (slot) => slot.hasSet || slot.using === '' || slot.component === '' || slot.area === '',
  )
  if (broken) {
    if (broken.hasSet)
      return 'The slot already has a question_set_reference, so the question_reference was left in place'
    return 'The question_reference is missing usingcontextid, component, or questionarea'
  }
  return undefined
}

function buildRandomRepair(
  key: string,
  spec: RandomSpec,
  quizEntries: readonly string[],
  questionFiles: readonly NamedXml[],
  activityFiles: readonly NamedXml[],
  question: QuestionRow,
): { finding: Finding; steps: RepairStep[] } {
  const id = `questions.random-modern:${key}`
  const steps: RepairStep[] = [
    {
      id,
      order: 30,
      entry: spec.questionsEntry,
      safety: 'confirmation-required',
      apply: (xml) => deleteBankEntry(xml, spec.bankEntryId),
    },
    ...quizEntries.map(
      (entry): RepairStep => ({
        id,
        order: 30,
        entry,
        safety: 'confirmation-required',
        apply: (xml) => rewriteSlotReferences(xml, spec),
      }),
    ),
  ]
  const originals = new Map<string, string>()
  for (const file of questionFiles) originals.set(file.name, file.xml)
  for (const file of activityFiles) originals.set(file.name, file.xml)
  const previews = steps.map((step) => {
    const before = originals.get(step.entry) ?? ''
    return previewEdit(step.entry, before, step.apply(before))
  })
  const transforms = [
    quizEntries.length === 0
      ? `Remove question_bank_entry ${spec.bankEntryId} from ${spec.questionsEntry}. No quiz slot references it.`
      : `Replace question_reference elements that point at question bank entry ${spec.bankEntryId} with question_set_reference elements in ${quizEntries.join(', ')}.`,
    `The set filter keeps category ${spec.categoryId}, context ${spec.contextId}, and includingsubcategories ${spec.includeSubs ? 1 : 0}.`,
    `Remove only question_bank_entry ${spec.bankEntryId} from ${spec.questionsEntry}. Other questions stay.`,
  ]
  if (spec.tags.length > 0) {
    transforms.push(`Copy tag names into the legacy filter: ${spec.tags.join(', ')}.`)
  }
  const repair: RepairPlan = {
    id,
    safety: 'confirmation-required',
    summary:
      quizEntries.length === 0
        ? 'Remove an unreferenced modern random placeholder.'
        : 'Convert the quiz slot from a random question to a question set reference.',
    transforms,
    contentLoss: quizEntries.length === 0,
    reversible: true,
    why: 'Moodle 4.3 through 5.2 already converts this legacy filter JSON into the current set-reference filter, and Moodle 5.2 refuses to insert qtype random on the modern path. The category context id is copied from the category element. No bank entry id is invented.',
    entries: [...new Set(steps.map((step) => step.entry))],
    preview: previews,
  }
  const activityId = activityFiles.find((file) => quizEntries.includes(file.name))?.activityId
  const finding = makeFinding('questions.random-modern', {
    id,
    evidence: [
      {
        entry: spec.questionsEntry,
        ...questionIdOf(question.id),
        ...(activityId !== undefined ? { activityId } : {}),
        detail: `Question ${question.id} in bank entry ${spec.bankEntryId}, category ${spec.categoryId}`,
      },
    ],
    params: {
      questionId: question.id,
      bankEntryId: spec.bankEntryId,
      categoryId: spec.categoryId,
    },
    ...(activityId !== undefined ? { activityId } : {}),
    repair,
  })
  return { finding, steps }
}

function noteEmptyPool(
  questions: readonly QuestionRow[],
  categoryId: string,
  seen: Set<string>,
  findings: Finding[],
): void {
  if (categoryId === '' || seen.has(categoryId)) return
  seen.add(categoryId)
  const drawable = questions.filter(
    (question) =>
      question.categoryId === categoryId && question.qtype !== 'random' && question.qtype !== '',
  )
  if (drawable.length > 0) return
  findings.push(
    makeFinding('questions.empty-pool', {
      id: `questions.empty-pool:${categoryId}`,
      evidence: [
        {
          detail: `Category ${categoryId} has no non-random questions in this backup`,
        },
      ],
      params: { categoryId },
    }),
  )
}

function noteMultipleTopCategories(
  categories: readonly Category[],
  release: string,
  moodleVersion: string,
  findings: Finding[],
): void {
  if (!multipleTopCategoriesFail(release, moodleVersion)) return
  const tops = new Map<string, Category[]>()
  for (const category of categories) {
    if (category.parent !== '' && category.parent !== '0') continue
    const list = tops.get(category.contextId) ?? []
    list.push(category)
    tops.set(category.contextId, list)
  }
  for (const [contextId, roots] of tops) {
    if (roots.length < 2) continue
    findings.push(
      makeFinding('questions.multiple-top-categories', {
        id: `questions.multiple-top-categories:${contextId || 'none'}`,
        repairability: 'manual',
        evidence: roots.slice(0, 8).map((category) => {
          const children = categories.filter((item) => item.parent === category.id).length
          return {
            detail: `Category ${category.id} is a top-level category in context ${contextId || '(empty)'} and has ${children} child categories in this backup`,
          }
        }),
        params: { contextId, count: roots.length },
      }),
    )
  }
}

function noteLegacyAttempts(
  activityFiles: readonly NamedXml[],
  seenQuestionIds: ReadonlyMap<string, number>,
  findings: Finding[],
): void {
  const reported = new Set<string>()
  for (const file of activityFiles) {
    const elements = scanElements(file.xml)
    const states = new Map<string, number>()
    const sessions = new Map<string, number>()
    let legacy = false
    for (const el of elements) {
      if (el.end < 0) continue
      const parent = el.parent >= 0 ? elements[el.parent] : undefined
      if (el.name === 'state' && parent?.name === 'states') {
        legacy = true
        const id = leafOf(file.xml, elements, el, 'question')
        if (id !== '' && id !== '0') states.set(id, (states.get(id) ?? 0) + 1)
      }
      if (el.name === 'session' && parent?.name === 'sessions') {
        legacy = true
        const id = leafOf(file.xml, elements, el, 'questionid')
        if (id !== '' && id !== '0') sessions.set(id, (sessions.get(id) ?? 0) + 1)
      }
    }
    if (!legacy) continue
    for (const id of new Set([...states.keys(), ...sessions.keys()])) {
      const activity = file.activityId
      const where = {
        entry: file.name,
        ...(activity !== undefined ? { activityId: activity } : {}),
        ...(questionIdOf(id) ?? {}),
      }
      if (!seenQuestionIds.has(id)) {
        const findingId = `questions.attempt-missing-question:${id}`
        if (reported.has(findingId)) continue
        reported.add(findingId)
        findings.push(
          makeFinding('questions.attempt-missing-question', {
            id: findingId,
            evidence: [
              {
                ...where,
                detail: `Legacy attempt references question ${id}, which is not in this backup`,
              },
            ],
            ...(activity !== undefined ? { activityId: activity } : {}),
            params: { questionId: id },
          }),
        )
        continue
      }
      if ((states.get(id) ?? 0) === 0 || (sessions.get(id) ?? 0) === 0) {
        const findingId = `questions.attempt-data-missing:${id}`
        if (reported.has(findingId)) continue
        reported.add(findingId)
        findings.push(
          makeFinding('questions.attempt-data-missing', {
            id: findingId,
            evidence: [
              {
                ...where,
                detail: `Question ${id} has ${sessions.get(id) ?? 0} legacy sessions and ${states.get(id) ?? 0} legacy states`,
              },
            ],
            ...(activity !== undefined ? { activityId: activity } : {}),
            params: { questionId: id },
          }),
        )
      }
    }
  }
}

function categoryCycles(categories: readonly Category[]): string[] {
  const parentOf = new Map(categories.map((category) => [category.id, category.parent]))
  const cyclic: string[] = []
  for (const category of categories) {
    const seen = new Set<string>()
    let current = category.id
    while (current !== '' && current !== '0' && parentOf.has(current)) {
      if (seen.has(current)) {
        cyclic.push(category.id)
        break
      }
      seen.add(current)
      current = parentOf.get(current) ?? ''
    }
  }
  return cyclic
}

export function deleteBankEntry(xml: string, bankEntryId: string): string {
  const elements = scanElements(xml)
  const entry = elements.find(
    (el) =>
      el.name === 'question_bank_entry' &&
      elementId(xml, elements, el) === bankEntryId &&
      el.end > el.start,
  )
  if (!entry) return xml
  return spliceRanges(xml, [{ start: entry.start, end: entry.end, replacement: '' }])
}

export function rewriteSlotReferences(xml: string, spec: RandomSpec): string {
  const elements = scanElements(xml)
  const ranges: { start: number; end: number; replacement: string }[] = []
  for (const ref of elements) {
    if (ref.name !== 'question_reference' || ref.end < ref.start) continue
    if (leafOf(xml, elements, ref, 'questionbankentryid') !== spec.bankEntryId) continue
    const parentIndex = ref.parent
    const parent = parentIndex >= 0 ? elements[parentIndex] : undefined
    if (parent && descendantsNamed(elements, parentIndex, 'question_set_reference').length > 0)
      continue
    const using = leafOf(xml, elements, ref, 'usingcontextid')
    const component = leafOf(xml, elements, ref, 'component')
    const area = leafOf(xml, elements, ref, 'questionarea')
    if (using === '' || component === '' || area === '') continue
    ranges.push({
      start: ref.start,
      end: ref.end,
      replacement: setReferenceXml(using, component, area, spec),
    })
  }
  if (ranges.length === 0) return xml
  return spliceRanges(xml, ranges)
}

function setReferenceXml(using: string, component: string, area: string, spec: RandomSpec): string {
  const filter = legacyFilter(spec.categoryId, spec.includeSubs, spec.tags)
  return (
    '<question_set_reference>' +
    `<usingcontextid>${escapeText(using)}</usingcontextid>` +
    `<component>${escapeText(component)}</component>` +
    `<questionarea>${escapeText(area)}</questionarea>` +
    `<questionscontextid>${escapeText(spec.contextId)}</questionscontextid>` +
    `<filtercondition>${escapeText(filter)}</filtercondition>` +
    '</question_set_reference>'
  )
}

function legacyFilter(categoryId: string, includeSubs: boolean, tags: readonly string[]): string {
  const numeric = /^\d+$/.test(categoryId) && Number.isSafeInteger(Number(categoryId))
  const body: Record<string, unknown> = {
    questioncategoryid: numeric ? Number(categoryId) : categoryId,
    includingsubcategories: includeSubs ? 1 : 0,
  }
  if (tags.length > 0) body.tags = tags.map((tag) => `0,${tag}`)
  return JSON.stringify(body)
}

function readSlots(file: NamedXml): SlotRef[] {
  const elements = scanElements(file.xml)
  const slots: SlotRef[] = []
  for (const el of elements) {
    if (el.name !== 'question_instance' || el.end < 0) continue
    const index = elements.indexOf(el)
    const reference = descendantsNamed(elements, index, 'question_reference')[0]
    const hasSet = descendantsNamed(elements, index, 'question_set_reference').length > 0
    const questionId =
      leafOf(file.xml, elements, el, 'questionid') || leafOf(file.xml, elements, el, 'question')
    if (!reference && questionId === '') continue
    slots.push({
      file: file.name,
      ...(file.activityId !== undefined ? { activityId: file.activityId } : {}),
      bankEntryId: reference ? leafOf(file.xml, elements, reference, 'questionbankentryid') : '',
      questionId,
      using: reference ? leafOf(file.xml, elements, reference, 'usingcontextid') : '',
      component: reference ? leafOf(file.xml, elements, reference, 'component') : '',
      area: reference ? leafOf(file.xml, elements, reference, 'questionarea') : '',
      hasSet,
    })
  }
  return slots
}

function tagNames(xml: string, elements: readonly XmlEl[], question: XmlEl): string[] {
  const index = elements.indexOf(question)
  if (index < 0) return []
  const names: string[] = []
  for (const tag of descendantsNamed(elements, index, 'tag')) {
    const raw = leafOf(xml, elements, tag, 'rawname')
    const name = raw !== '' ? raw : leafOf(xml, elements, tag, 'name')
    if (name !== '') names.push(name)
  }
  return names
}

function descendantsNamed(elements: readonly XmlEl[], root: number, name: string): XmlEl[] {
  const found: XmlEl[] = []
  const walk = (parent: number): void => {
    for (const child of childrenOf(elements, parent)) {
      const index = elements.indexOf(child)
      if (child.name === name) found.push(child)
      if (index >= 0) walk(index)
    }
  }
  walk(root)
  return found
}

function elementId(xml: string, elements: readonly XmlEl[], el: XmlEl): string {
  if (el.attrs.id) return el.attrs.id
  return leafOf(xml, elements, el, 'id')
}

function questionIdOf(id: string): { questionId: number } | undefined {
  const questionId = Number(id)
  if (!Number.isSafeInteger(questionId) || questionId <= 0) return undefined
  return { questionId }
}
