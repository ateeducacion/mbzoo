/**
 * Glossary entries parser (read-only). Shape per Moodle 2.x/3.x backups:
 *   <glossary><entries><entry id="…">
 *     <concept>text</concept><definition>&lt;p&gt;…&lt;/p&gt;</definition>
 * (text-wrapper variants accepted). [PENDING: verification required —
 * no committed fixture had a populated glossary; shape from REPO-005.]
 */
import { leafValue, parseXmlEvents } from './xml.ts'

export interface GlossaryEntry {
  readonly concept: string
  readonly definition: string
}

export async function parseGlossaryXml(xml: string): Promise<GlossaryEntry[]> {
  const entries: GlossaryEntry[] = []
  const path: string[] = []
  let text = ''
  let current: { concept: string; definition: string } | undefined
  let conceptDone = false
  let definitionDone = false

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'entry' && path[path.length - 1] === 'entries') {
        current = { concept: '', definition: '' }
        conceptDone = false
        definitionDone = false
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    if (current) {
      const leaf = path[path.length - 1]
      const parent = path[path.length - 2]
      if (leaf === 'entry' && parent === 'entries') {
        if (current.concept) entries.push(current)
        current = undefined
      } else if (leaf === 'concept' && !conceptDone) {
        current.concept = leafValue(text)
        conceptDone = true
      } else if (leaf === 'text' && parent === 'concept' && !conceptDone) {
        current.concept = leafValue(text)
        conceptDone = true
      } else if (leaf === 'definition' && !definitionDone) {
        current.definition = leafValue(text)
        definitionDone = true
      } else if (leaf === 'text' && parent === 'definition' && !definitionDone) {
        current.definition = leafValue(text)
        definitionDone = true
      }
    }
    path.pop()
    text = ''
  })
  return entries
}
