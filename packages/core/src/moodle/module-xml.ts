/**
 * module.xml — per-activity Moodle settings, first-class (inspired by
 * cloudpedagogy settings analyser, REPO-006).
 * Verified shape (Moodle 3.x, REPO-004/SMR_SEGI): visible, idnumber,
 * groupmode, groupingid, completion, availability (JSON or $@NULL@$).
 */

import { type AvailabilitySummary, humanizeAvailability } from './availability.ts'
import { NULL_SENTINEL } from './files-xml.ts'
import { parseXmlEvents } from './xml.ts'

export interface ActivitySettings {
  readonly visible: boolean
  readonly idNumber: string
  readonly groupMode: 'none' | 'separate' | 'visible'
  readonly groupingId: number
  readonly completion: 'none' | 'manual' | 'automatic' | 'unknown'
  readonly completionExpected: number
  readonly showDescription: boolean
  readonly availability: AvailabilitySummary
}

const GROUP_MODES: Record<string, ActivitySettings['groupMode']> = {
  '0': 'none',
  '1': 'separate',
  '2': 'visible',
}

const COMPLETION_MODES: Record<string, ActivitySettings['completion']> = {
  '0': 'none',
  '1': 'manual',
  '2': 'automatic',
}

export async function parseModuleXml(xml: string): Promise<ActivitySettings> {
  const fields = new Map<string, string>()
  const path: string[] = []
  let text = ''
  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    if (path.length === 2 && path[0] === 'module' && path[1] !== undefined) {
      fields.set(path[1], text.trim())
    }
    path.pop()
    text = ''
  })

  const availabilityRaw = fields.get('availability') ?? ''
  const availability: AvailabilitySummary =
    availabilityRaw === '' || availabilityRaw === NULL_SENTINEL
      ? { kind: 'none', conditions: [] }
      : humanizeAvailability(availabilityRaw)

  const groupMode = GROUP_MODES[fields.get('groupmode') ?? '0'] ?? 'none'
  const completion = COMPLETION_MODES[fields.get('completion') ?? '0'] ?? 'unknown'
  return {
    visible: (fields.get('visible') ?? '1') === '1',
    idNumber: fields.get('idnumber') === NULL_SENTINEL ? '' : (fields.get('idnumber') ?? ''),
    groupMode,
    groupingId: Number(fields.get('groupingid') ?? '0') || 0,
    completion,
    completionExpected: Number(fields.get('completionexpected') ?? '0') || 0,
    showDescription: (fields.get('showdescription') ?? '0') === '1',
    availability,
  }
}
