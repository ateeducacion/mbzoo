/**
 * MBZ Doctor dialog. Backup text is written with textContent (ADR-0012).
 * The worker owns the scan so the page stays responsive (ADR-0037).
 */
import {
  type DiagnosticReport,
  type Evidence,
  type Finding,
  fillEvidence,
  type Repairability,
  reportJson,
  type Severity,
} from '@mbzoo/core'
import { labelled, STRINGS, type StringKey, t } from './lib/i18n.ts'
import { formatBytes } from './lib/preview-utils.ts'
import type { DoctorAnalyzeResponse, DoctorProgress, DoctorRepairResponse } from './worker.ts'

interface DoctorDeps {
  readonly worker: () => Worker
  readonly nextId: () => number
  readonly openActivity: (id: number) => void
  readonly hasActivity: (id: number) => boolean
}

type Inbox = DoctorAnalyzeResponse | DoctorRepairResponse | DoctorProgress

export interface DoctorController {
  setFile(file: File | undefined): void
  /** Show the error-screen entry only when a local file can still be inspected. */
  setErrorEntry(visible: boolean): void
  open(opener: HTMLElement): void
}

export function initDoctor(deps: DoctorDeps): DoctorController {
  const dialog = mustDialog('doctor')
  const factsEl = must('doctor-facts')
  const statusEl = must('doctor-status')
  const summaryEl = must('doctor-summary')
  const filtersEl = must('doctor-filters')
  const listEl = must('doctor-findings')
  const previewEl = must('doctor-preview')
  const confirmEl = must('doctor-confirm')
  const confirmLoss = must('doctor-confirm-loss')
  const limitationsEl = must('doctor-limitations')
  const targetInput = mustInput('doctor-target')
  const analyzeBtn = mustButton('doctor-analyze')
  const cancelBtn = mustButton('doctor-cancel')
  const closeBtn = mustButton('doctor-close')
  const selectedBtn = mustButton('doctor-repair-selected')
  const safeBtn = mustButton('doctor-repair-safe')
  const previewBtn = mustButton('doctor-preview-btn')
  const downloadBtn = mustButton('doctor-download')
  const jsonBtn = mustButton('doctor-report-json')
  const textBtn = mustButton('doctor-report-text')
  const reanalyzeBtn = mustButton('doctor-reanalyze')
  const confirmCheck = mustInput('doctor-confirm-check')
  const confirmApply = mustButton('doctor-confirm-apply')
  const severityFilter = mustSelect('doctor-filter-severity')
  const categoryFilter = mustSelect('doctor-filter-category')
  const repairFilter = mustSelect('doctor-filter-repair')
  const activityFilter = mustSelect('doctor-filter-activity')
  const openBtn = mustButton('doctor-open')
  const errorBtn = mustButton('doctor-error')

  let source: File | undefined
  let report: DiagnosticReport | undefined
  let repaired: File | undefined
  let applied: readonly { readonly id: string; readonly entries: readonly string[] }[] = []
  let skipped: readonly string[] = []
  let note = ''
  let busy = false
  let confirming = false
  let restoreFocus = true
  let opener: HTMLElement | undefined
  const selected = new Set<string>()

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.bottom &&
        rect.left <= event.clientX &&
        event.clientX <= rect.right
      if (!inside) dialog.close()
    })
  }

  dialog.addEventListener('close', () => {
    if (busy) cancel()
    confirming = false
    confirmEl.hidden = true
    if (restoreFocus) opener?.focus()
    restoreFocus = true
  })
  closeBtn.addEventListener('click', () => dialog.close())
  openBtn.addEventListener('click', () => open(openBtn))
  errorBtn.addEventListener('click', () => open(errorBtn))
  analyzeBtn.addEventListener('click', () => {
    void runAnalyze(source)
  })
  reanalyzeBtn.addEventListener('click', () => {
    void runAnalyze(repaired ?? source)
  })
  cancelBtn.addEventListener('click', () => cancel())
  selectedBtn.addEventListener('click', () => beginRepair(false))
  safeBtn.addEventListener('click', () => beginRepair(true))
  previewBtn.addEventListener('click', () => showPreview())
  downloadBtn.addEventListener('click', () => {
    if (repaired && source) triggerDownload(repaired, repaired.name)
  })
  jsonBtn.addEventListener('click', () => downloadJson())
  textBtn.addEventListener('click', () => downloadText())
  confirmCheck.addEventListener('change', () => {
    confirmApply.disabled = confirmLoss.hidden ? false : !confirmCheck.checked
  })
  confirmApply.addEventListener('click', () => {
    if (!confirmLoss.hidden && !confirmCheck.checked) return
    void runRepair([...selected], true)
  })
  for (const filter of [severityFilter, categoryFilter, repairFilter, activityFilter]) {
    filter.addEventListener('change', () => renderList())
  }
  listEl.addEventListener('change', (event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return
    if (input.checked) selected.add(input.value)
    else selected.delete(input.value)
    confirming = false
    confirmEl.hidden = true
    renderActions()
  })

  fillStaticFilters()
  render()

  return {
    setFile(file) {
      source = file
      report = undefined
      repaired = undefined
      applied = []
      skipped = []
      note = ''
      selected.clear()
      confirming = false
      if (file === undefined) errorBtn.hidden = true
      // A new file replaces the diagnosis. Leave the dialog closed so the
      // course (or the error screen) is what the user sees next.
      if (dialog.open) dialog.close()
    },
    setErrorEntry(visible) {
      errorBtn.hidden = !visible
    },
    open,
  }

  function open(from: HTMLElement): void {
    if (!source) return
    opener = from
    if (!dialog.open) dialog.showModal()
    render()
    closeBtn.focus()
  }

  function targetRelease(): string {
    return targetInput.value.trim()
  }

  function cancel(): void {
    deps.worker().postMessage({ kind: 'doctor-cancel' })
  }

  async function runAnalyze(file: File | undefined): Promise<void> {
    if (!file || busy) return
    busy = true
    confirming = false
    if (file === source) {
      repaired = undefined
      applied = []
      skipped = []
      note = ''
    }
    render()
    setStatus(t('doctor.progress', { done: 0, total: 6, label: t('doctor.progress.list') }))
    try {
      const response = await doctorCall(
        {
          kind: 'doctor-analyze',
          file,
          ...(targetRelease() ? { targetRelease: targetRelease() } : {}),
        },
        onProgress,
      )
      if (response.kind !== 'doctor-analyze') throw new Error(t('doctor.failed'))
      report = response.report
      selected.clear()
      const counts = tally(response.report)
      setStatus(
        t('doctor.done', {
          critical: counts.critical,
          warning: counts.warning,
          info: counts.info,
        }),
      )
    } catch (error) {
      setStatus(`${t('doctor.failed')} ${error instanceof Error ? error.message : ''}`)
    } finally {
      busy = false
      render()
    }
  }

  async function runRepair(ids: readonly string[], confirmed: boolean): Promise<void> {
    const file = repaired ?? source
    if (!file || busy || ids.length === 0) return
    busy = true
    render()
    setStatus(t('doctor.progress', { done: 1, total: 6, label: t('doctor.progress.structure') }))
    try {
      const response = await doctorCall(
        {
          kind: 'doctor-repair',
          file,
          selectedIds: [...ids],
          confirmed,
          ...(targetRelease() ? { targetRelease: targetRelease() } : {}),
        },
        onProgress,
      )
      if (response.kind !== 'doctor-repair') throw new Error(t('doctor.failed'))
      const name = repairedName(file.name)
      repaired = new File([response.bytes], name)
      report = response.after
      applied = response.applied.map((item) => ({ id: item.id, entries: item.entries }))
      skipped = response.skipped
      note = response.note
      selected.clear()
      confirming = false
      setStatus(t('doctor.repaired', { note: localizeNote(response.note) }))
    } catch (error) {
      setStatus(`${t('doctor.failed')} ${error instanceof Error ? error.message : ''}`)
    } finally {
      busy = false
      render()
    }
  }

  function beginRepair(safeOnly: boolean): void {
    if (!report || busy) return
    const ids = safeOnly
      ? report.findings
          .filter((finding) => finding.repair?.safety === 'automatic')
          .map((finding) => finding.id)
      : [...selected]
    if (ids.length === 0) {
      setStatus(t('doctor.selectRepair'))
      return
    }
    const chosen = report.findings.filter((finding) => ids.includes(finding.id))
    const needsConfirm = chosen.some(
      (finding) => finding.repair?.safety === 'confirmation-required',
    )
    if (!needsConfirm) {
      void runRepair(ids, false)
      return
    }
    confirming = true
    confirmEl.hidden = false
    const loss = chosen.some((finding) => finding.repair?.contentLoss === true)
    confirmLoss.hidden = !loss
    confirmCheck.checked = false
    confirmApply.disabled = loss
    confirmEl.querySelector('h3')?.focus()
    renderActions()
  }

  function onProgress(progress: DoctorProgress): void {
    setStatus(
      t('doctor.progress', {
        done: progress.done,
        total: progress.total,
        label: progressText(progress.label),
      }),
    )
  }

  function doctorCall(
    message: Record<string, unknown>,
    onStep: (progress: DoctorProgress) => void,
  ): Promise<Extract<Inbox, { ok: true }>> {
    return new Promise((resolve, reject) => {
      const worker = deps.worker()
      const id = deps.nextId()
      const onMessage = (event: MessageEvent<Inbox>): void => {
        const data = event.data
        if (!data || data.id !== id) return
        if (data.kind === 'doctor-progress') {
          onStep(data)
          return
        }
        done()
        if (data.ok) resolve(data)
        else reject(new Error(data.error || t('doctor.failed')))
      }
      const onError = (event: ErrorEvent): void => {
        done()
        reject(new Error(event.message || t('doctor.failed')))
      }
      const done = (): void => {
        worker.removeEventListener('message', onMessage as EventListener)
        worker.removeEventListener('error', onError)
      }
      worker.addEventListener('message', onMessage as EventListener)
      worker.addEventListener('error', onError)
      worker.postMessage({ ...message, id })
    })
  }

  function render(): void {
    dialog.setAttribute('aria-busy', String(busy))
    analyzeBtn.disabled = busy || source === undefined
    cancelBtn.hidden = !busy
    targetInput.disabled = busy
    renderFacts()
    renderSummary()
    renderList()
    renderActions()
    renderLimitations()
    if (!confirming) confirmEl.hidden = true
  }

  function renderFacts(): void {
    factsEl.replaceChildren()
    const rows: readonly (readonly [string, string])[] = report
      ? [
          [t('doctor.facts.file'), report.facts.filename],
          [t('doctor.facts.format'), formatName(report.facts.format)],
          [t('doctor.facts.size'), formatBytes(report.facts.bytes)],
          [t('doctor.facts.release'), report.facts.moodleRelease || t('doctor.facts.unset')],
          [t('doctor.facts.version'), report.facts.moodleVersion || t('doctor.facts.unset')],
          [t('doctor.facts.backupVersion'), report.facts.backupVersion || t('doctor.facts.unset')],
          [t('doctor.facts.date'), report.facts.backupDate || t('doctor.facts.unset')],
          [t('doctor.facts.course'), report.facts.courseName || t('doctor.facts.unset')],
          [t('doctor.facts.sections'), String(report.facts.sections)],
          [t('doctor.facts.activities'), String(report.facts.activities)],
          [t('doctor.facts.categories'), String(report.facts.questionCategories)],
          [t('doctor.facts.questions'), String(report.facts.questions)],
          [t('doctor.facts.files'), String(report.facts.fileRecords)],
          [t('doctor.facts.users'), flag(report.facts.includesUserData)],
          [t('doctor.facts.filesIncluded'), flag(report.facts.includesFiles)],
          [t('doctor.facts.target'), report.facts.targetRelease || t('doctor.facts.unset')],
        ]
      : [
          [t('doctor.facts.file'), source?.name ?? t('doctor.facts.unset')],
          [t('doctor.facts.size'), source ? formatBytes(source.size) : t('doctor.facts.unset')],
          [t('doctor.facts.course'), t('doctor.facts.unknown')],
        ]
    for (const [label, value] of rows) {
      const wrap = document.createElement('div')
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      dd.textContent = value
      wrap.append(dt, dd)
      factsEl.append(wrap)
    }
  }

  function renderSummary(): void {
    if (!report) {
      summaryEl.hidden = true
      summaryEl.replaceChildren()
      filtersEl.hidden = true
      return
    }
    summaryEl.hidden = false
    filtersEl.hidden = false
    const counts = tally(report)
    summaryEl.replaceChildren()
    const tiles: readonly (readonly [string, number])[] = [
      [t('doctor.summary.critical'), counts.critical],
      [t('doctor.summary.warning'), counts.warning],
      [t('doctor.summary.info'), counts.info],
      [t('doctor.summary.repairs'), counts.repairs],
      [t('doctor.summary.manual'), counts.manual],
      [t('doctor.summary.external'), counts.external],
    ]
    for (const [label, value] of tiles) {
      const wrap = document.createElement('div')
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      dd.textContent = String(value)
      wrap.append(dt, dd)
      summaryEl.append(wrap)
    }
    refill(categoryFilter, categories(report), categoryFilter.value)
    refill(activityFilter, activities(report), activityFilter.value)
  }

  function renderList(): void {
    listEl.replaceChildren()
    if (!report) {
      const item = document.createElement('li')
      item.textContent = t('doctor.noneYet')
      listEl.append(item)
      return
    }
    const visible = report.findings.filter(matchesFilter)
    if (visible.length === 0) {
      const item = document.createElement('li')
      item.textContent = t('doctor.empty')
      listEl.append(item)
      return
    }
    for (const finding of visible) listEl.append(findingCard(finding))
  }

  function findingCard(finding: Finding): HTMLLIElement {
    const item = document.createElement('li')
    const article = document.createElement('article')
    article.className = 'doctor-finding'
    const head = document.createElement('div')
    head.className = 'doctor-finding-head'
    if (finding.repair) {
      const label = document.createElement('label')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.value = finding.id
      box.checked = selected.has(finding.id)
      box.disabled = busy
      box.setAttribute('aria-label', labelled(ruleText(finding.ruleId, 'title'), finding.id))
      label.append(box)
      head.append(label)
    }
    const sev = document.createElement('span')
    sev.className = `doctor-sev doctor-sev-${finding.severity}`
    sev.textContent = severityText(finding.severity)
    const title = document.createElement('h3')
    title.textContent = ruleText(finding.ruleId, 'title')
    head.append(sev, title)
    const id = document.createElement('p')
    id.className = 'doctor-id'
    id.textContent = finding.id
    const body = document.createElement('p')
    body.textContent = ruleText(finding.ruleId, 'body')
    const meta = document.createElement('p')
    meta.textContent = `${repairText(finding.repairability)} · ${stateText(finding.state)} · ${categoryText(finding.category)}`
    article.append(head, id, body, meta)
    if (finding.evidence.length > 0) {
      const evidence = document.createElement('p')
      evidence.textContent = labelled(
        t('doctor.evidence'),
        finding.evidence
          .map((item) =>
            item.entry ? `${item.entry} — ${evidenceText(item)}` : evidenceText(item),
          )
          .join(' · '),
      )
      article.append(evidence)
    }
    const consequences = document.createElement('p')
    const consequence = ruleText(finding.ruleId, 'consequence') || finding.consequences
    consequences.textContent = labelled(t('doctor.consequences'), consequence)
    article.append(consequences)
    if (finding.sources.length > 0) {
      const sources = document.createElement('p')
      sources.textContent = labelled(t('doctor.sources'), finding.sources.join(', '))
      article.append(sources)
    }
    if (finding.activityId !== undefined && deps.hasActivity(finding.activityId)) {
      const jump = document.createElement('button')
      jump.type = 'button'
      jump.className = 'btn-outline'
      jump.textContent = t('doctor.showActivity', { id: finding.activityId })
      const activityId = finding.activityId
      jump.addEventListener('click', () => {
        restoreFocus = false
        dialog.close()
        deps.openActivity(activityId)
      })
      article.append(jump)
    }
    item.append(article)
    return item
  }

  function renderActions(): void {
    const findings = report?.findings ?? []
    const safe = findings.filter((finding) => finding.repair?.safety === 'automatic')
    selectedBtn.disabled = busy || selected.size === 0
    safeBtn.disabled = busy || safe.length === 0
    previewBtn.disabled = busy || selected.size === 0
    downloadBtn.disabled = busy || repaired === undefined
    jsonBtn.disabled = busy || report === undefined
    textBtn.disabled = busy || report === undefined
    reanalyzeBtn.disabled = busy || (repaired ?? source) === undefined
    if (!confirming) previewEl.hidden = true
  }

  function showPreview(): void {
    previewEl.replaceChildren()
    previewEl.hidden = false
    const heading = document.createElement('h3')
    heading.id = 'doctor-preview-title'
    heading.textContent = t('doctor.previewTitle')
    previewEl.append(heading)
    const local = document.createElement('p')
    local.textContent = t('doctor.preview.local')
    previewEl.append(local)
    const chosen = (report?.findings ?? []).filter(
      (finding) => selected.has(finding.id) && finding.repair,
    )
    if (chosen.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = t('doctor.selectRepair')
      previewEl.append(empty)
      return
    }
    for (const finding of chosen) {
      const plan = finding.repair
      if (!plan) continue
      const block = document.createElement('article')
      const title = document.createElement('h4')
      title.textContent = ruleText(finding.ruleId, 'title')
      const summary = document.createElement('p')
      summary.textContent = plan.summary
      const why = document.createElement('p')
      why.textContent = labelled(t('doctor.preview.why'), plan.why)
      const files = document.createElement('p')
      files.textContent = labelled(t('doctor.preview.entries'), plan.entries.join(', '))
      const loss = document.createElement('p')
      loss.textContent = plan.contentLoss ? t('doctor.preview.loss') : t('doctor.preview.keep')
      const reversible = document.createElement('p')
      reversible.textContent = t('doctor.preview.reversible')
      block.append(title, summary, why, files, loss, reversible)
      for (const change of plan.preview) {
        block.append(previewPair(t('doctor.preview.before'), change.before))
        block.append(previewPair(t('doctor.preview.after'), change.after))
      }
      previewEl.append(block)
    }
    previewEl.scrollIntoView({ block: 'nearest' })
  }

  function renderLimitations(): void {
    if (!report) {
      limitationsEl.hidden = true
      limitationsEl.replaceChildren()
      return
    }
    limitationsEl.hidden = false
    limitationsEl.replaceChildren()
    const heading = document.createElement('h3')
    heading.id = 'doctor-limits-title'
    heading.textContent = t('doctor.limitations')
    const list = document.createElement('ul')
    for (const line of report.limitations) {
      const item = document.createElement('li')
      item.textContent = limitationText(line)
      list.append(item)
    }
    if (applied.length > 0) {
      const item = document.createElement('li')
      item.textContent = labelled(t('doctor.applied'), applied.map((item) => item.id).join(', '))
      list.append(item)
    }
    if (skipped.length > 0) {
      const item = document.createElement('li')
      item.textContent = labelled(t('doctor.skipped'), skipped.join(', '))
      list.append(item)
    }
    if (note) {
      const item = document.createElement('li')
      item.textContent = localizeNote(note)
      list.append(item)
    }
    limitationsEl.append(heading, list)
  }

  function matchesFilter(finding: Finding): boolean {
    if (severityFilter.value && finding.severity !== severityFilter.value) return false
    if (categoryFilter.value && finding.category !== categoryFilter.value) return false
    if (repairFilter.value && finding.repairability !== repairFilter.value) return false
    if (activityFilter.value && String(finding.activityId ?? '') !== activityFilter.value)
      return false
    return true
  }

  function downloadJson(): void {
    if (!report || !source) return
    const json = reportJson(report, { applied, skipped, note })
    triggerDownload(
      new Blob([json], { type: 'application/json' }),
      `${stem(source.name)}-doctor.json`,
    )
  }

  function downloadText(): void {
    if (!report || !source) return
    triggerDownload(
      new Blob([humanReport(report, applied, skipped, note)], { type: 'text/plain' }),
      `${stem(source.name)}-doctor.txt`,
    )
  }

  function setStatus(message: string): void {
    statusEl.textContent = message
  }
}

