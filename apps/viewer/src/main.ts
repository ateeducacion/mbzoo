import type { ParsedBackup } from '@mbzoo/core'
import { Renderer } from './renderers.ts'
import './style.css'

type ParseResponse =
  | { kind: 'parse'; id: number; ok: true; backup: ParsedBackup; elapsedMs: number }
  | { kind: 'parse'; id: number; ok: false; error: string }

type ReadResponse =
  | { kind: 'read'; id: number; ok: true; data: ArrayBuffer }
  | { kind: 'read'; id: number; ok: false; error: string }

const dropzone = document.getElementById('dropzone') as HTMLElement
const fileInput = document.getElementById('file-input') as HTMLInputElement
const status = document.getElementById('status') as HTMLElement
const courseSection = document.getElementById('course') as HTMLElement
const courseTitle = document.getElementById('course-title') as HTMLElement
const courseMeta = document.getElementById('course-meta') as HTMLElement
const sectionsList = document.getElementById('sections') as HTMLElement
const detail = document.getElementById('detail') as HTMLElement

let worker: Worker | undefined
let requestId = 0
let currentBackup: ParsedBackup | undefined
let renderer: Renderer | undefined

function setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
  status.textContent = message
  status.classList.toggle('error', kind === 'error')
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
      ev: MessageEvent<
        T & {
          id: number
          ok: boolean
          error?: string
          data?: ArrayBuffer
          backup?: ParsedBackup
          elapsedMs?: number
        }
      >,
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
    (r) => new Uint8Array(r.data),
  )
}

function render(backup: ParsedBackup, elapsedMs: number): void {
  currentBackup = backup
  renderer?.dispose()
  renderer = new Renderer({ backup, readEntry })
  detail.hidden = true
  detail.replaceChildren()
  courseSection.hidden = false
  courseTitle.textContent = backup.course.fullname || backup.course.shortname || '(untitled course)'
  const meta: string[] = [
    `Format: ${backup.format === 'targz' ? 'TAR.GZ' : 'ZIP'}`,
    `${backup.sections.length} sections`,
    `${backup.activities.length} activities`,
    `${backup.files.size} indexed files`,
    `parsed in ${elapsedMs} ms`,
  ]
  if (backup.warnings.length > 0) meta.push(`${backup.warnings.length} warning(s)`)
  courseMeta.textContent = meta.join(' · ')

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
      const name = document.createElement('span')
      name.textContent = activity.title || `(unnamed ${activity.moduleName})`
      const badge = document.createElement('code')
      badge.className = 'mod-badge'
      badge.textContent = activity.moduleName
      button.append(name, ' ', badge)
      button.addEventListener('click', () => void openActivity(activity.id))
      item.appendChild(button)
      ul.appendChild(item)
    }
    if (ul.children.length > 0) li.appendChild(ul)
    sectionsList.appendChild(li)
  }
}

async function openActivity(activityId: number): Promise<void> {
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
  const head = document.createElement('h3')
  head.className = 'detail-title'
  head.textContent = activity.title || `(unnamed ${activity.moduleName})`
  const sub = document.createElement('p')
  sub.className = 'detail-sub'
  sub.textContent = `module: ${activity.moduleName}`
  detail.append(head, sub)
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
  courseSection.hidden = true
  detail.hidden = true
  setStatus(`Reading ${name} (${formatBytes(blob.size)})…`)
  try {
    const result = await parseInWorker(new File([blob], name))
    render(result.backup, result.elapsedMs)
    setStatus(`Parsed “${name}”. Click an activity to view its content.`)
  } catch (e) {
    setStatus(
      e instanceof Error ? `Could not open this file: ${e.message}` : 'Could not open this file.',
      'error',
    )
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
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

// Support opening a backup directly via ?url=<mbz> (CORS must allow it).
async function openFromUrlParam(): Promise<void> {
  const target = new URLSearchParams(location.search).get('url')
  if (!target) return
  setStatus(`Fetching ${target}…`)
  try {
    const res = await fetch(target)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await handleBlob(await res.blob(), target.split('/').pop() ?? 'backup.mbz')
  } catch (e) {
    setStatus(
      `Could not fetch that URL (${e instanceof Error ? e.message : 'unknown'}). ` +
        'The server must allow cross-origin downloads (CORS).',
      'error',
    )
  }
}

void openFromUrlParam()
