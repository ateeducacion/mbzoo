/**
 * Course summary: what the detail pane shows before anything is selected
 * (mockup 3a). Backup provenance, size metrics, activities by module, the
 * gradebook structure and the parse warnings — the whole backup at a glance
 * instead of a blank panel.
 *
 * Security: every value here comes from a hostile backup and is written with
 * textContent. The type bars are plain divs whose width is a computed
 * percentage, so no backup-derived string ever reaches a style or attribute.
 */

import type { CourseGradebook, GradeItem, ParsedBackup } from '@mbzoo/core'
import { detectLang, t } from './lib/i18n.ts'
import { formatDate, formatNumber } from './lib/preview-utils.ts'

export interface SummaryDeps {
  readonly readEntry: (path: string) => Promise<Uint8Array>
  readonly badgeTone: (moduleName: string) => string
}

export interface SummaryFacts {
  /** Size of the .mbz as opened, in bytes. */
  readonly fileSize: number
  readonly elapsedMs: number
}

/** Module types drawn as bars; the rest are named in one line below them. */
const MAX_BARS = 8

/** Grade items listed in the compact gradebook block. */
const MAX_GRADE_ITEMS = 3

/** Grade letters spelled out before the ellipsis. */
const MAX_LETTERS = 2

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** "4.4 (Build: 20240422)" → "4.4"; the build stamp is noise in a headline. */
function releaseLabel(release: string): string {
  return release.trim().split(/\s+/)[0] ?? ''
}

/** Bytes as a number/unit pair so the unit can be set smaller, as in the mockup. */
function splitBytes(n: number, lang: string): { value: string; unit: string } {
  if (n < 1024) return { value: formatNumber(n, lang), unit: 'B' }
  if (n < 1024 * 1024) return { value: formatNumber(n / 1024, lang, 1), unit: 'KB' }
  return { value: formatNumber(n / (1024 * 1024), lang, 1), unit: 'MB' }
}

function tile(value: string, label: string, unit?: string): HTMLElement {
  const box = el('div', 'summary-tile')
  const big = el('div', 'summary-tile-value', value)
  if (unit) big.appendChild(el('span', 'summary-tile-unit', ` ${unit}`))
  box.append(big, el('div', 'summary-tile-label', label))
  return box
}

interface TypeCount {
  readonly moduleName: string
  readonly count: number
}

/** Module types by frequency, most common first; ties by name so order is stable. */
export function countByType(backup: ParsedBackup): TypeCount[] {
  const counts = new Map<string, number>()
  for (const activity of backup.activities) {
    counts.set(activity.moduleName, (counts.get(activity.moduleName) ?? 0) + 1)
  }
  return [...counts]
    .map(([moduleName, count]) => ({ moduleName, count }))
    .sort((a, b) => b.count - a.count || a.moduleName.localeCompare(b.moduleName))
}

function hiddenCount(backup: ParsedBackup): number {
  let hidden = 0
  for (const activity of backup.activities) {
    if (activity.settings && !activity.settings.visible) hidden++
  }
  return hidden
}

function buildTypes(backup: ParsedBackup, deps: SummaryDeps, lang: string): HTMLElement {
  const card = el('section', 'summary-card summary-types')
  card.appendChild(el('h4', 'summary-card-title', t('summary.byType')))

  const types = countByType(backup)
  const bars = el('div', 'summary-bars')
  const max = types[0]?.count ?? 0
  for (const { moduleName, count } of types.slice(0, MAX_BARS)) {
    const row = el('div', 'summary-bar-row')
    const tone = deps.badgeTone(moduleName)
    row.appendChild(el('span', `mod-badge ${tone}`.trim(), moduleName))
    const track = el('div', 'summary-bar')
    const fill = el('div', `summary-bar-fill ${tone}`.trim())
    fill.style.width = `${max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0}%`
    track.appendChild(fill)
    row.append(track, el('span', 'summary-bar-count', formatNumber(count, lang)))
    bars.appendChild(row)
  }
  card.appendChild(bars)

  const rest = types.slice(MAX_BARS).map((x) => `${x.moduleName} ${formatNumber(x.count, lang)}`)
  const hidden = hiddenCount(backup)
  const notes: string[] = []
  if (rest.length > 0) notes.push(`+ ${rest.join(' · ')}`)
  if (hidden > 0) notes.push(t('summary.hidden', { n: formatNumber(hidden, lang) }))
  if (notes.length > 0) card.appendChild(el('p', 'summary-more', notes.join(' · ')))
  return card
}