function humanReport(
  report: DiagnosticReport,
  applied: readonly { readonly id: string }[],
  skipped: readonly string[],
  note: string,
): string {
  const facts = report.facts
  const lines = [
    t('doctor.title'),
    labelled(t('doctor.report.generated'), report.generatedAt),
    labelled(t('doctor.facts.file'), facts.filename),
    labelled(t('doctor.facts.format'), formatName(facts.format)),
    labelled(t('doctor.facts.size'), formatBytes(facts.bytes)),
    labelled(t('doctor.facts.release'), facts.moodleRelease || t('doctor.facts.unset')),
    labelled(t('doctor.facts.course'), facts.courseName || t('doctor.facts.unset')),
    labelled(t('doctor.facts.target'), facts.targetRelease || t('doctor.facts.unset')),
    t('doctor.report.privacy'),
    '',
  ]
  for (const finding of report.findings) {
    lines.push(`[${severityText(finding.severity)}] ${ruleText(finding.ruleId, 'title')}`)
    lines.push(finding.id)
    lines.push(ruleText(finding.ruleId, 'body'))
    const consequence = ruleText(finding.ruleId, 'consequence')
    if (consequence) lines.push(labelled(t('doctor.consequences'), consequence))
    lines.push(`${repairText(finding.repairability)} · ${stateText(finding.state)}`)
    for (const item of finding.evidence) {
      lines.push(`- ${item.entry ? labelled(item.entry, evidenceText(item)) : evidenceText(item)}`)
    }
    lines.push('')
  }
  if (applied.length > 0)
    lines.push(labelled(t('doctor.applied'), applied.map((item) => item.id).join(', ')))
  if (skipped.length > 0) lines.push(labelled(t('doctor.skipped'), skipped.join(', ')))
  lines.push(t('doctor.limitations'))
  for (const line of report.limitations) lines.push(`- ${limitationText(line)}`)
  lines.push(localizeNote(note) || t('doctor.honesty'))
  lines.push(t('doctor.jsonNote'))
  return lines.join('\n')
}

