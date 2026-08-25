/**
 * Moodle SCORM parser.
 *
 * Moodle has already flattened the package's `imsmanifest.xml` into rows by
 * the time a backup is written, so `scorm.xml` carries the course structure
 * directly and MBZoo does not have to read the manifest to build a table of
 * contents. Shape, from the backup step definition that produces it
 * (mod/scorm/backup/moodle2/backup_scorm_stepslib.php:39-61):
 *
 *   <activity><scorm id=""><name>…<version>…<launch>…
 *     <scoes><sco id=""><manifest><organization><parent><identifier>
 *       <launch><scormtype><title><sortorder>
 *       <sco_datas><sco_data><name>…</name><value>…</value>
 *
 * The eXeLearning fork (mod_exescorm) renames the module element to
 * `exescorm` and the type field to `exescormtype`, and is otherwise
 * identical, so both are accepted here.
 */
import { parseXmlEvents } from './xml.ts'

/** One row of the course structure: an organization, an item or an asset. */
export interface ScormSco {
  readonly id: number
  readonly identifier: string
  /** Identifier of the enclosing item, the organization, or '/' for a root. */
  readonly parent: string
  readonly organization: string
  readonly title: string
  /** Relative path inside the package, '' when this row cannot be launched. */
  readonly launch: string
  /** 'sco', 'asset' or '' for the organization row itself. */
  readonly scormType: string
  readonly sortOrder: number
  /** From sco_data `isvisible`; absent means visible. */
  readonly visible: boolean
  /** From sco_data `parameters`; appended to launch by Moodle at runtime. */
  readonly parameters: string
}

export interface MoodleScorm {
  readonly name: string
  readonly intro: string
  /** 'SCORM_1.2', 'SCORM_1.3', 'AICC' or '' — never trusted beyond a hint. */
  readonly version: string
  /** 'local', 'localsync', 'external' or 'aiccurl'. */
  readonly packageType: string
  readonly reference: string
  readonly scoes: ScormSco[]
}

interface MutableSco {
  id: number
  identifier: string
  parent: string
  organization: string
  title: string
  launch: string
  scormType: string
  sortOrder: number
  visible: boolean
  parameters: string
}

const MODULE_ELEMENTS = new Set(['scorm', 'exescorm'])

function emptySco(): MutableSco {
  return {
    id: Number.NaN,
    identifier: '',
    parent: '',
    organization: '',
    title: '',
    launch: '',
    scormType: '',
    sortOrder: 0,
    visible: true,
    parameters: '',
  }
}

export async function parseScormXml(xml: string): Promise<MoodleScorm> {
  let name = ''
  let intro = ''
  let version = ''
  let packageType = ''
  let reference = ''
  const scoes: MutableSco[] = []

  const path: string[] = []
  let text = ''
  let current: MutableSco | undefined
  // sco_data is a name/value pair, so both leaves must be buffered before
  // either can be used.
  let dataName = ''
  let dataValue = ''

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'sco' && path[path.length - 1] === 'scoes') {
        current = emptySco()
        const id = ev.attributes.id
        if (id !== undefined) current.id = Number(id)
      }
      if (ev.name === 'sco_data') {
        dataName = ''
        dataValue = ''
      }
      path.push(ev.name)
      text = ''
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const leaf = path[path.length - 1]
    const parent = path[path.length - 2]
    const value = text.trim()
    text = ''
    path.pop()

    if (leaf === 'sco' && parent === 'scoes') {
      if (current) scoes.push(current)
      current = undefined
      return
    }

    if (current) {
      if (parent === 'sco_data') {
        if (leaf === 'name') dataName = value
        if (leaf === 'value') dataValue = value
        return
      }
      if (leaf === 'sco_data') {
        // isvisible is stored as Moodle's boolean-ish string.
        if (dataName === 'isvisible') current.visible = value !== '0' && dataValue !== '0'
        if (dataName === 'parameters') current.parameters = dataValue
        return
      }
      if (parent === 'sco') {
        if (leaf === 'identifier') current.identifier = value
        else if (leaf === 'parent') current.parent = value
        else if (leaf === 'organization') current.organization = value
        else if (leaf === 'title') current.title = value
        else if (leaf === 'launch') current.launch = value
        else if (leaf === 'scormtype' || leaf === 'exescormtype') current.scormType = value
        else if (leaf === 'sortorder') current.sortOrder = Number(value) || 0
      }
      return
    }

    if (parent !== undefined && MODULE_ELEMENTS.has(parent)) {
      if (leaf === 'name') name = value
      else if (leaf === 'intro') intro = value
      else if (leaf === 'version') version = value
      else if (leaf === 'reference') reference = value
      else if (leaf === 'scormtype' || leaf === 'exescormtype') packageType = value
    }
  })

  scoes.sort((a, b) => a.sortOrder - b.sortOrder)
  return { name, intro, version, packageType, reference, scoes }
}