function itemLabel(item: GradeItem): string {
  return item.name || t(`gradebook.itemType.${item.itemType === 'course' ? 'course' : 'activity'}`)
}

function itemMax(item: GradeItem, lang: string): string {
  return item.kind === 'value'
    ? `/ ${formatNumber(item.max, lang, 2)}`
    : t(`grade.kind.${item.kind}`)
}

/**
 * The gradebook block: a compact view (course total, first items, letters)
 * with the full category tree folded underneath. Authored structure only —
 * the marks themselves never travel without user data.
 */
function buildGradebook(book: CourseGradebook, lang: string): HTMLElement {
  const card = el('section', 'summary-card summary-gradebook')
  card.appendChild(el('h4', 'summary-card-title', t('gradebook.title')))

  const rows = el('div', 'summary-grade-rows')
  const course = [...book.categories].sort((a, b) => a.depth - b.depth)[0]
  if (course) {
    const total = el('div', 'summary-grade-row summary-grade-total')
    total.append(
      el('b', undefined, t('gradebook.courseTotal')),
      el('span', undefined, t(`gradebook.aggregation.${course.aggregation}`)),
    )
    rows.appendChild(total)
  }
  const graded = book.items
    .filter((item) => item.itemType !== 'course' && item.itemType !== 'category')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  for (const item of graded.slice(0, MAX_GRADE_ITEMS)) {
    const row = el('div', 'summary-grade-row summary-grade-item')
    row.append(
      el('span', undefined, itemLabel(item)),
      el('em', 'gradebook-max', itemMax(item, lang)),
    )
    rows.appendChild(row)
  }
  const letters = [...book.letters].sort((a, b) => b.lowerBoundary - a.lowerBoundary)
  const notes: string[] = []
  const more = graded.length - MAX_GRADE_ITEMS
  if (more > 0) notes.push(t('summary.moreItems', { n: formatNumber(more, lang) }))
  if (letters.length > 0) {
    const shown = letters
      .slice(0, MAX_LETTERS)
      .map((l) => `${l.letter} ≥ ${formatNumber(l.lowerBoundary, lang, 2)}`)
    if (letters.length > MAX_LETTERS) shown.push('…')
    notes.push(`${t('summary.letters')} ${shown.join(' · ')}`)
  }
  if (notes.length > 0) rows.appendChild(el('p', 'summary-more', notes.join(' · ')))
  card.appendChild(rows)

  card.appendChild(buildGradebookTree(book, letters, lang))
  return card
}

/** The category tree behind a disclosure, as it was before the summary existed. */
function buildGradebookTree(
  book: CourseGradebook,
  letters: CourseGradebook['letters'],
  lang: string,
): HTMLElement {
  const details = el('details', 'advanced course-gradebook')
  details.appendChild(el('summary', undefined, t('gradebook.structure')))

  const byCategory = new Map<number, GradeItem[]>()
  for (const item of book.items) {
    byCategory.set(item.categoryId, [...(byCategory.get(item.categoryId) ?? []), item])
  }

  const list = el('ul', 'gradebook-tree')
  for (const category of [...book.categories].sort((a, b) => a.depth - b.depth)) {
    const li = el('li')
    li.style.marginLeft = `${Math.max(0, category.depth - 1) * 14}px`
    li.append(
      el('strong', undefined, category.name || t('gradebook.courseTotal')),
      ' ',
      el('em', 'gradebook-aggregation', t(`gradebook.aggregation.${category.aggregation}`)),
    )
    const items = byCategory.get(category.id) ?? []
    if (items.length > 0) {
      const sub = el('ul', 'gradebook-items')
      for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
        const row = el('li')
        row.append(
          el('span', undefined, itemLabel(item)),
          ' ',
          el('em', 'gradebook-max', itemMax(item, lang)),
        )
        sub.appendChild(row)
      }
      li.appendChild(sub)
    }
    list.appendChild(li)
  }
  details.appendChild(list)

  if (letters.length > 0) {
    details.appendChild(
      el(
        'p',
        'gradebook-letters',
        letters.map((l) => `${l.letter} ≥ ${formatNumber(l.lowerBoundary, lang, 2)}`).join(' · '),
      ),
    )
  }
  return details
}

