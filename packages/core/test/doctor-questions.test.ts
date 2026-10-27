import { describe, expect, test } from 'bun:test'
import { type NamedXml, planQuestions } from '../src/doctor/questions.ts'
import type { Finding } from '../src/index.ts'

interface Entry {
  readonly id: string
  readonly text?: string
  readonly qtype?: string
  readonly tags?: readonly string[]
  readonly extra?: string
}

function bank(entries: readonly Entry[], category = '<contextid>99</contextid><parent>0</parent>') {
  const body = entries
    .map((entry) => {
      const tags = (entry.tags ?? [])
        .map((tag) => `<tag><name>${tag}</name><rawname>${tag}</rawname></tag>`)
        .join('')
      return `<question_bank_entry id="${entry.id}"><question_version><question_versions id="1"><questions>
        <question id="${entry.id}0"><questiontext>${entry.text ?? '0'}</questiontext><qtype>${entry.qtype ?? 'random'}</qtype><tags>${tags}</tags></question>
        ${entry.extra ?? ''}
      </questions></question_versions></question_version></question_bank_entry>`
    })
    .join('')
  return `<question_categories><question_category id="5">${category}<question_bank_entries>${body}</question_bank_entries></question_category></question_categories>`
}

function quiz(instances: string): NamedXml {
  return {
    name: 'activities/quiz_20/quiz.xml',
    activityId: 20,
    xml: `<activity id="20"><quiz id="3"><question_instances>${instances}</question_instances></quiz></activity>`,
  }
}

function slot(bankEntryId: string, overrides: { using?: string; extra?: string } = {}): string {
  return `<question_instance id="9"><slot>1</slot><question_reference id="4">
    <usingcontextid>${overrides.using ?? '15'}</usingcontextid><component>mod_quiz</component>
    <questionarea>slot</questionarea><questionbankentryid>${bankEntryId}</questionbankentryid>
  </question_reference>${overrides.extra ?? ''}</question_instance>`
}

function plan(
  questions: string,
  activities: readonly NamedXml[] = [],
  path: 'legacy' | 'modern' | 'unknown' = 'modern',
  target = '4.5',
) {
  return planQuestions([{ name: 'questions.xml', xml: questions }], activities, path, target)
}

function blockedCode(findings: readonly Finding[]): string | undefined {
  return findings.find((f) => f.ruleId === 'questions.random-blocked')?.evidence[0]?.code
}

describe('planQuestions random blockers', () => {
  test('an unknown restore path blocks the repair', () => {
    const { findings } = plan(bank([{ id: '50' }]), [quiz(slot('50'))], 'unknown')
    expect(blockedCode(findings)).toBe('questions.random-path-unknown')
  })

  test('a target release before 4.0 blocks the repair', () => {
    const { findings } = plan(bank([{ id: '50' }]), [quiz(slot('50'))], 'modern', '3.11')
    expect(blockedCode(findings)).toBe('questions.random-target-old')
  })

  test('a random question outside any bank entry blocks the repair', () => {
    const xml = `<question_categories><question_category id="5"><contextid>99</contextid><parent>0</parent><questions>
      <question id="70"><questiontext>0</questiontext><qtype>random</qtype></question>
    </questions></question_category></question_categories>`
    expect(blockedCode(plan(xml).findings)).toBe('questions.random-no-entry')
  })

  test('a bank entry that mixes random with other versions blocks the repair', () => {
    const extra = '<question id="999"><questiontext>Q</questiontext><qtype>essay</qtype></question>'
    const { findings } = plan(bank([{ id: '50', extra }]), [quiz(slot('50'))])
    expect(blockedCode(findings)).toBe('questions.random-mixed-entry')
  })

  test('a category without a context id blocks the repair', () => {
    const { findings } = plan(bank([{ id: '50' }], '<parent>0</parent>'), [quiz(slot('50'))])
    expect(blockedCode(findings)).toBe('questions.random-no-context')
  })

  test('a tag with a comma blocks the repair', () => {
    const { findings } = plan(bank([{ id: '50', tags: ['a,b'] }]), [quiz(slot('50'))])
    expect(blockedCode(findings)).toBe('questions.random-comma-tag')
  })

  test('a legacy slot that points at the question id blocks the repair', () => {
    const legacy =
      '<question_instance id="8"><slot>2</slot><questionid>500</questionid></question_instance>'
    const { findings } = plan(bank([{ id: '50' }]), [quiz(slot('50') + legacy)])
    expect(blockedCode(findings)).toBe('questions.random-slot-by-id')
  })

  test('a slot that already has a set reference blocks the repair', () => {
    const set =
      '<question_set_reference id="1"><filtercondition>{}</filtercondition></question_set_reference>'
    const { findings } = plan(bank([{ id: '50' }]), [quiz(slot('50', { extra: set }))])
    expect(blockedCode(findings)).toBe('questions.random-has-set')
  })

  test('a reference without a using context blocks the repair', () => {
    const { findings } = plan(bank([{ id: '50' }]), [quiz(slot('50', { using: '' }))])
    expect(blockedCode(findings)).toBe('questions.random-incomplete-reference')
  })
})

