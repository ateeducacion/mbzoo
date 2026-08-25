/**
 * Generic activity payload parser (ADR-0013 capability model, inspect level).
 *
 * Instead of one parser per Moodle plugin, this captures the activity's
 * root attributes (id/moduleid/modulename/contextid) plus every leaf field
 * under the module element (bounded depth). Module-specific renderers pick
 * the fields they understand; unknown plugins degrade gracefully.
 */
import { NULL_SENTINEL } from './files-xml.ts'
import { parseXmlEvents } from './xml.ts'

export interface ParsedActivity {
  readonly contextId: string
  readonly moduleName: string
  readonly fields: Map<string, string>
}

const MAX_ACTIVITY_XML_BYTES = 32 * 1024 * 1024

export async function parseActivityXml(xml: string): Promise<ParsedActivity> {
  if (xml.length > MAX_ACTIVITY_XML_BYTES) {
    throw new Error(`activity XML exceeds ${MAX_ACTIVITY_XML_BYTES} byte limit`)
  }
  let contextId = ''
  let moduleName = ''
  const fields = new Map<string, string>()
  const path: string[] = []
  let text = ''

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (path.length === 0 && ev.name === 'activity') {
        contextId = ev.attributes.contextid ?? ''
        moduleName = ev.attributes.modulename ?? ''
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    // Direct children of the plugin element: path is [activity, <page>, field].
    if (path.length === 3) {
      const key = path[2]
      if (key === undefined) return
      const existing = fields.get(key)
      const value = (existing === undefined ? text : `${existing}${text}`).trim()
      // Moodle serializes SQL NULL as a literal string; it is an absence, and
      // renderers that print field values must never show it as content.
      fields.set(key, value === NULL_SENTINEL ? '' : value)
    }
    path.pop()
    text = ''
  })
  return { contextId, moduleName, fields }
}

/**
 * Extracts filenames referenced via Moodle's @@PLUGINFILE@@ token inside
 * HTML content (REPO-005: tokens are stored verbatim in backup XML).
 */
export function extractPluginFileRefs(html: string): string[] {
  const out = new Set<string>()
  const re = /@@PLUGINFILE@@([^"'#\s)>]+)/g
  for (const m of html.matchAll(re)) {
    const name = m[1]
    if (name) out.add(decodeURIComponent(name.replace(/^\//, '')))
  }
  return [...out]
}

/**
 * Finds the files.xml record backing an @@PLUGINFILE@@ reference.
 * Match priority: exact component/filearea/context, then any record whose
 * filePath+fileName ends with the reference (backups vary in how content
 * areas were scoped).
 */
export function matchFileRecord(
  files: ReadonlyMap<string, import('../model/backup.ts').BackupFileRecord>,
  ref: {
    readonly fileName: string
    readonly contextId?: string | undefined
    readonly componentName?: string | undefined
    readonly fileArea?: string | undefined
  },
): import('../model/backup.ts').BackupFileRecord | undefined {
  let best: import('../model/backup.ts').BackupFileRecord | undefined
  for (const rec of files.values()) {
    if (!rec.fileName || rec.fileName === '.') continue
    if (rec.fileName !== ref.fileName) continue
    const scoped =
      (ref.contextId === undefined || rec.contextId === ref.contextId) &&
      (ref.componentName === undefined || rec.component === ref.componentName) &&
      (ref.fileArea === undefined || rec.fileArea === ref.fileArea)
    if (scoped) return rec
    best ??= rec
  }
  return best
}

/** Archive entry path for a content hash (REPO-005 pool layout). */
export function contentHashPath(contentHash: string): string {
  return `files/${contentHash.slice(0, 2)}/${contentHash}`
}