function previewPair(label: string, text: string): HTMLElement {
  const wrap = document.createElement('div')
  const caption = document.createElement('p')
  caption.textContent = label
  const pre = document.createElement('pre')
  pre.tabIndex = 0
  const code = document.createElement('code')
  code.textContent = text
  pre.append(code)
  wrap.append(caption, pre)
  return wrap
}

function tally(report: DiagnosticReport): {
  critical: number
  warning: number
  info: number
  repairs: number
  manual: number
  external: number
} {
  let critical = 0
  let warning = 0
  let info = 0
  let repairs = 0
  let manual = 0
  let external = 0
  for (const finding of report.findings) {
    if (finding.severity === 'critical') critical += 1
    else if (finding.severity === 'warning') warning += 1
    else info += 1
    if (finding.repair) repairs += 1
    if (finding.repairability === 'manual') manual += 1
    if (finding.state === 'external-verification-required' || finding.category === 'environment')
      external += 1
  }
  return { critical, warning, info, repairs, manual, external }
}

function fillStaticFilters(): void {
  const severity = mustSelect('doctor-filter-severity')
  const repair = mustSelect('doctor-filter-repair')
  fillOptions(severity, [
    ['', t('doctor.filter.all')],
    ['critical', t('doctor.severity.critical')],
    ['warning', t('doctor.severity.warning')],
    ['info', t('doctor.severity.info')],
  ])
  fillOptions(repair, [
    ['', t('doctor.filter.all')],
    ['automatic', t('doctor.repair.automatic')],
    ['confirmation-required', t('doctor.repair.confirmation-required')],
    ['manual', t('doctor.repair.manual')],
    ['not-repairable', t('doctor.repair.not-repairable')],
  ])
}

