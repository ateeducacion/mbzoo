import type { ParsedBackup } from '@mbzoo/core'
import './style.css'

type ParseResponse =
  | { id: number; ok: true; backup: ParsedBackup; elapsedMs: number }
  | { id: number; ok: false; error: string }

const dropzone = document.getElementById('dropzone') as HTMLElement
const fileInput = document.getElementById('file-input') as HTMLInputElement
const status = document.getElementById('status') as HTMLElement
const courseSection = document.getElementById('course') as HTMLElement
const courseTitle = document.getElementById('course-title') as HTMLElement
const courseMeta = document.getElementById('course-meta') as HTMLElement
const sectionsList = document.getElementById('sections') as HTMLElement

let worker: Worker | undefined
let requestId = 0

function setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
  status.textContent = message
  status.classList.toggle('error', kind === 'error')
}

function getWorker(): Worker {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  return worker
}

function parseInWorker(file: File): Promise<Extract<ParseResponse, { ok: true }>> {
  return new Promise((resolve, reject) => {
    const w = getWorker()
    const id = ++requestId
    w.onmessage = (ev: MessageEvent<ParseResponse>) => {
      if (ev.data.id !== id) return
      if (ev.data.ok) resolve(ev.data)
      else reject(new Error(ev.data.error))
    }
    w.onerror = (ev) => reject(new Error(`Worker failed: ${ev.message || 'unknown error'}`))
    file.arrayBuffer().then(
      (buffer) => w.postMessage({ id, buffer }, [buffer]),
      (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))),
    )
  })
}

function render(backup: ParsedBackup, elapsedMs: number): void {
  courseSection.hidden = false
  courseTitle.textContent = backup.course.fullname || backup.course.shortname || '(untitled course)'
  const meta: string[] = [
    `Format: ${backup.format === 'targz' ? 'TAR.GZ' : 'ZIP'}`,
    `${backup.sections.length} sections`,
    `${backup.activities.length} activities`,
    `${backup.files.size} indexed files`,
    `parsed in ${elapsedMs} ms`,
  ]
  if (backup.warnings.length > 0) {
    meta.push(`${backup.warnings.length} warning(s)`)
  }
  courseMeta.textContent = meta.join(' · ')

  sectionsList.replaceChildren()
  for (const section of backup.sections) {
    const li = document.createElement('li')
    const heading = document.createElement('h3')
    heading.textContent =
      section.name || (section.number >= 0 ? `Section ${section.number}` : 'Section')
    li.appendChild(heading)
    const ul = document.createElement('ul')
    for (const activityId of section.activityIds) {
      const activity = backup.activities.find((a) => a.id === activityId)
      if (!activity) continue
      const item = document.createElement('li')
      item.className = `activity mod-${CSS.escape(activity.moduleName)}`
      const name = document.createElement('span')
      name.textContent = activity.title || `(unnamed ${activity.moduleName})`
      const badge = document.createElement('code')
      badge.className = 'mod-badge'
      badge.textContent = activity.moduleName
      item.append(name, ' ', badge)
      ul.appendChild(item)
    }
    li.appendChild(ul)
    sectionsList.appendChild(li)
  }
}

async function handleFile(file: File): Promise<void> {
  courseSection.hidden = true
  setStatus(`Reading ${file.name} (${formatBytes(file.size)})…`)
  try {
    const result = await parseInWorker(file)
    render(result.backup, result.elapsedMs)
    setStatus(`Parsed “${file.name}”.`)
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
  if (f) void handleFile(f)
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
  if (f) void handleFile(f)
})
