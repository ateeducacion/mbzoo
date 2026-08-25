/**
 * Validates research records: ID grammar/uniqueness and required frontmatter
 * per record type. Exits non-zero on the first class of failure (ADR-0010).
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
let errors = 0

function fail(path: string, msg: string): void {
  console.error(`✗ ${path}: ${msg}`)
  errors++
}

function frontmatter(text: string): Record<string, string> | undefined {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return undefined
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

async function records(
  rel: string,
): Promise<Map<string, { fm: Record<string, string>; path: string }>> {
  const dir = join(ROOT, rel)
  const map = new Map<string, { fm: Record<string, string>; path: string }>()
  let files: string[] = []
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.md'))
  } catch {
    return map
  }
  for (const f of files) {
    const path = `${rel}/${f}`
    const fm = frontmatter(await readFile(join(dir, f), 'utf8'))
    if (!fm) {
      fail(path, 'missing frontmatter block')
      continue
    }
    if (!fm.id) fail(path, 'frontmatter lacks id')
    else if (map.has(fm.id)) fail(path, `duplicate id ${fm.id}`)
    else map.set(fm.id, { fm, path })
  }
  return map
}

const REQUIRED: Array<[string, string[], RegExp]> = [
  ['decisions/adr', ['id', 'title', 'status', 'date'], /^ADR-\d{4}$/],
  ['experiments/results', ['id', 'title', 'status', 'date'], /^EXP-\d{3}$/],
]

for (const [dir, fields, pattern] of REQUIRED) {
  for (const [id, { fm, path }] of await records(dir)) {
    if (!pattern.test(id)) fail(path, `id ${id} does not match ${pattern}`)
    for (const f of fields) {
      if (!fm[f]) fail(path, `missing frontmatter field "${f}"`)
    }
    if (
      fm.status &&
      !['Proposed', 'Accepted', 'Rejected', 'Superseded'].includes(fm.status) &&
      dir === 'decisions/adr'
    ) {
      fail(path, `invalid ADR status "${fm.status}"`)
    }
  }
}

// Sources: three subdirectories share the ID namespace.
const sourceDirs = ['sources/repositories', 'sources/standards', 'sources/technologies']
const allSources = new Map<string, unknown>()
for (const d of sourceDirs) {
  for (const [id, rec] of await records(d)) {
    if (!/^(REPO|STD|TECH)-\d{3}$/.test(id)) fail(rec.path, `bad source id ${id}`)
    for (const f of ['title', 'url', 'accessed']) {
      if (!rec.fm[f]) fail(rec.path, `missing frontmatter field "${f}"`)
    }
    if (allSources.has(id)) fail(rec.path, `duplicate source id ${id}`)
    allSources.set(id, rec)
  }
}

// Cross-references in ADRs must point at registered sources/experiments.
for (const [, { fm, path }] of await records('decisions/adr')) {
  for (const field of ['sources', 'experiments']) {
    const raw = (fm[field] ?? '').replace(/[[\]]/g, '')
    for (const ref of raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const known = allSources.has(ref) || (await records('experiments/results')).has(ref)
      if (!known) fail(path, `${field} references unregistered ${ref}`)
    }
  }
}

if (errors > 0) {
  console.error(`research validation failed with ${errors} error(s)`)
  process.exit(1)
}
console.log('research validation passed')
