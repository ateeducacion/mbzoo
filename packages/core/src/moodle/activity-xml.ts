/**
 * Generic activity payload parser (ADR-0013 capability model, inspect level).
 *
 * Instead of one parser per Moodle plugin, this captures the activity's
 * root attributes (id/moduleid/modulename/contextid) plus every leaf field
 * under the module element (bounded depth). Module-specific renderers pick
 * the fields they understand; unknown plugins degrade gracefully.
 */
import { leafValue, parseXmlEvents } from './xml.ts'

export interface ParsedActivity {
  readonly contextId: string
  readonly moduleName: string
  /**
   * The `<activity id>` root attribute: the plugin *instance* id, which is
   * not the course-module id the tree uses. File areas keyed per instance
   * (mod_hvp content) and delegated-section owners are addressed by it.
   */
  readonly instanceId: string
  readonly fields: Map<string, string>
}

const MAX_ACTIVITY_XML_BYTES = 32 * 1024 * 1024

export async function parseActivityXml(xml: string): Promise<ParsedActivity> {
  if (xml.length > MAX_ACTIVITY_XML_BYTES) {
    throw new Error(`activity XML exceeds ${MAX_ACTIVITY_XML_BYTES} byte limit`)
  }
  let contextId = ''
  let moduleName = ''
  let instanceId = ''
  const fields = new Map<string, string>()
  const path: string[] = []
  let text = ''

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (path.length === 0 && ev.name === 'activity') {
        contextId = ev.attributes.contextid ?? ''
        moduleName = ev.attributes.modulename ?? ''
        instanceId = ev.attributes.id ?? ''
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
      fields.set(key, leafValue(existing === undefined ? text : `${existing}${text}`))
    }
    path.pop()
    text = ''
  })
  return { contextId, moduleName, instanceId, fields }
}

/**
 * Reads a flat list of repeated records nested inside an activity payload,
 * e.g. <choice><options><option><text>…, <data><fields><field>…,
 * <workshop><examplesubmissions><examplesubmission>….
 *
 * These lists are the shape several modules use for their authored content,
 * and they sit one level below what parseActivityXml captures. Each record
 * becomes a map of its leaf fields plus its `id` attribute when present.
 */
export async function parseNestedRecords(
  xml: string,
  container: string,
  record: string,
): Promise<Array<Map<string, string>>> {
  if (xml.length > MAX_ACTIVITY_XML_BYTES) {
    throw new Error(`activity XML exceeds ${MAX_ACTIVITY_XML_BYTES} byte limit`)
  }
  const out: Array<Map<string, string>> = []
  const path: string[] = []
  let text = ''
  let current: Map<string, string> | undefined

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === record && path[path.length - 1] === container) {
        current = new Map()
        const id = ev.attributes.id
        if (id !== undefined) current.set('id', id)
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
      if (leaf === record && parent === container) {
        out.push(current)
        current = undefined
      } else if (parent === record && leaf !== undefined) {
        current.set(leaf, leafValue(text))
      }
    }
    path.pop()
    text = ''
  })
  return out
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
    /**
     * Record the file hangs off, for the file areas Moodle scopes per row
     * (`mod_lesson/page_contents` is keyed by page id, `mod_glossary/entry`
     * by entry id, `question/questiontext` by question id — REPO-005).
     * Without it, two lesson pages that each embed a `pic.png` are
     * indistinguishable and the first one found wins for both.
     */
    readonly itemId?: string | undefined
  },
): import('../model/backup.ts').BackupFileRecord | undefined {
  let best: import('../model/backup.ts').BackupFileRecord | undefined
  for (const rec of files.values()) {
    if (!rec.fileName || rec.fileName === '.') continue
    if (rec.fileName !== ref.fileName) continue
    const scoped =
      (ref.contextId === undefined || rec.contextId === ref.contextId) &&
      (ref.componentName === undefined || rec.component === ref.componentName) &&
      (ref.fileArea === undefined || rec.fileArea === ref.fileArea) &&
      (ref.itemId === undefined || rec.itemId === ref.itemId)
    if (scoped) return rec
    // A same-named file elsewhere is a last resort, and only when the caller
    // did not pin an itemid: with one, the wrong row is worse than nothing.
    if (ref.itemId === undefined) best ??= rec
  }
  return best
}

/** Archive entry path for a content hash (REPO-005 pool layout). */
export function contentHashPath(contentHash: string): string {
  return `files/${contentHash.slice(0, 2)}/${contentHash}`
}