function buildWarnings(backup: ParsedBackup, lang: string): HTMLElement | undefined {
  if (backup.warnings.length === 0) return undefined
  const box = el('section', 'summary-warnings')
  box.appendChild(
    el(
      'h4',
      'summary-warnings-title',
      `⚠ ${formatNumber(backup.warnings.length, lang)} ${t('warnings')}`,
    ),
  )
  box.appendChild(
    el('p', 'summary-warnings-list', backup.warnings.map((w) => w.message).join(' · ')),
  )
  return box
}

/** Replaces the pane's content with the course summary. */
export async function renderCourseSummary(
  backup: ParsedBackup,
  facts: SummaryFacts,
  container: HTMLElement,
  deps: SummaryDeps,
): Promise<void> {
  const lang = detectLang()
  const root = el('div', 'course-summary')

  root.appendChild(el('p', 'detail-breadcrumb', t('summary.kicker')))
  const title = el(
    'h3',
    'detail-title',
    backup.course.fullname || backup.course.shortname || '(untitled course)',
  )
  title.id = 'detail-title'
  root.appendChild(title)

  const release = releaseLabel(backup.moodleRelease)
  const meta: string[] = []
  if (release !== '') meta.push(`Moodle ${release}`)
  meta.push(backup.format === 'targz' ? 'TAR.GZ' : 'ZIP')
  if (backup.backupDate !== undefined) {
    meta.push(t('summary.backupOf', { date: formatDate(backup.backupDate, lang) }))
  }
  meta.push(`${t('parsedIn')} ${formatNumber(facts.elapsedMs, lang)} ms`)
  root.appendChild(el('p', 'summary-meta', meta.join(' · ')))

  const tiles = el('div', 'summary-tiles')
  const size = splitBytes(facts.fileSize, lang)
  tiles.append(
    tile(formatNumber(backup.sections.length, lang), t('sections')),
    tile(formatNumber(backup.activities.length, lang), t('activities')),
    tile(formatNumber(backup.files.size, lang), t('files')),
    tile(size.value, t('summary.size'), size.unit),
  )
  root.appendChild(tiles)

  const grid = el('div', 'summary-grid')
  grid.appendChild(buildTypes(backup, deps, lang))
  const side = el('div', 'summary-side')
  const warnings = buildWarnings(backup, lang)
  if (warnings) side.appendChild(warnings)
  grid.appendChild(side)
  root.appendChild(grid)

  root.appendChild(el('p', 'summary-hint', t('summary.hint')))
  container.replaceChildren(root)

  // gradebook.xml is read after the pane is on screen: the rest of the
  // summary needs nothing from the archive and should not wait on it.
  let bytes: Uint8Array
  try {
    bytes = await deps.readEntry('gradebook.xml')
  } catch {
    return
  }
  const { parseGradebookXml } = await import('@mbzoo/core')
  const book = await parseGradebookXml(new TextDecoder().decode(bytes))
  if (book.categories.length === 0 && book.items.length === 0) return
  // The user may have opened an activity meanwhile; a detached summary is
  // never shown, so it gets nothing appended either.
  if (!root.isConnected) return
  side.prepend(buildGradebook(book, lang))
}
