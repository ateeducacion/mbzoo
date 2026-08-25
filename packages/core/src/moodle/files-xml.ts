/**
 * Parser for files.xml — indexes the content-addressed file pool
 * (research/Q-003). Observed shape (Moodle 3.3/3.8, REPO-004):
 *   <files><file id="798"><contenthash>…</contenthash><contextid>…</contextid>
 *     <component>course</component><filearea>legacy</filearea><itemid>0</itemid>
 *     <filepath>/css/</filepath><filename>.</filename><userid>8</userid>
 *     <filesize>0</filesize><mimetype>$@NULL@$</mimetype>…
 *
 * Moodle encodes SQL NULL as the literal string "$@NULL@$".
 */
import type { BackupFileRecord } from '../model/backup.ts'
import { parseXmlEvents } from './xml.ts'

/** Moodle's serialized NULL sentinel (lib/moodlelib.php). */
export const NULL_SENTINEL = '$@NULL@$'

function orNull(v: string): string {
  return v === NULL_SENTINEL ? '' : v
}

export async function parseFilesXml(xml: string): Promise<Map<string, BackupFileRecord>> {
  const files = new Map<string, BackupFileRecord>()
  const path: string[] = []
  let text = ''
  let current: Partial<Record<keyof BackupFileRecord, string>> | undefined

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'file') current = {}
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    const p = path.join('/')
    if (current && p.startsWith('files/file/')) {
      const key = FIELD_MAP.get(leaf(p))
      if (key) current[key] = text.trim()
    }
    if (ev.name === 'file' && current) {
      const hash = orNull(current.contentHash ?? '')
      if (hash !== '') {
        files.set(fileKey(current), toRecord(current))
      }
      current = undefined
    }
    path.pop()
    text = ''
  })
  return files
}

function leaf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

const FIELD_MAP = new Map<string, keyof BackupFileRecord>([
  ['contenthash', 'contentHash'],
  ['contextid', 'contextId'],
  ['component', 'component'],
  ['filearea', 'fileArea'],
  ['itemid', 'itemId'],
  ['filepath', 'filePath'],
  ['filename', 'fileName'],
  ['filesize', 'fileSize'],
  ['mimetype', 'mimeType'],
])

/**
 * Key for deduplicating file records: content + location tuple. Multiple
 * records can share one contenthash.
 */
export function fileKey(r: Partial<Record<keyof BackupFileRecord, string>>): string {
  return [
    r.contextId ?? '',
    r.component ?? '',
    r.fileArea ?? '',
    r.itemId ?? '',
    r.filePath ?? '',
    r.fileName ?? '',
  ].join('|')
}

function toRecord(r: Partial<Record<keyof BackupFileRecord, string>>): BackupFileRecord {
  return {
    contentHash: orNull(r.contentHash ?? ''),
    filePath: orNull(r.filePath ?? '/'),
    fileName: orNull(r.fileName ?? ''),
    mimeType: orNull(r.mimeType ?? ''),
    fileSize: Number(orNull(r.fileSize ?? '0')) || 0,
    component: orNull(r.component ?? ''),
    fileArea: orNull(r.fileArea ?? ''),
    itemId: orNull(r.itemId ?? '0'),
    contextId: orNull(r.contextId ?? ''),
  }
}
