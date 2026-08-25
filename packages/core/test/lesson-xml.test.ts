import { describe, expect, test } from 'bun:test'
import { type LessonJumpKind, parseLessonXml } from '../src/moodle/lesson-xml.ts'

// mod/lesson writes <page> and <answer> unconditionally and gates only
// attempts/branches/grades/timers behind userinfo, so this is what a
// content-only backup carries (REPO-005, backup_lesson_stepslib.php).
// Document order here is deliberately not reading order: Moodle writes
// pages ordered by prevpageid ASC.
const LESSON = `<?xml version="1.0"?>
<activity id="3" moduleid="55" modulename="lesson" contextid="120">
  <lesson id="3">
    <name>Install a server</name>
    <intro>&lt;p&gt;Follow the branches.&lt;/p&gt;</intro>
    <pages>
      <page id="10">
        <prevpageid>0</prevpageid>
        <nextpageid>11</nextpageid>
        <qtype>20</qtype>
        <title>Choose a path</title>
        <contents>&lt;p&gt;Pick one.&lt;/p&gt;</contents>
        <answers>
          <answer id="90">
            <jumpto>11</jumpto>
            <grade>0</grade>
            <answer_text>Windows Server</answer_text>
            <response></response>
          </answer>
          <answer id="91">
            <jumpto>-9</jumpto>
            <grade>0</grade>
            <answer_text>Skip to the end</answer_text>
            <response></response>
          </answer>
        </answers>
      </page>
      <page id="11">
        <prevpageid>10</prevpageid>
        <nextpageid>0</nextpageid>
        <qtype>3</qtype>
        <title>Which filesystem?</title>
        <contents>&lt;p&gt;Choose one.&lt;/p&gt;</contents>
        <answers>
          <answer id="92">
            <jumpto>-1</jumpto>
            <grade>1</grade>
            <answer_text>NTFS</answer_text>
            <response>&lt;p&gt;Correct.&lt;/p&gt;</response>
          </answer>
          <answer id="93">
            <jumpto>0</jumpto>
            <grade>0</grade>
            <answer_text>FAT32</answer_text>
            <response>Try again.</response>
          </answer>
        </answers>
      </page>
    </pages>
  </lesson>
</activity>`

