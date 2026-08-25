/**
 * Per-activity export helpers (ADR-0016).
 *
 * Scope is deliberately one activity at a time: the activity's module XML,
 * the HTML the Preview tab already sanitized, or its attached files as a
 * ZIP. Whole-backup re-packaging is a separate, still-planned problem.
 *
 * DOM-free on purpose so it is unit-testable under Bun; the download
 * trigger itself lives in the detail panel.
 */

import { zipSync } from 'fflate'

export type ExportKind = 'xml' | 'html' | 'zip'

/** The subset of ActivityInfo an export needs. */
export interface ExportTarget {
  readonly id: number
  readonly moduleName: string
  readonly title: string
}

export interface ZipEntry {
  readonly name: string
  readonly data: Uint8Array
}

/** Keeps names comfortably inside filesystem limits after the browser
 *  appends its own " (1)" style suffixes on collision. */
const MAX_NAME = 100

/** ASCII slug: accents folded, everything else collapsed to hyphens. */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Download name for an activity export. Slugging is what keeps a hostile
 * backup title from steering the download: separators and traversal
 * segments cannot survive the character class above.
 */
export function exportFileName(target: ExportTarget, kind: ExportKind): string {
  const base = `${slug(target.moduleName) || 'activity'}-${target.id}`
  const extension = `.${kind}`
  const title = slug(target.title)
  if (title === '') return `${base}${extension}`

  const room = MAX_NAME - base.length - extension.length - 1
  const trimmed = title.slice(0, Math.max(0, room)).replace(/-+$/, '')
  return trimmed === '' ? `${base}${extension}` : `${base}-${trimmed}${extension}`
}

/** Drops any directory part: a ZIP entry must not escape its own folder. */
function flatName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  return base === '' || base === '.' || base === '..' ? 'file' : base
}

/** Suffixes duplicates as name-2.ext, name-3.ext, … */
function uniqueName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) {
    taken.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${extension}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
}

/**
 * Packs an activity's files into a flat ZIP. Moodle stores files by content
 * hash, so two different paths routinely share a file name — colliding
 * names are disambiguated rather than silently overwritten.
 */
export function buildActivityZip(entries: readonly ZipEntry[]): Uint8Array {
  const taken = new Set<string>()
  const payload: Record<string, Uint8Array> = {}
  for (const entry of entries) {
    payload[uniqueName(taken, flatName(entry.name))] = entry.data
  }
  return zipSync(payload, { level: 6 })
}
