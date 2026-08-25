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
import { leafValue, NULL_SENTINEL, parseXmlEvents } from './xml.ts'

export { NULL_SENTINEL }

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
      if (key) current[key] = leafValue(text)
    }
    if (ev.name === 'file' && current) {
      const hash = current.contentHash ?? ''
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
  ['sortorder', 'sortOrder'],
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
    contentHash: leafValue(r.contentHash ?? ''),
    filePath: leafValue(r.filePath ?? '/'),
    fileName: leafValue(r.fileName ?? ''),
    mimeType: leafValue(r.mimeType ?? ''),
    fileSize: Number(leafValue(r.fileSize ?? '0')) || 0,
    component: leafValue(r.component ?? ''),
    fileArea: leafValue(r.fileArea ?? ''),
    itemId: leafValue(r.itemId ?? '0'),
    contextId: leafValue(r.contextId ?? ''),
    sortOrder: Number(leafValue(r.sortOrder ?? '0')) || 0,
  }
}
