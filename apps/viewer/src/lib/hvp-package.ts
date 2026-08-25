/**
 * Composes an H5P package from what mod_hvp stores (ADR-0031).
 *
 * mod_hvp — the H5P plugin every real backup in the corpus uses (AN-008:
 * 106 activities across four courses, 0 of them with a `.h5p` file) — does
 * not keep the uploaded package. It keeps three things instead:
 *
 * - `hvp.xml`: `machine_name`, `major_version`, `minor_version` of the main
 *   library, `json_content` (the content parameters), name and licence;
 * - the `libraries` file area, one folder per library version
 *   (`/H5P.MultiChoice-1.13/library.json`, …), course-wide at itemid 0;
 * - the `content` file area, the activity's own media, keyed by itemid = the
 *   hvp instance id.
 *
 * The ADR-0018 player takes a Map of package paths to bytes, so those three
 * are folded into the shape a `.h5p` would have had: `h5p.json`,
 * `content/content.json`, `content/<media>` and `<Library-x.y>/<files>`.
 * Only libraries the main library transitively depends on are included —
 * a course ships around a hundred, a piece of content needs five to ten.
 */
import type { BackupFileRecord } from '@mbzoo/core'
import type { H5pEntries } from './h5p-player.ts'

export interface HvpFields {
  readonly machineName: string
  readonly majorVersion: string
  readonly minorVersion: string
  readonly jsonContent: string
  readonly title: string
  readonly license: string
}

/** Bytes of libraries + media a composed package may reach; beyond it, refuse. */
export const MAX_HVP_PACKAGE_BYTES = 96 * 1024 * 1024
const MAX_LIBRARIES = 200

interface Dependency {
  machineName: string
  majorVersion: number
  minorVersion: number
}

/** Reads the hvp.xml leaf fields the composer needs; undefined when absent. */
export function hvpFields(fields: ReadonlyMap<string, string>): HvpFields | undefined {
  const machineName = fields.get('machine_name')?.trim() ?? ''
  const majorVersion = fields.get('major_version')?.trim() ?? ''
  const minorVersion = fields.get('minor_version')?.trim() ?? ''
  const jsonContent = fields.get('json_content') ?? ''
  if (!/^[A-Za-z][\w.]*$/.test(machineName) || !/^\d+$/.test(majorVersion)) return undefined
  if (!/^\d+$/.test(minorVersion) || jsonContent === '') return undefined
  return {
    machineName,
    majorVersion,
    minorVersion,
    jsonContent,
    title: fields.get('name') ?? '',
    license: fields.get('license') ?? 'U',
  }
}

/**
 * Libraries a content's parameters name as sub-content, in H5P's canonical
 * `"library": "H5P.Name 1.2"` form. The parameters are hostile input, so
 * each name is validated exactly as the main library's is.
 */
