import type { ParsedBackup } from '@mbzoo/core'
import { type StringKey, t } from './lib/i18n.ts'
import { formatBytes } from './lib/preview-utils.ts'

/** Applies data-i18n / data-i18n-ph attributes after DOM is ready. */
function applyI18nDom(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.getAttribute('data-i18n-title') as StringKey
    if (key) el.title = t(key)
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.getAttribute('data-i18n') as StringKey
    if (key) el.textContent = t(key)
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-ph]')) {
    const key = el.getAttribute('data-i18n-ph') as StringKey
    if (key && el instanceof HTMLInputElement) el.placeholder = t(key)
  }
}

import { renderCourseSummary } from './course-summary.ts'
import { type Crumb, type DetailNavigation, renderDetail } from './detail-panel.ts'
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
const courseTitle = document.getElementById('course-title-button') as HTMLButtonElement
const courseSub = document.getElementById('course-sub') as HTMLElement
const courseMeta = document.getElementById('course-meta') as HTMLElement
const fileNameEl = document.getElementById('file-name') as HTMLElement
const fileSizeEl = document.getElementById('file-size') as HTMLElement
const sectionsList = document.getElementById('sections') as HTMLElement
const searchInput = document.getElementById('activity-search') as HTMLInputElement
const warningsBox = document.getElementById('warnings') as HTMLElement
const detail = document.getElementById('detail') as HTMLElement
const homeBtn = document.getElementById('home-btn') as HTMLButtonElement
const dropOverlay = document.getElementById('drop-overlay') as HTMLElement

let worker: Worker | undefined
let requestId = 0
let currentBackup: ParsedBackup | undefined
let currentFacts: { fileSize: number; elapsedMs: number } | undefined
let renderer: Renderer | undefined
/** Whether the personal-data banner was folded with "Understood" this session. */
let personalDataDismissed = false

interface TreeEntry {
  readonly id: number
  readonly trail: readonly Crumb[]
}

/** Activities in the order the tree shows them, each with the sections above it. */
let treeOrder: TreeEntry[] = []
let currentActivityId: number | undefined
/** Bumped by every open; an open whose number is stale has been superseded. */
let openSeq = 0

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
    // One listener per call, removed when it settles. Assigning to onmessage
    // instead would let a second call in flight replace the first one's
    // handler: the first reply then matches no handler and its promise never
    // settles, which reads as a renderer that silently stops half-way.
    const onMessage = (
      ev: MessageEvent<T & { id: number; ok: boolean; error?: string; data?: ArrayBuffer }>,
    ): void => {
      if (ev.data.id !== id) return
      done()
      if (ev.data.ok) resolve(ev.data as T)
      else reject(new Error(ev.data.error ?? 'worker call failed'))
    }
    const onError = (ev: ErrorEvent): void => {
      done()
      reject(new Error(`Worker failed: ${ev.message || 'unknown error'}`))
    }
    const done = (): void => {
      w.removeEventListener('message', onMessage as EventListener)
      w.removeEventListener('error', onError as EventListener)
    }
    w.addEventListener('message', onMessage as EventListener)
    w.addEventListener('error', onError as EventListener)
    w.postMessage({ ...message, id }, transfer ?? [])
  })
}

async function parseInWorker(file: File): Promise<Extract<ParseResponse, { ok: true }>> {
  // The File crosses by reference — structured clone of a File shares the
  // underlying bytes rather than copying them — so the archive is never read
  // into memory whole. The lazy ZIP reader slices only what it needs from
  // it, and the TAR.GZ reader streams it (ADR-0029).
  return workerCall<Extract<ParseResponse, { ok: true }>>({ kind: 'parse', file })
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
  if (m === 'scorm' || m === 'h5p' || m === 'hvp' || m === 'h5pactivity') return 't-teal'
  return ''
}