describe('parseLessonXml', () => {
  test('reads pages with their authored HTML', async () => {
    const lesson = await parseLessonXml(LESSON)
    expect(lesson.pages).toHaveLength(2)
    expect(lesson.pages[0]?.title).toBe('Choose a path')
    expect(lesson.pages[0]?.contents).toContain('Pick one.')
  })

  // define("LESSON_PAGE_BRANCHTABLE", "20") / MULTICHOICE "3" (REPO-005).
  test('maps Moodle page type ids to kinds', async () => {
    const lesson = await parseLessonXml(LESSON)
    expect(lesson.pages[0]?.kind).toBe('content')
    expect(lesson.pages[1]?.kind).toBe('multichoice')
  })

  test('reads answers with their feedback and correctness', async () => {
    const lesson = await parseLessonXml(LESSON)
    const question = lesson.pages[1]
    expect(question?.answers).toHaveLength(2)
    expect(question?.answers[0]?.text).toBe('NTFS')
    expect(question?.answers[0]?.grade).toBe(1)
    expect(question?.answers[1]?.response).toBe('Try again.')
  })

  // define("LESSON_EOL", -9) / LESSON_NEXTPAGE -1 / LESSON_THISPAGE 0.
  test('names the special jump targets and keeps real page ids', async () => {
    const lesson = await parseLessonXml(LESSON)
    expect(lesson.pages[0]?.answers[0]?.jump).toEqual({ kind: 'page', pageId: 11 })
    expect(lesson.pages[0]?.answers[1]?.jump.kind).toBe('endOfLesson')
    expect(lesson.pages[1]?.answers[0]?.jump.kind).toBe('nextPage')
    expect(lesson.pages[1]?.answers[1]?.jump.kind).toBe('thisPage')
  })

  test('orders pages by the prevpageid/nextpageid chain', async () => {
    // Reverse document order to prove the chain, not the file, decides.
    const reversed = LESSON.replace(/<pages>[\s\S]*<\/pages>/, (block) => {
      const pages = block.match(/<page id="\d+">[\s\S]*?<\/page>/g) ?? []
      return `<pages>${pages.reverse().join('')}</pages>`
    })
    const lesson = await parseLessonXml(reversed)
    expect(lesson.pages.map((p) => p.id)).toEqual([10, 11])
  })

  test('a page the chain never reaches is kept, not dropped', async () => {
    const orphan = LESSON.replace(
      '</pages>',
      `<page id="12">
        <prevpageid>999</prevpageid>
        <nextpageid>0</nextpageid>
        <qtype>10</qtype>
        <title>Orphaned page</title>
        <contents>Still authored content.</contents>
      </page></pages>`,
    )
    const lesson = await parseLessonXml(orphan)
    expect(lesson.pages.map((p) => p.id)).toEqual([10, 11, 12])
    expect(lesson.pages[2]?.kind).toBe('essay')
  })

  test('a chain that loops back on itself terminates', async () => {
    const looped = LESSON.replace('<nextpageid>0</nextpageid>', '<nextpageid>10</nextpageid>')
    const lesson = await parseLessonXml(looped)
    expect(lesson.pages.map((p) => p.id)).toEqual([10, 11])
  })

  test('an unknown page type degrades instead of failing', async () => {
    const odd = await parseLessonXml(LESSON.replace('<qtype>3</qtype>', '<qtype>77</qtype>'))
    expect(odd.pages[1]?.kind).toBe('unknown')
  })

  test('a lesson with no pages parses to none', async () => {
    const empty = await parseLessonXml(LESSON.replace(/<pages>[\s\S]*<\/pages>/, '<pages></pages>'))
    expect(empty.pages).toEqual([])
  })
})

// Verified against a real Moodle 5.2.2 content-only backup: an answer whose
// jumpto is page id 2 was being read as LESSON_UNANSWEREDPAGE. Moodle's own
// lesson_page::get_jump_name() only special-cases 0 and the negatives; 1 and 2
// belong to the lesson-level nextpagedefault setting, never to an answer.
describe('jump targets that collide with page ids', () => {
  const withJump = (jumpto: number): string =>
    `<?xml version="1.0"?>
<activity id="1" moduleid="1" modulename="lesson" contextid="1"><lesson id="1"><pages>
  <page id="1"><prevpageid>0</prevpageid><nextpageid>2</nextpageid><qtype>20</qtype>
    <title>First</title><contents>a</contents>
    <answers><answer id="1"><jumpto>${jumpto}</jumpto><grade>0</grade>
      <answer_text>Go</answer_text><response></response></answer></answers>
  </page>
  <page id="2"><prevpageid>1</prevpageid><nextpageid>0</nextpageid><qtype>3</qtype>
    <title>Second</title><contents>b</contents></page>
</pages></lesson></activity>`

  test('a small positive jumpto is a page id, not a constant', async () => {
    for (const id of [1, 2]) {
      const lesson = await parseLessonXml(withJump(id))
      expect(lesson.pages[0]?.answers[0]?.jump).toEqual({ kind: 'page', pageId: id })
    }
  })

  test('the constants Moodle does test are still named', async () => {
    const cases: Array<[number, LessonJumpKind]> = [
      [0, 'thisPage'],
      [-1, 'nextPage'],
      [-9, 'endOfLesson'],
      [-40, 'previousPage'],
      [-50, 'unseenBranchPage'],
      [-60, 'randomPage'],
      [-70, 'randomBranch'],
      [-80, 'clusterJump'],
    ]
    for (const [value, kind] of cases) {
      const lesson = await parseLessonXml(withJump(value))
      expect(lesson.pages[0]?.answers[0]?.jump.kind).toBe(kind)
    }
  })
})