function categories(report: DiagnosticReport): readonly (readonly [string, string])[] {
  const values = [...new Set(report.findings.map((finding) => finding.category))]
  return [
    ['', t('doctor.filter.all')],
    ...values.map((value) => [value, categoryText(value)] as const),
  ]
}

function activities(report: DiagnosticReport): readonly (readonly [string, string])[] {
  const ids = [
    ...new Set(
      report.findings.flatMap((finding) =>
        finding.activityId === undefined ? [] : [finding.activityId],
      ),
    ),
  ]
  return [
    ['', t('doctor.filter.all')],
    ...ids.map((id) => [String(id), t('doctor.showActivity', { id })] as const),
  ]
}

function refill(
  select: HTMLSelectElement,
  options: readonly (readonly [string, string])[],
  previous: string,
): void {
  fillOptions(select, options)
  select.value = [...select.options].some((option) => option.value === previous) ? previous : ''
}

function fillOptions(
  select: HTMLSelectElement,
  options: readonly (readonly [string, string])[],
): void {
  select.replaceChildren()
  for (const [value, label] of options) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    select.append(option)
  }
}

function ruleText(ruleId: string, part: 'title' | 'body' | 'consequence'): string {
  const key = `doctor.rule.${ruleId}.${part}` as StringKey
  if (!(key in STRINGS.en)) return part === 'title' ? ruleId : ''
  return t(key)
}

