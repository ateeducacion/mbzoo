/**
 * Detail pane chrome: header actions plus Preview / Info / Raw tabs
 * (mockup 2a–2d).
 *
 * This module owns the shell only. Content rendering stays in
 * renderers.ts; the panel decides what to show around it, which tab is
 * live, and which exports an activity can actually offer (ADR-0016).
 *
 * Security: every value here comes from a hostile backup and is written
 * with textContent or as a text node. The Raw tab colours XML through
 * tokenizeXml, which classifies text runs but never builds markup, so
 * ADR-0012's single sanitization path is untouched.
 */

import type { ActivityInfo } from '@mbzoo/core'
import { buildActivityZip, exportFileName } from './lib/export.ts'
import { t } from './lib/i18n.ts'
import { formatBytes, formatDate } from './lib/preview-utils.ts'
import { tokenizeXml } from './lib/xml-highlight.ts'
import type { ParsedActivity, Renderer } from './renderers.ts'

export interface DetailDeps {
  readonly renderer: Renderer
  readonly badgeTone: (moduleName: string) => string
  readonly setStatus: (message: string, kind?: 'info' | 'error') => void
}

/** Moodle's "no value" marker; shown as nothing rather than as text. */
const NULL_SENTINEL = '$@NULL@$'

/** Fields rendered by the Preview tab, so the Info tab does not repeat them. */
const CONTENT_FIELDS = new Set(['intro', 'content', 'name', 'summary'])

/** Beyond this the Raw tab shows a head and points at the XML export. */
const MAX_RAW_CHARS = 200_000

/** Long or markup-bearing values belong in Raw, not in the Info grid. */
const MAX_FIELD_CHARS = 80

// ---------------------------------------------------------------- helpers

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

function actionButton(label: string, variant: 'ghost' | 'accent'): HTMLButtonElement {
  const button = el('button', `detail-action detail-action-${variant}`, label)
  button.type = 'button'
  return button
}