describe('planQuestions random repairs', () => {
  test('copies tag names into the legacy filter', () => {
    const { findings, steps } = plan(bank([{ id: '50', tags: ['algebra'] }]), [quiz(slot('50'))])
    const repair = findings.find((f) => f.ruleId === 'questions.random-modern')?.repair
    expect(repair?.transforms.at(-1)).toBe('Copy tag names into the legacy filter: algebra.')
    const quizStep = steps.find((step) => step.entry === 'activities/quiz_20/quiz.xml')
    const after = quizStep?.apply(quiz(slot('50')).xml) ?? ''
    expect(after).toContain('question_set_reference')
    expect(after).toContain('0,algebra')
  })

  test('an unreferenced random placeholder is removed and flagged as content loss', () => {
    const { findings, steps } = plan(
      bank([{ id: '50' }, { id: '60', qtype: 'essay', text: 'Kept' }]),
    )
    const repair = findings.find((f) => f.ruleId === 'questions.random-modern')?.repair
    expect(repair?.summary).toBe('Remove an unreferenced modern random placeholder.')
    expect(repair?.contentLoss).toBe(true)
    expect(steps).toHaveLength(1)
    const after = steps[0]?.apply(bank([{ id: '50' }, { id: '60', qtype: 'essay' }])) ?? ''
    expect(after).not.toContain('question_bank_entry id="50"')
    expect(after).toContain('question_bank_entry id="60"')
  })
})

describe('planQuestions bank checks', () => {
  test('reports a category cycle', () => {
    const xml = `<question_categories>
      <question_category id="5"><contextid>1</contextid><parent>6</parent></question_category>
      <question_category id="6"><contextid>1</contextid><parent>5</parent></question_category>
    </question_categories>`
    const cycle = plan(xml).findings.find((f) => f.ruleId === 'questions.category-cycle')
    expect(cycle?.params).toEqual({ count: 2 })
  })

  test('reports quiz slots that point outside the bank', () => {
    const legacy =
      '<question_instance id="8"><slot>2</slot><questionid>404</questionid></question_instance>'
    const { findings } = plan(bank([]), [quiz(slot('77') + legacy)])
    const outside = findings.find((f) => f.ruleId === 'questions.outside-bank')
    expect(outside?.params).toEqual({ count: 2 })
    expect(outside?.evidence.map((e) => e.code)).toEqual([
      'questions.outside-entry',
      'questions.outside-question',
    ])
    expect(outside?.evidence[0]?.activityId).toBe(20)
  })

  test('reports a set reference whose filter is not JSON', () => {
    const set =
      '<question_set_reference id="1"><filtercondition>{not json</filtercondition></question_set_reference>'
    const { findings } = plan(bank([]), [
      quiz(`<question_instance id="9"><slot>1</slot>${set}</question_instance>`),
    ])
    const bad = findings.find((f) => f.ruleId === 'questions.bad-filter')
    expect(bad?.activityId).toBe(20)
  })

  test('describes several top categories without a context id', () => {
    const xml = `<question_categories>
      <question_category id="5"><parent>0</parent></question_category>
      <question_category id="6"><parent>0</parent></question_category>
    </question_categories>`
    const result = planQuestions(
      [{ name: 'questions.xml', xml }],
      [],
      'modern',
      '4.5',
      '4.5',
      '2024100700',
    )
    const top = result.findings.find((f) => f.ruleId === 'questions.multiple-top-categories')
    expect(top?.evidence[0]?.code).toBe('questions.top-category-no-context')
  })
})
