/**
 * Moodle Book parser. Shape (Moodle 3.x backup, REPO-005; [PENDING:
 * verification required — no real book sample available at time of
 * writing]): <book><name>…<chapters><chapter id="">
 *   <parent>…<weight>…<subchapter>0|1…<title>…<content>escaped HTML
 */
import { parseXmlEvents } from './xml.ts'

export interface BookChapter {
  readonly id: number
  readonly title: string
  readonly content: string
  readonly subchapter: boolean
  readonly weight: number
}

export interface MoodleBook {
  readonly name: string
  readonly intro: string
  readonly chapters: BookChapter[]
}

interface MutableChapter {
  id: number
  title: string
  content: string
  subchapter: boolean
  weight: number
}

export async function parseBookXml(xml: string): Promise<MoodleBook> {
  let name = ''
  let intro = ''
  const chapters: MutableChapter[] = []
  const path: string[] = []
  let text = ''
  let current: MutableChapter | undefined
  let titleDone = false
  let contentDone = false
  let nameDone = false
  let introDone = false

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'chapter' && path[path.length - 1] === 'chapters') {
        current = { id: Number.NaN, title: '', content: '', subchapter: false, weight: 0 }
        titleDone = false
        contentDone = false
        const idAttr = ev.attributes.id
        if (current && idAttr !== undefined) current.id = Number(idAttr)
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    const leaf = path[path.length - 1]
    const parent = path[path.length - 2]
    if (leaf === 'book' && path.length === 2) {
      if (leaf === undefined) {
        // unreachable; keeps TS happy
      }
    }
    if (leaf === 'name' && parent === 'book' && !nameDone) {
      name = text.trim()
      nameDone = true
    } else if (leaf === 'intro' && parent === 'book' && !introDone) {
      intro = text.trim()
      introDone = true
    } else if (leaf === 'text' && parent === 'name' && !nameDone) {
      name = text.trim()
      nameDone = true
    } else if (leaf === 'text' && parent === 'intro' && !introDone) {
      intro = text.trim()
      introDone = true
    } else if (current) {
      if (leaf === 'chapter' && parent === 'chapters') {
        if (Number.isFinite(current.id)) chapters.push(current)
        current = undefined
      } else if (leaf === 'title' && parent === 'chapter' && !titleDone) {
        current.title = text.trim()
        titleDone = true
      } else if (leaf === 'content' && parent === 'chapter' && !contentDone) {
        current.content = text.trim()
        contentDone = true
      } else if (leaf === 'subchapter' && parent === 'chapter') {
        current.subchapter = text.trim() === '1'
      } else if (leaf === 'weight' && parent === 'chapter') {
        const n = Number(text.trim())
        if (Number.isFinite(n)) current.weight = n
      }
    }
    path.pop()
    text = ''
  })

  chapters.sort((a, b) => a.weight - b.weight)
  return { name, intro, chapters }
}