function render(backup: ParsedBackup, fileName: string, fileSize: number, elapsedMs: number): void {
  currentBackup = backup
  currentFacts = { fileSize, elapsedMs }
  renderer?.dispose()
  renderer = new Renderer({ backup, readEntry })

  show('explorer')
  showCourseHome()

  courseTitle.textContent = backup.course.fullname || backup.course.shortname || '(untitled course)'
  courseSub.textContent = [
    backup.format === 'targz' ? 'TAR.GZ' : 'ZIP',
    `${t('parsedIn')} ${elapsedMs} ms`,
  ].join(' · ')
  courseMeta.textContent = [
    `${backup.sections.length} ${t('sections')}`,
    `${backup.activities.length} ${t('activities')}`,
    `${backup.files.size} ${t('files')}`,
  ].join(' · ')
  fileNameEl.textContent = fileName
  fileSizeEl.textContent = `· ${formatBytes(fileSize)}`

  // Warnings panel (1d): non-blocking notices.
  warningsBox.replaceChildren()
  warningsBox.hidden = backup.warnings.length === 0
  if (backup.warnings.length > 0) {
    const title = document.createElement('div')
    title.className = 'warnings-title'
    title.textContent = `⚠ ${backup.warnings.length} ${t('warnings')}`
    warningsBox.appendChild(title)
    for (const w of backup.warnings.slice(0, 8)) {
      const item = document.createElement('div')
      item.className = 'warning-item'
      item.textContent = w.detail ? `${w.message} — ${w.detail}` : w.message
      warningsBox.appendChild(item)
    }
  }

  void renderUserDisclosure()

  sectionsList.replaceChildren()
  treeOrder = []
  // A delegated section belongs under the activity that owns it, not beside
  // the numbered ones (Moodle 4.5+ mod_subsection).
  const delegated = new Map<number, (typeof backup.sections)[number]>()
  for (const section of backup.sections) {
    const owner = section.delegatedTo?.activityId
    if (owner !== undefined && Number.isFinite(owner)) delegated.set(owner, section)
  }

  // Course formats can nest sections (flexsections `parent`, ADR-0030), so
  // the list is a tree: each section renders its activities, then the
  // sections that name it as parent, indented one level.
  const childrenOf = new Map<number, (typeof backup.sections)[number][]>()
  for (const section of backup.sections) {
    if (section.delegatedTo || section.parentId === undefined) continue
    const siblings = childrenOf.get(section.parentId) ?? []
    siblings.push(section)
    childrenOf.set(section.parentId, siblings)
  }

  const renderSection = (
    section: (typeof backup.sections)[number],
    depth: number,
    into: HTMLElement,
    trail: readonly Crumb[],
  ): void => {
    const li = document.createElement('li')
    li.dataset.depth = String(depth)
    li.dataset.sectionId = String(section.id)
    if (depth > 0) li.classList.add('nested-section')
    const heading = document.createElement('h3')
    // Focusable by the breadcrumb, but not a tab stop of its own.
    heading.tabIndex = -1
    // An unnamed section serializes its name as Moodle's NULL sentinel, so it
    // reaches us empty. Moodle labels section 0 "General" (REPO-005,
    // format_topics section0name) and numbers the rest.
    heading.textContent =
      section.name ||
      (section.number === 0
        ? t('section.general')
        : section.number > 0
          ? `${t('section.numbered')} ${section.number}`
          : t('section.unnamed'))
    li.appendChild(heading)
    const crumbs: readonly Crumb[] = [...trail, { id: section.id, name: heading.textContent ?? '' }]
    const ul = document.createElement('ul')
    ul.className = 'activity-list'
    const addActivity = (activityId: number, into: HTMLElement): void => {
      const activity = backup.activities.find((a) => a.id === activityId)
      if (!activity) return
      // Pushed before any delegated subsection recurses, so the order is the
      // one the eye reads: an owner first, then what hangs under it.
      treeOrder.push({ id: activity.id, trail: crumbs })
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'activity-button'
      button.dataset.activityId = String(activity.id)
      button.dataset.search = `${activity.title} ${activity.moduleName}`.toLowerCase()
      const name = document.createElement('span')
      name.className = 'name'
      if (activity.settings && !activity.settings.visible) {
        name.textContent = `⊘ ${activity.title || `(unnamed ${activity.moduleName})`}`
        item.classList.add('hidden-activity')
      } else {
        name.textContent = activity.title || `(unnamed ${activity.moduleName})`
      }
      const badge = document.createElement('span')
      badge.className = `mod-badge ${badgeTone(activity.moduleName)}`.trim()
      badge.textContent = activity.moduleName
      button.append(name, badge)
      button.addEventListener('click', () => void openActivity(activity.id))
      item.appendChild(button)

      // The activities this one owns hang off it, so the tree keeps the
      // shape the course actually has.
      const owned = delegated.get(activity.id)
      if (owned) {
        item.classList.add('has-subsection')
        const nested = document.createElement('ul')
        nested.className = 'activity-list subsection-list'
        for (const childId of owned.activityIds) addActivity(childId, nested)
        if (nested.children.length === 0) {
          const empty = document.createElement('li')
          empty.className = 'subsection-empty'
          empty.textContent = t('section.emptySubsection')
          nested.appendChild(empty)
        }
        item.appendChild(nested)
      }
      into.appendChild(item)
    }
    for (const activityId of section.activityIds) addActivity(activityId, ul)
    const children = childrenOf.get(section.id) ?? []
    if (ul.children.length === 0 && children.length === 0) li.classList.add('empty-section')
    li.appendChild(ul)
    if (children.length > 0) {
      const nested = document.createElement('ul')
      nested.className = 'section-children'
      for (const child of children) renderSection(child, depth + 1, nested, crumbs)
      li.appendChild(nested)
    }
    into.appendChild(li)
  }

  for (const section of backup.sections) {
    if (section.delegatedTo || section.parentId !== undefined) continue
    renderSection(section, 0, sectionsList, [])
  }
  searchInput.value = ''
}