/** Translated evidence; params come from the backup and are filled once (#41). */
export function evidenceText(item: Evidence): string {
  if (item.code === undefined) return item.detail
  const key = `doctor.evidence.${item.code}` as StringKey
  if (!(key in STRINGS.en)) return item.detail
  return fillEvidence(t(key), item.params ?? {})
}

function limitationText(line: string): string {
  for (const key of Object.keys(STRINGS.en) as StringKey[]) {
    if (key.startsWith('doctor.limit.') && STRINGS.en[key] === line) return t(key)
  }
  return line
}

function localizeNote(note: string): string {
  if (note === STRINGS.en['doctor.honesty']) return t('doctor.honesty')
  return note
}

function severityText(severity: Severity): string {
  return keyed(`doctor.severity.${severity}`, severity)
}

function repairText(repairability: Repairability): string {
  return keyed(`doctor.repair.${repairability}`, repairability)
}

function stateText(state: string): string {
  return keyed(`doctor.state.${state}`, state)
}

function categoryText(category: string): string {
  return keyed(`doctor.category.${category}`, category)
}

function progressText(code: string): string {
  return keyed(`doctor.progress.${code}`, code)
}

function keyed(key: string, fallback: string): string {
  const typed = key as StringKey
  return typed in STRINGS.en ? t(typed) : fallback
}