/** Downloads bytes or text without ever leaving the origin. */
function triggerDownload(payload: Uint8Array | string, mime: string, fileName: string): void {
  const blob =
    typeof payload === 'string'
      ? new Blob([payload], { type: mime })
      : new Blob([payload.buffer as ArrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = el('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked next tick: revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// ------------------------------------------------------------------ tabs

interface Tab {
  readonly id: string
  readonly label: string
  readonly panel: HTMLElement
  readonly build?: () => void
}

function createPanel(id: string, parent: HTMLElement): HTMLElement {
  const panel = el('div', `detail-panel detail-panel-${id}`)
  panel.id = `panel-${id}`
  panel.setAttribute('role', 'tabpanel')
  panel.tabIndex = 0
  panel.hidden = true
  parent.appendChild(panel)
  return panel
}

/**
 * Wires a tablist with roving focus. Panels build on first activation, so
 * tokenizing a large XML costs nothing until Raw is actually opened.
 */
function wireTabs(tablist: HTMLElement, tabs: readonly Tab[]): void {
  const buttons: HTMLButtonElement[] = []
  const built = new Set<string>()

  const select = (index: number, moveFocus = false): void => {
    tabs.forEach((tab, i) => {
      const button = buttons[i]
      if (!button) return
      const active = i === index
      button.setAttribute('aria-selected', String(active))
      button.tabIndex = active ? 0 : -1
      button.classList.toggle('active', active)
      tab.panel.hidden = !active
      if (active && !built.has(tab.id)) {
        built.add(tab.id)
        tab.build?.()
      }
    })
    if (moveFocus) buttons[index]?.focus()
  }

  tabs.forEach((tab, i) => {
    const button = el('button', 'detail-tab', tab.label)
    button.type = 'button'
    button.id = `tab-${tab.id}`
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-controls', tab.panel.id)
    tab.panel.setAttribute('aria-labelledby', button.id)
    button.addEventListener('click', () => select(i))
    button.addEventListener('keydown', (ev) => {
      const delta = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
      if (delta === 0) return
      ev.preventDefault()
      select((i + delta + tabs.length) % tabs.length, true)
    })
    buttons.push(button)
    tablist.appendChild(button)
  })

  select(0)
}

// ------------------------------------------------------------- info tab

function infoCard(parent: HTMLElement, title: string): HTMLElement {
  const card = el('section', 'info-card')
  card.appendChild(el('h4', 'info-card-title', title))
  const grid = el('div', 'info-grid')
  card.appendChild(grid)
  parent.appendChild(card)
  return grid
}

function addRow(grid: HTMLElement, key: string, value: string, tone?: 'warn'): void {
  grid.appendChild(el('b', 'info-key', key))
  grid.appendChild(el('span', `info-value${tone ? ` info-value-${tone}` : ''}`, value))
}

/** Human value for a scalar module field; dates and durations only. */
function fieldValue(key: string, raw: string, lang: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return raw
  if (key === 'timelimit' || key === 'duration') return `${Math.round(n / 60)} ${t('minutes')}`
  if (/^time|date$|^.*(open|close|due|from)$/.test(key)) return formatDate(n, lang)
  return raw
}

function buildInfoPanel(activity: ActivityInfo, parsed: ParsedActivity, panel: HTMLElement): void {
  const lang = navigator.language
  const settings = activity.settings

  const access = infoCard(panel, t('info.visibility'))
  if (settings) {
    addRow(
      access,
      t('info.visible'),
      settings.visible ? t('info.yes') : t('info.hiddenFromStudents'),
      settings.visible ? undefined : 'warn',
    )
    addRow(
      access,
      t('info.restriction'),
      settings.availability.kind === 'tree' && settings.availability.conditions.length > 0
        ? settings.availability.conditions.map((c) => c.text).join(' · ')
        : t('info.none'),
    )
    addRow(access, t('info.groups'), settings.groupMode)
    addRow(access, t('info.completion'), settings.completion)
    if (settings.completionExpected > 0) {
      addRow(access, t('info.completionDue'), formatDate(settings.completionExpected, lang))
    }
  } else {
    access.appendChild(el('p', 'info-note', t('info.unavailable')))
  }

  const config = infoCard(panel, t('info.config'))
  let shown = 0
  for (const [key, raw] of parsed.fields) {
    if (CONTENT_FIELDS.has(key)) continue
    const value = raw.trim()
    if (value === '' || value === NULL_SENTINEL) continue
    if (value.length > MAX_FIELD_CHARS || value.includes('<')) continue
    addRow(config, key, fieldValue(key, value, lang))
    shown++
  }
  if (shown === 0) addRow(config, '—', t('info.none'))

  const ids = infoCard(panel, t('info.ids'))
  addRow(ids, 'moduleid', String(activity.id))
  addRow(ids, 'sectionid', String(activity.sectionId))
  addRow(ids, 'contextid', parsed.contextId || '—')
  addRow(ids, 'idnumber', settings?.idNumber || '—')
}

// -------------------------------------------------------------- raw tab

function buildRawPanel(parsed: ParsedActivity, panel: HTMLElement): void {
  if (parsed.xmlText === '') {
    panel.appendChild(el('p', 'fallback-note', t('raw.missing')))
    return
  }

  const bar = el('div', 'raw-bar')
  bar.appendChild(el('code', 'raw-path', parsed.xmlPath))
  bar.appendChild(el('span', 'raw-size', formatBytes(parsed.xmlText.length)))
  panel.appendChild(bar)

  const truncated = parsed.xmlText.length > MAX_RAW_CHARS
  const source = truncated ? parsed.xmlText.slice(0, MAX_RAW_CHARS) : parsed.xmlText

  const pre = el('pre', 'raw-xml')
  for (const token of tokenizeXml(source)) {
    if (token.kind === 'text') {
      pre.appendChild(document.createTextNode(token.text))
      continue
    }
    pre.appendChild(el('span', `x-${token.kind}`, token.text))
  }
  if (truncated) pre.appendChild(document.createTextNode('\n…'))
  panel.appendChild(pre)

  if (truncated) {
    panel.appendChild(
      el(
        'p',
        'fallback-note',
        t('raw.truncated', { n: MAX_RAW_CHARS, total: parsed.xmlText.length }),
      ),
    )
  }
}

// ------------------------------------------------------------- actions

interface ExportItem {
  readonly label: string
  readonly run: () => void | Promise<void>
}

/** Export ▾ dropdown; only reachable when at least one item is offerable. */
function exportMenu(items: readonly ExportItem[], deps: DetailDeps): HTMLElement {
  const wrap = el('div', 'export-menu')
  const button = actionButton(`${t('action.export')} ▾`, 'accent')
  button.setAttribute('aria-haspopup', 'menu')
  button.setAttribute('aria-expanded', 'false')

  const list = el('div', 'export-list')
  list.setAttribute('role', 'menu')
  list.hidden = true

  const close = (): void => {
    list.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }
  const open = (): void => {
    list.hidden = false
    button.setAttribute('aria-expanded', 'true')
  }

  button.addEventListener('click', (ev) => {
    ev.stopPropagation()
    if (list.hidden) open()
    else close()
  })
  document.addEventListener('click', close)
  wrap.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      close()
      button.focus()
    }
  })

  for (const item of items) {
    const entry = el('button', 'export-item', item.label)
    entry.type = 'button'
    entry.setAttribute('role', 'menuitem')
    entry.addEventListener('click', (ev) => {
      ev.stopPropagation()
      close()
      void (async () => {
        try {
          await item.run()
        } catch (e) {
          deps.setStatus(e instanceof Error ? e.message : t('export.empty'), 'error')
        }
      })()
    })
    list.appendChild(entry)
  }

  wrap.append(button, list)
  return wrap
}

async function buildActions(
  activity: ActivityInfo,
  parsed: ParsedActivity,
  preview: HTMLElement,
  actions: HTMLElement,
  deps: DetailDeps,
): Promise<void> {
  const files = deps.renderer.activityFiles(parsed)

  // Single-file resources get the direct download of mockup 2a.
  const only = files.length === 1 ? files[0] : undefined
  if (only) {
    const button = actionButton(`⭳ ${t('action.download')}`, 'ghost')
    button.addEventListener('click', () => {
      void (async () => {
        const data = await deps.renderer.readFileRecord(only)
        if (!data) {
          deps.setStatus(t('export.empty'), 'error')
          return
        }
        triggerDownload(data, only.mimeType || 'application/octet-stream', only.fileName)
      })()
    })
    actions.appendChild(button)
  }

  const copy = actionButton(`⧉ ${t('action.copyPath')}`, 'ghost')
  copy.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(parsed.xmlPath)
        const previousLabel = copy.textContent
        copy.textContent = `✓ ${t('action.copied')}`
        setTimeout(() => {
          copy.textContent = previousLabel
        }, 1500)
      } catch {
        deps.setStatus(t('action.copyFailed'), 'error')
      }
    })()
  })
  actions.appendChild(copy)

  const items: ExportItem[] = []
  if (parsed.xmlText !== '') {
    items.push({
      label: t('export.xml'),
      run: () =>
        triggerDownload(parsed.xmlText, 'application/xml', exportFileName(activity, 'xml')),
    })
  }

  const html = deps.renderer.exportContentHtml(preview, activity.title || activity.moduleName)
  if (html) {
    items.push({
      label: t('export.html'),
      run: () => triggerDownload(html, 'text/html', exportFileName(activity, 'html')),
    })
  }

  if (files.length > 0) {
    items.push({
      label: t('export.zip'),
      run: async () => {
        const entries: { name: string; data: Uint8Array }[] = []
        for (const rec of files) {
          const data = await deps.renderer.readFileRecord(rec)
          if (data) entries.push({ name: rec.fileName, data })
        }
        if (entries.length === 0) {
          deps.setStatus(t('export.empty'), 'error')
          return
        }
        triggerDownload(
          buildActivityZip(entries),
          'application/zip',
          exportFileName(activity, 'zip'),
        )
      },
    })
  }

  if (items.length > 0) actions.appendChild(exportMenu(items, deps))
}