export function subContentLibraries(jsonContent: string): Dependency[] {
  const out: Dependency[] = []
  const seen = new Set<string>()
  for (const m of jsonContent.matchAll(/"library"\s*:\s*"([A-Za-z][\w.]*) (\d+)\.(\d+)"/g)) {
    const key = `${m[1]}-${m[2]}.${m[3]}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ machineName: m[1] ?? '', majorVersion: Number(m[2]), minorVersion: Number(m[3]) })
  }
  return out
}

function folderOf(dep: Dependency): string {
  return `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`
}

function dedupeDependencies(deps: Dependency[]): Dependency[] {
  const seen = new Set<string>()
  const out: Dependency[] = []
  for (const d of deps) {
    const key = folderOf(d)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

function asDependencies(value: unknown): Dependency[] {
  if (!Array.isArray(value)) return []
  const out: Dependency[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const d = item as Record<string, unknown>
    const machineName = typeof d.machineName === 'string' ? d.machineName : ''
    const majorVersion = Number(d.majorVersion)
    const minorVersion = Number(d.minorVersion)
    if (!/^[A-Za-z][\w.]*$/.test(machineName)) continue
    if (!Number.isInteger(majorVersion) || !Number.isInteger(minorVersion)) continue
    out.push({ machineName, majorVersion, minorVersion })
  }
  return out
}

/**
 * Builds the package Map. `read` fetches a record's bytes; it is passed in so
 * the composition is testable without an archive.
 */
export async function composeHvpEntries(
  hvp: HvpFields,
  instanceId: string,
  records: Iterable<BackupFileRecord>,
  read: (record: BackupFileRecord) => Promise<Uint8Array | undefined>,
): Promise<H5pEntries> {
  const libraryFiles = new Map<string, BackupFileRecord[]>()
  const media: BackupFileRecord[] = []
  for (const r of records) {
    if (r.component !== 'mod_hvp' || r.fileName === '.' || r.fileSize <= 0) continue
    if (r.fileArea === 'libraries') {
      const folder = r.filePath.split('/')[1] ?? ''
      if (folder === '') continue
      const list = libraryFiles.get(folder) ?? []
      list.push(r)
      libraryFiles.set(folder, list)
    } else if (r.fileArea === 'content' && r.itemId === instanceId) {
      media.push(r)
    }
  }

  const entries: H5pEntries = new Map()
  let budget = MAX_HVP_PACKAGE_BYTES
  const put = async (key: string, r: BackupFileRecord): Promise<void> => {
    const bytes = await read(r)
    if (!bytes) throw new Error(`unreadable package file: ${key}`)
    budget -= bytes.byteLength
    if (budget < 0) throw new Error('composed H5P package exceeds the size budget')
    entries.set(key, bytes)
  }

  const main: Dependency = {
    machineName: hvp.machineName,
    majorVersion: Number(hvp.majorVersion),
    minorVersion: Number(hvp.minorVersion),
  }
  // Sub-content libraries are named by the parameters, not by the main
  // library's manifest: a DocumentationTool page is "H5P.StandardPage 1.5"
  // inside json_content, and a video's poster is "H5P.Image 1.1". A server
  // learns them from its content-libraries table, which mod_hvp does not
  // back up; the parameters are the only record the backup carries. Verified
  // on the corpus, where every "Unable to find constructor" was one of these.
  const roots: Dependency[] = [main, ...subContentLibraries(hvp.jsonContent)]
  const visited = new Set<string>()
  const visit = async (dep: Dependency): Promise<void> => {
    const folder = folderOf(dep)
    if (visited.has(folder)) return
    if (visited.size >= MAX_LIBRARIES) throw new Error('too many H5P libraries')
    visited.add(folder)
    const files = libraryFiles.get(folder)
    if (!files) throw new Error(`library not in backup: ${folder}`)
    for (const r of files)
      await put(`${folder}/${r.filePath.slice(folder.length + 2)}${r.fileName}`, r)
    const definition = entries.get(`${folder}/library.json`)
    if (!definition) throw new Error(`library without library.json: ${folder}`)
    let parsed: unknown
    try {
      parsed = JSON.parse(new TextDecoder().decode(definition))
    } catch {
      throw new Error(`malformed library.json: ${folder}`)
    }
    const deps = asDependencies((parsed as Record<string, unknown>).preloadedDependencies)
    for (const d of deps) await visit(d)
  }
  for (const root of roots) await visit(root)

  for (const r of media) {
    await put(`content${r.filePath}${r.fileName}`, r)
  }

  const enc = new TextEncoder()
  entries.set('content/content.json', enc.encode(hvp.jsonContent))
  // Every top-level library the content needs must be listed here: the
  // player inlines scripts by walking this list, so a sub-content library
  // that is only in the filesystem loads no code and its constructor is
  // never defined ("Unable to find constructor for H5P.AdvancedText"). The
  // roots are exactly main + the libraries the parameters name.
  const preloadedDependencies = dedupeDependencies(roots)
  entries.set(
    'h5p.json',
    enc.encode(
      JSON.stringify({
        title: hvp.title,
        language: 'und',
        mainLibrary: hvp.machineName,
        embedTypes: ['div'],
        license: hvp.license,
        preloadedDependencies,
      }),
    ),
  )
  return entries
}