function formatName(format: DiagnosticReport['facts']['format']): string {
  if (format === 'zip') return t('doctor.format.zip')
  if (format === 'targz') return t('doctor.format.targz')
  return t('doctor.format.unknown')
}

function flag(value: boolean | undefined): string {
  if (value === true) return t('doctor.facts.yes')
  if (value === false) return t('doctor.facts.no')
  return t('doctor.facts.unset')
}

function stem(name: string): string {
  return name.replace(/\.tar\.gz$/i, '').replace(/\.(mbz|zip|gz|tgz)$/i, '')
}

function repairedName(name: string): string {
  return `${stem(name)}-repaired.mbz`
}

function triggerDownload(payload: Blob, fileName: string): void {
  const url = URL.createObjectURL(payload)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function must(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing #${id}`)
  return node
}

function mustButton(id: string): HTMLButtonElement {
  const node = must(id)
  if (!(node instanceof HTMLButtonElement)) throw new Error(`#${id} is not a button`)
  return node
}

function mustInput(id: string): HTMLInputElement {
  const node = must(id)
  if (!(node instanceof HTMLInputElement)) throw new Error(`#${id} is not an input`)
  return node
}

function mustSelect(id: string): HTMLSelectElement {
  const node = must(id)
  if (!(node instanceof HTMLSelectElement)) throw new Error(`#${id} is not a select`)
  return node
}

function mustDialog(id: string): HTMLDialogElement {
  const node = must(id)
  if (!(node instanceof HTMLDialogElement)) throw new Error(`#${id} is not a dialog`)
  return node
}