function clearSelection(): void {
  for (const b of document.querySelectorAll('.activity-button.selected')) {
    b.classList.remove('selected')
  }
}

/**
 * The pane's resting state: nothing selected, the backup at a glance
 * (mockup 3a). Reached on open, from the course title and from the
 * breadcrumb's Course crumb.
 */
function showCourseHome(): void {
  if (!currentBackup || !currentFacts) return
  openSeq++
  currentActivityId = undefined
  clearSelection()
  detail.hidden = false
  // renderCourseSummary swaps the pane synchronously and only appends the
  // gradebook later if its root is still attached, so an activity opened
  // before gradebook.xml resolves is never handed a summary it did not ask for.
  void renderCourseSummary(currentBackup, currentFacts, detail, { readEntry, badgeTone })
}

/** Brings a section heading into view and puts keyboard focus on it. */
function focusSection(sectionId: number): void {
  const item = sectionsList.querySelector<HTMLElement>(
    `li[data-section-id="${CSS.escape(String(sectionId))}"]`,
  )
  const heading = item?.querySelector<HTMLElement>(':scope > h3')
  if (!item || !heading) return
  // A search filter may be hiding the section; clicking its crumb is a
  // request to see it, which outranks the filter.
  if (searchInput.value !== '' && item.offsetParent === null) {
    searchInput.value = ''
    searchInput.dispatchEvent(new Event('input'))
  }
  heading.scrollIntoView({ block: 'nearest' })
  heading.focus({ preventScroll: true })
  item.classList.add('section-target')
  setTimeout(() => item.classList.remove('section-target'), 1500)
}

/** Opens the activity before (-1) or after (+1) the current one in tree order. */
function stepActivity(delta: -1 | 1): void {
  if (treeOrder.length === 0) return
  const index =
    currentActivityId === undefined ? -1 : treeOrder.findIndex((e) => e.id === currentActivityId)
  const target = index < 0 ? (delta > 0 ? treeOrder[0] : undefined) : treeOrder[index + delta]
  if (target) void openActivity(target.id)
}

/**
 * Says out loud when the file carries personal data.
 *
 * A backup taken with `users=1` writes a users.xml holding names, emails,
 * usernames, phone numbers, postal addresses and the last IP each account
 * logged in from. For a tool whose whole claim is that nothing leaves your
 * device, that is the most important thing it can tell you about a file —
 * before anyone emails it, uploads it or commits it to a repository.
 *
 * So the disclosure leads as a banner, and the list follows, closed: knowing
 * a file names 400 people is the part everyone needs; reading their names is
 * a deliberate act, and not one to perform by accident while screen-sharing.
 * "Understood" folds the banner into a one-line pill that still names the
 * count and the kinds, so the fact never leaves the screen.
 */