/**
 * The row a reader should land on.
 *
 * Moodle tests launchability as a non-empty `launch`, never as
 * `scormtype === 'sco'` — an asset with an href is launchable, and the type
 * only gates CMI tracking (mod/scorm/datamodels/scormlib.php:736,746-748).
 * The stored `scorm.launch` is a foreign key that restore may leave stale
 * (restore_scorm_stepslib.php:201-227), so it is recomputed here rather than
 * trusted.
 */
export function defaultLaunchSco(scoes: readonly ScormSco[]): ScormSco | undefined {
  return scoes.find((s) => s.launch !== '' && s.visible) ?? scoes.find((s) => s.launch !== '')
}

/** True when the package declares SCORM 2004 rather than 1.2. */
export function isScorm2004(version: string): boolean {
  return version.trim().toUpperCase() === 'SCORM_1.3'
}

/** A launchable entry from a raw `imsmanifest.xml` (not Moodle's scorm.xml). */
export interface ImsItem {
  readonly title: string
  /** Resource href, relative to the package root. */
  readonly href: string
}

export interface ImsManifest {
  /** Raw `<schemaversion>` text, e.g. "CAM 1.3" or "2004 4th Edition". */
  readonly schemaVersion: string
  readonly scorm2004: boolean
  /** Default organization's items, in document order, that resolve to an href. */
  readonly items: readonly ImsItem[]
}

interface MutableItem {
  org: string
  ref: string
  title: string
}

/**
 * Parses a Content Packaging `imsmanifest.xml` — the manifest a raw SCORM zip
 * ships, distinct from Moodle's flattened `scorm.xml` (parseScormXml). Returns
 * the default organization's launchable items resolved against `<resources>`.
 * xml:base is not honoured yet — no observed package (REPO-004, Ejemplos) uses
 * it; a package that does would get slightly wrong hrefs, never a crash.
 */
export async function parseImsManifest(xml: string): Promise<ImsManifest> {
  let orgDefault = ''
  let firstOrg = ''
  let curOrg = ''
  let schemaVersion = ''
  const itemStack: MutableItem[] = []
  const items: MutableItem[] = []
  const resources = new Map<string, string>()

  const path: string[] = []
  let text = ''

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'organizations') orgDefault = ev.attributes.default ?? ''
      else if (ev.name === 'organization') {
        curOrg = ev.attributes.identifier ?? ''
        if (firstOrg === '') firstOrg = curOrg
      } else if (ev.name === 'item') {
        itemStack.push({ org: curOrg, ref: ev.attributes.identifierref ?? '', title: '' })
      } else if (ev.name === 'resource') {
        const id = ev.attributes.identifier
        const href = ev.attributes.href
        if (id !== undefined && href !== undefined && href !== '') resources.set(id, href)
      }
      path.push(ev.name)
      text = ''
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }
    const leaf = path[path.length - 1]
    const parent = path[path.length - 2]
    const value = text.trim()
    text = ''
    path.pop()

    if (leaf === 'title' && parent === 'item') {
      const top = itemStack[itemStack.length - 1]
      if (top && top.title === '') top.title = value
    } else if (leaf === 'schemaversion') schemaVersion = value
    else if (leaf === 'item') {
      const done = itemStack.pop()
      if (done) items.push(done)
    } else if (leaf === 'organization') curOrg = ''
  })

  const org = orgDefault !== '' && items.some((i) => i.org === orgDefault) ? orgDefault : firstOrg
  const resolved: ImsItem[] = []
  for (const it of items) {
    if (it.org !== org) continue
    const href = resources.get(it.ref)
    if (href) resolved.push({ title: it.title, href })
  }
  return { schemaVersion, scorm2004: /2004/.test(schemaVersion), items: resolved }
}
