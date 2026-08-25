import type { ParsedBackup } from '@mbzoo/core'
import { formatBytes } from './lib/preview-utils.ts'
import { Renderer } from './renderers.ts'
import './style.css'

type ParseResponse =
  | { kind: 'parse'; id: number; ok: true; backup: ParsedBackup; elapsedMs: number }
  | { kind: 'parse'; id: number; ok: false; error: string }

type ReadResponse =
  | { kind: 'read'; id: number; ok: true; data: ArrayBuffer }
  | { kind: 'read'; id: number; ok: false; error: string }

const landing = document.getElementById('landing') as HTMLElement
const dropzone = document.getElementById('dropzone') as HTMLElement
const fileInput = document.getElementById('file-input') as HTMLInputElement
const loading = document.getElementById('loading') as HTMLElement
const loadingTitle = document.getElementById('loading-title') as HTMLElement
const loadingSub = document.getElementById('loading-sub') as HTMLElement
const errorCard = document.getElementById('error') as HTMLElement
const errorMsg = document.getElementById('error-msg') as HTMLElement
const status = document.getElementById('status') as HTMLElement
const courseSection = document.getElementById('course') as HTMLElement
const courseTitle = document.getElementById('course-title') as HTMLElement
const courseSub = document.getElementById('course-sub') as HTMLElement
const courseMeta = document.getElementById('course-meta') as HTMLElement
const fileNameEl = document.getElementById('file-name') as HTMLElement
const fileSizeEl = document.getElementById('file-size') as HTMLElement
const sectionsList = document.getElementById('sections') as HTMLElement
const searchInput = document.getElementById('activity-search') as HTMLInputElement
const warningsBox = document.getElementById('warnings') as HTMLElement
const detail = document.getElementById('detail') as HTMLElement

let worker: Worker | undefined
let requestId = 0
let currentBackup: ParsedBackup | undefined
let renderer: Renderer | undefined

function setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
  status.textContent = message
  status.classList.toggle('error', kind === 'error')
}

function show(section: 'landing' | 'loading' | 'error' | 'explorer'): void {
  landing.hidden = section !== 'landing'
  loading.hidden = section !== 'loading'
  errorCard.hidden = section !== 'error'
  courseSection.hidden = section !== 'explorer'
}

function getWorker(): Worker {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  return worker
}

function workerCall<T extends { id: number }>(
  message: Record<string, unknown>,
  transfer?: Transferable[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = getWorker()
    const id = ++requestId
    w.onmessage = (
      ev: MessageEvent<T & { id: number; ok: boolean; error?: string; data?: ArrayBuffer }>,
    ) => {
      if (ev.data.id !== id) return
      if (ev.data.ok) resolve(ev.data as T)
      else reject(new Error(ev.data.error ?? 'worker call failed'))
    }
    w.onerror = (ev) => reject(new Error(`Worker failed: ${ev.message || 'unknown error'}`))
    w.postMessage({ ...message, id }, transfer ?? [])
  })
}

async function parseInWorker(file: File): Promise<Extract<ParseResponse, { ok: true }>> {
  const buffer = await file.arrayBuffer()
  return workerCall<Extract<ParseResponse, { ok: true }>>({ kind: 'parse', buffer }, [buffer])
}

function readEntry(path: string): Promise<Uint8Array> {
  return workerCall<Extract<ReadResponse, { ok: true }>>({ kind: 'read', path }).then(
    (r) => new Uint8Array(r.data as ArrayBuffer),
  )
}

/** Badge tone per module family (mockup 1a palette). */
function badgeTone(moduleName: string): string {
  const m = moduleName.toLowerCase()
  if (m === 'page' || m === 'quiz') return 't-blue'
  if (m === 'forum' || m === 'glossary' || m === 'chat' || m === 'feedback') return 't-green'
  if (m === 'resource' || m === 'folder' || m === 'assign' || m === 'book') return 't-purple'
  if (m === 'url') return 't-red'
  if (m === 'label') return 't-orange'
  if (m === 'scorm' || m === 'h5p' || m === 'hvp') return 't-teal'
  return ''
}