// ---------------------------------------------------------------- entry

/** Renders one activity into the detail pane. */
export async function renderDetail(
  activity: ActivityInfo,
  sectionName: string,
  container: HTMLElement,
  deps: DetailDeps,
): Promise<void> {
  const parsed = await deps.renderer.parseActivity(activity)
  container.replaceChildren()

  const head = el('div', 'detail-head')
  const headText = el('div', 'detail-head-text')
  headText.appendChild(el('p', 'detail-breadcrumb', sectionName))

  const titleRow = el('div', 'detail-title-row')
  const title = el('h3', 'detail-title', activity.title || `(unnamed ${activity.moduleName})`)
  title.id = 'detail-title'
  const badge = el(
    'span',
    `mod-badge ${deps.badgeTone(activity.moduleName)}`.trim(),
    activity.moduleName,
  )
  titleRow.append(title, badge)
  if (activity.settings && !activity.settings.visible) {
    titleRow.appendChild(el('span', 'hidden-pill', t('badge.hidden')))
  }
  headText.appendChild(titleRow)

  const actions = el('div', 'detail-actions')
  head.append(headText, actions)
  container.appendChild(head)

  const tablist = el('div', 'detail-tabs')
  tablist.setAttribute('role', 'tablist')
  const panels = el('div', 'detail-panels')
  container.append(tablist, panels)

  const previewPanel = createPanel('preview', panels)
  const infoPanel = createPanel('info', panels)
  const rawPanel = createPanel('raw', panels)

  // Preview renders before the toolbar is built: whether an HTML export
  // is offerable depends on what the preview actually produced.
  deps.setStatus(`${t('loading.activity')} “${title.textContent}”…`)
  try {
    await deps.renderer.renderActivity(activity, parsed, previewPanel)
    deps.setStatus('')
  } catch (e) {
    deps.setStatus(e instanceof Error ? e.message : 'Could not render this item.', 'error')
  }

  wireTabs(tablist, [
    { id: 'preview', label: t('tab.preview'), panel: previewPanel },
    {
      id: 'info',
      label: t('tab.info'),
      panel: infoPanel,
      build: () => buildInfoPanel(activity, parsed, infoPanel),
    },
    {
      id: 'raw',
      label: t('tab.raw'),
      panel: rawPanel,
      build: () => buildRawPanel(parsed, rawPanel),
    },
  ])

  await buildActions(activity, parsed, previewPanel, actions, deps)
}