async function renderUserDisclosure(): Promise<void> {
  const box = document.getElementById('personal-data')
  if (!box) return
  box.replaceChildren()
  box.hidden = true

  let bytes: Uint8Array
  try {
    bytes = await readEntry('users.xml')
  } catch {
    return
  }
  const { parseUsersXml } = await import('@mbzoo/core')
  const { users, personalData } = await parseUsersXml(new TextDecoder().decode(bytes))
  if (users.length === 0) return

  box.hidden = false
  const n = users.length

  const banner = document.createElement('div')
  banner.className = 'personal-data-banner'
  const icon = document.createElement('span')
  icon.className = 'personal-data-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = '🪪'
  banner.appendChild(icon)
  const body = document.createElement('div')
  body.className = 'personal-data-body'
  banner.appendChild(body)

  const title = document.createElement('div')
  title.className = 'personal-data-title'
  title.textContent = t('users.title', { n })
  body.appendChild(title)

  if (personalData.length > 0) {
    const kinds = document.createElement('p')
    kinds.className = 'personal-data-kinds'
    kinds.textContent = `${t('users.includes')} ${personalData
      .map((kind) => t(`users.kind.${kind}`))
      .join(' · ')}.`
    body.appendChild(kinds)
  }

  const note = document.createElement('p')
  note.className = 'personal-data-note'
  note.textContent = t('users.note')
  body.appendChild(note)

  const actions = document.createElement('div')
  actions.className = 'personal-data-actions'
  body.appendChild(actions)

  // The "view" action is the <details> summary itself, so opening the list
  // stays a native, keyboard-reachable toggle rather than a second control.
  const details = document.createElement('details')
  details.className = 'personal-data-list'
  const summary = document.createElement('summary')
  summary.className = 'personal-data-reveal'
  summary.textContent = t('users.reveal', { n })
  details.appendChild(summary)
  const list = document.createElement('ul')
  list.className = 'user-list'
  for (const user of users) {
    const li = document.createElement('li')
    const name = document.createElement('strong')
    name.textContent = `${user.firstName} ${user.lastName}`.trim() || user.userName
    li.appendChild(name)
    const detail = [user.email, user.idNumber, user.city].filter((x) => x !== '').join(' · ')
    if (detail !== '') {
      const meta = document.createElement('span')
      meta.className = 'user-meta'
      meta.textContent = detail
      li.append(' ', meta)
    }
    if (user.deleted) {
      const gone = document.createElement('em')
      gone.className = 'user-deleted'
      gone.textContent = t('users.deleted')
      li.append(' ', gone)
    }
    list.appendChild(li)
  }
  details.appendChild(list)
  actions.appendChild(details)

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.className = 'personal-data-dismiss'
  dismiss.textContent = t('users.dismiss')
  actions.appendChild(dismiss)

  const pill = document.createElement('button')
  pill.type = 'button'
  pill.className = 'personal-data-pill'
  pill.hidden = true
  const pillIcon = document.createElement('span')
  pillIcon.className = 'personal-data-pill-icon'
  pillIcon.setAttribute('aria-hidden', 'true')
  pillIcon.textContent = '🪪'
  pill.appendChild(pillIcon)
  const pillCount = document.createElement('span')
  pillCount.className = 'personal-data-pill-count'
  pillCount.textContent = t('users.pill', { n })
  pill.appendChild(pillCount)
  if (personalData.length > 0) {
    const pillKinds = document.createElement('span')
    pillKinds.className = 'personal-data-pill-kinds'
    pillKinds.textContent = personalData.map((kind) => t(`users.kindShort.${kind}`)).join(' · ')
    pill.appendChild(pillKinds)
  }
  const pillMore = document.createElement('span')
  pillMore.className = 'personal-data-pill-more'
  pillMore.textContent = t('users.pillDetails')
  pill.appendChild(pillMore)

  const setCollapsed = (collapsed: boolean): void => {
    personalDataDismissed = collapsed
    // Folding away must also fold the names: re-expanding leads with the
    // disclosure again, and reading the list stays a deliberate act.
    if (collapsed) details.open = false
    banner.hidden = collapsed
    pill.hidden = !collapsed
    pill.setAttribute('aria-expanded', String(!collapsed))
    box.dataset.state = collapsed ? 'collapsed' : 'expanded'
  }
  dismiss.addEventListener('click', () => {
    setCollapsed(true)
    pill.focus()
  })
  pill.addEventListener('click', () => {
    setCollapsed(false)
    summary.focus()
  })

  box.append(banner, pill)
  // Remembered for this page session only, never persisted: nothing derived
  // from a backup is written to storage.
  setCollapsed(personalDataDismissed)
}