function render(backup: ParsedBackup, fileName: string, fileSize: number, elapsedMs: number): void {
  currentBackup = backup
  renderer?.dispose()
  renderer = new Renderer({ backup, readEntry })

  show('explorer')
  detail.hidden = false
  detail.replaceChildren()
  const empty = document.createElement('p')
  empty.className = 'fallback-note'
  empty.textContent = 'Select an activity on the left to view its content.'
  detail.appendChild(empty)

  courseTitle.textContent = backup.course.fullname || backup.course.shortname || '(untitled course)'
  courseSub.textContent = [
    backup.format === 'targz' ? 'TAR.GZ' : 'ZIP',
    `parsed in ${elapsedMs} ms`,
  ].join(' · ')
  courseMeta.textContent = [
    `${backup.sections.length} sections`,
    `${backup.activities.length} activities`,
    `${backup.files.size} files`,
  ].join(' · ')
  fileNameEl.textContent = fileName
  fileSizeEl.textContent = `· ${formatBytes(fileSize)}`

  // Warnings panel (1d): non-blocking notices.
  warningsBox.replaceChildren()
  warningsBox.hidden = backup.warnings.length === 0
  if (backup.warnings.length > 0) {
    const title = document.createElement('div')
    title.className = 'warnings-title'
    title.textContent = `⚠ ${backup.warnings.length} warning(s)`
    warningsBox.appendChild(title)
    for (const w of backup.warnings.slice(0, 8)) {
      const item = document.createElement('div')
      item.className = 'warning-item'
      item.textContent = w.detail ? `${w.message} — ${w.detail}` : w.message
      warningsBox.appendChild(item)
    }
  }

  sectionsList.replaceChildren()
  for (const section of backup.sections) {
    const li = document.createElement('li')
    const heading = document.createElement('h3')
    heading.textContent =
      section.name || (section.number >= 0 ? `Section ${section.number}` : 'Section')
    li.appendChild(heading)
    const ul = document.createElement('ul')
    ul.className = 'activity-list'
    for (const activityId of section.activityIds) {
      const activity = backup.activities.find((a) => a.id === activityId)
      if (!activity) continue
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'activity-button'
      button.dataset.activityId = String(activity.id)
      button.dataset.search = `${activity.title} ${activity.moduleName}`.toLowerCase()
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = activity.title || `(unnamed ${activity.moduleName})`
      const badge = document.createElement('span')
      badge.className = `mod-badge ${badgeTone(activity.moduleName)}`.trim()
      badge.textContent = activity.moduleName
      button.append(name, badge)
      button.addEventListener(
        'click',
        () => void openActivity(activity.id, heading.textContent ?? ''),
      )
      item.appendChild(button)
      ul.appendChild(item)
    }
    if (ul.children.length === 0) li.classList.add('empty-section')
    li.appendChild(ul)
    sectionsList.appendChild(li)
  }
  searchInput.value = ''
}

async function openActivity(activityId: number, sectionName: string): Promise<void> {
  if (!currentBackup || !renderer) return
  const activity = currentBackup.activities.find((a) => a.id === activityId)
  if (!activity || !renderer) return
  for (const b of document.querySelectorAll('.activity-button.selected')) {
    b.classList.remove('selected')
  }
  document
    .querySelector(`.activity-button[data-activity-id="${CSS.escape(String(activityId))}"]`)
    ?.classList.add('selected')

  detail.replaceChildren()
  detail.hidden = false
  const crumb = document.createElement('p')
  crumb.className = 'detail-breadcrumb'
  crumb.textContent = sectionName
  const titleRow = document.createElement('div')
  titleRow.className = 'detail-title-row'
  const head = document.createElement('h3')
  head.className = 'detail-title'
  head.textContent = activity.title || `(unnamed ${activity.moduleName})`
  const badge = document.createElement('span')
  badge.className = `mod-badge ${badgeTone(activity.moduleName)}`.trim()
  badge.textContent = activity.moduleName
  titleRow.append(head, badge)
  detail.append(crumb, titleRow)
  const body = document.createElement('div')
  body.className = 'detail-body'
  detail.appendChild(body)
  setStatus(`Loading “${head.textContent}”…`)
  try {
    await renderer.renderActivity(activity, body)
    setStatus('')
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Could not render this item.', 'error')
  }
}

async function handleBlob(blob: Blob, name: string): Promise<void> {
  show('loading')
  loadingTitle.textContent = `Reading ${name}`
  loadingSub.textContent = `${formatBytes(blob.size)} · detecting format…`
  try {
    const result = await parseInWorker(new File([blob], name))
    render(result.backup, name, blob.size, result.elapsedMs)
    setStatus('')
  } catch (e) {
    errorMsg.textContent =
      e instanceof Error
        ? `“${name}” could not be opened as a Moodle backup: ${e.message}`
        : `“${name}” could not be opened.`
    show('error')
  }
}

for (const btn of document.querySelectorAll('.btn-choose')) {
  btn.addEventListener('click', () => {
    show('landing')
    fileInput.click()
  })
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0]
  if (f) void handleBlob(f, f.name)
})

for (const type of ['dragenter', 'dragover']) {
  dropzone.addEventListener(type, (ev) => {
    ev.preventDefault()
    dropzone.classList.add('dragging')
  })
}
for (const type of ['dragleave', 'drop']) {
  dropzone.addEventListener(type, (ev) => {
    ev.preventDefault()
    dropzone.classList.remove('dragging')
  })
}
dropzone.addEventListener('drop', (ev) => {
  const f = ev.dataTransfer?.files[0]
  if (f) void handleBlob(f, f.name)
})

// Activity search: filter rows across sections.
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase()
  for (const button of sectionsList.querySelectorAll<HTMLButtonElement>('.activity-button')) {
    const hit = q === '' || (button.dataset.search ?? '').includes(q)
    button.parentElement?.toggleAttribute('hidden', !hit)
  }
  for (const li of sectionsList.querySelectorAll(':scope > li')) {
    const anyVisible = li.querySelector('.activity-button:not([hidden])') !== null
    li.toggleAttribute('hidden', !anyVisible)
  }
})

// Support opening a backup directly via ?url=<mbz> (CORS must allow it).
async function openFromUrlParam(): Promise<void> {
  const target = new URLSearchParams(location.search).get('url')
  if (!target) return
  show('loading')
  loadingTitle.textContent = `Fetching ${target}`
  try {
    const res = await fetch(target)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await handleBlob(await res.blob(), target.split('/').pop() ?? 'backup.mbz')
  } catch (e) {
    errorMsg.textContent = `Could not fetch that URL (${
      e instanceof Error ? e.message : 'unknown'
    }). The server must allow cross-origin downloads (CORS).`
    show('error')
  }
}

void openFromUrlParam()