async function openActivity(activityId: number): Promise<void> {
  if (!currentBackup || !renderer) return
  const activity = currentBackup.activities.find((a) => a.id === activityId)
  if (!activity || !renderer) return
  const seq = ++openSeq
  currentActivityId = activityId
  clearSelection()
  const button = document.querySelector<HTMLElement>(
    `.activity-button[data-activity-id="${CSS.escape(String(activityId))}"]`,
  )
  button?.classList.add('selected')
  button?.scrollIntoView({ block: 'nearest' })

  // A Previous/Next button that has focus is about to be replaced with the
  // new pane; keep the keyboard on the same control so Enter keeps stepping.
  const active = document.activeElement
  const refocus =
    active instanceof HTMLElement && detail.contains(active) ? active.dataset.nav : undefined

  const index = treeOrder.findIndex((e) => e.id === activityId)
  const navigation: DetailNavigation = {
    trail: treeOrder[index]?.trail ?? [],
    index,
    total: treeOrder.length,
    onCourse: showCourseHome,
    onSection: focusSection,
    onStep: stepActivity,
  }

  detail.hidden = false
  try {
    await renderDetail(activity, detail, {
      renderer,
      badgeTone,
      setStatus,
      navigation,
      isCurrent: () => seq === openSeq,
    })
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Could not render this item.', 'error')
  }
  if (refocus !== undefined && seq === openSeq) {
    detail.querySelector<HTMLElement>(`[data-nav="${CSS.escape(refocus)}"]`)?.focus()
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO'].includes(target.tagName)
}

const STEP_KEYS = new Map<string, -1 | 1>([
  ['j', 1],
  ['J', 1],
  ['ArrowRight', 1],
  ['k', -1],
  ['K', -1],
  ['ArrowLeft', -1],
])

// J / K and ← / → step through activities in tree order, unless the key is
// going somewhere it already means something: a text field, media controls,
// or a widget that handled it itself (the tab strip's arrow keys).
document.addEventListener('keydown', (ev) => {
  if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return
  if (!currentBackup || courseSection.hidden || isTypingTarget(ev.target)) return
  const delta = STEP_KEYS.get(ev.key)
  if (delta === undefined) return
  ev.preventDefault()
  stepActivity(delta)
})

// Course links inside rendered content that point at an activity travelling in
// this same backup (renderers.ts resolveBackupLinks). Their href still points
// at the original Moodle so exports stay useful; in the app they navigate here.
detail.addEventListener('click', (ev) => {
  const target = ev.target
  if (!(target instanceof Element)) return
  const link = target.closest('a[data-mbz-activity]')
  if (!link) return
  const id = Number(link.getAttribute('data-mbz-activity'))
  if (!Number.isFinite(id)) return
  ev.preventDefault()
  void openActivity(id)
})

async function handleBlob(blob: Blob, name: string): Promise<void> {
  show('loading')
  loadingTitle.textContent = `${t('loading.reading')} ${name}`
  loadingSub.textContent = `${formatBytes(blob.size)} · ${t('loading.detecting')}`
  try {
    const result = await parseInWorker(new File([blob], name))
    render(result.backup, name, blob.size, result.elapsedMs)
    setStatus('')
  } catch (e) {
    errorMsg.textContent = e instanceof Error ? `${name}: ${e.message}` : name
    show('error')
  }
}

// The course title is the way back to the summary once an activity is open.
courseTitle.addEventListener('click', showCourseHome)

// Logo always returns to the landing page.
homeBtn.addEventListener('click', () => {
  renderer?.dispose()
  currentBackup = undefined
  setStatus('')
  show('landing')
})

// Global drag & drop: an .mbz can be dropped anywhere, in any state.
let dragDepth = 0
window.addEventListener('dragenter', (ev) => {
  if (!ev.dataTransfer?.types.includes('Files')) return
  ev.preventDefault()
  dragDepth++
  dropOverlay.hidden = false
})
window.addEventListener('dragover', (ev) => {
  ev.preventDefault()
})
window.addEventListener('dragleave', (ev) => {
  ev.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dropOverlay.hidden = true
})
window.addEventListener('drop', (ev) => {
  ev.preventDefault()
  dragDepth = 0
  dropOverlay.hidden = true
  const f = ev.dataTransfer?.files[0]
  if (f) void handleBlob(f, f.name)
})

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

// Example links: fetch in-page instead of navigating away.
for (const link of document.querySelectorAll<HTMLAnchorElement>('.example-link')) {
  link.addEventListener('click', (ev) => {
    ev.preventDefault()
    const src = link.dataset.src ?? link.href
    void (async () => {
      try {
        const res = await fetch(src)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await handleBlob(await res.blob(), src.split('/').pop() ?? 'example.mbz')
      } catch (e) {
        setStatus(`Could not load example: ${e instanceof Error ? e.message : 'unknown'}`, 'error')
      }
    })()
  })
}

// Support opening a backup directly via ?url=<mbz> (CORS must allow it).
async function openFromUrlParam(): Promise<void> {
  const target = new URLSearchParams(location.search).get('url')
  if (!target) return
  show('loading')
  loadingTitle.textContent = `${t('loading.reading')} ${target}`
  try {
    const res = await fetch(target)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await handleBlob(await res.blob(), target.split('/').pop() ?? 'backup.mbz')
  } catch (e) {
    errorMsg.textContent = `${t('error.urlPrefix')} (${
      e instanceof Error ? e.message : 'unknown'
    }). ${t('error.urlSuffix')}`
    show('error')
  }
}

applyI18nDom()
void openFromUrlParam()
