/**
 * Content renderers for activity modules (ADR-0013 capability matrix).
 *
 * Security: HTML from the backup is sanitized with DOMPurify before it is
 * ever inserted into the document (ADR-0012); binary content is previewed
 * through sandboxed contexts (iframe/embed/img) or offered as download.
 */

import type { ActivityInfo, BackupFileRecord, ParsedBackup, QuizQuestion } from '@mbzoo/core'
import {
  contentHashPath,
  matchFileRecord,
  parseActivityXml,
  parseQuestionsXml,
  parseQuizQuestionIds,
} from '@mbzoo/core'
import DOMPurify from 'dompurify'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { t } from './lib/i18n.ts'
import {
  contentKind,
  formatBytes,
  guessMime,
  injectCsp,
  MAX_PDF_PAGES,
  resolveRelative,
  SANDBOX_CSP,
} from './lib/preview-utils.ts'

// pdf.js renders PDFs onto canvas (ADR-0014): Chrome blocks blob-PDF iframes
// inside sandboxed contexts.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

/** Reads an archive entry (by path or 40-char sha1) through the worker. */
export type EntryReader = (path: string) => Promise<Uint8Array>

export interface RenderContext {
  readonly backup: ParsedBackup
  readonly readEntry: EntryReader
}

export class Renderer {
  private readonly urls: string[] = []

  constructor(private readonly ctx: RenderContext) {}

  /** Creates a managed object URL that is revoked on next render/close. */
  blobUrl(data: Uint8Array, mime: string): string {
    const url = URL.createObjectURL(
      new Blob([data.buffer as ArrayBuffer], { type: mime || 'application/octet-stream' }),
    )
    this.urls.push(url)
    return url
  }

  dispose(): void {
    for (const u of this.urls) URL.revokeObjectURL(u)
    this.urls.length = 0
  }

  async renderActivity(activity: ActivityInfo, container: HTMLElement): Promise<void> {
    this.dispose()
    const xmlBytes = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const parsed = xmlBytes ? await parseActivityXml(new TextDecoder().decode(xmlBytes)) : undefined
    const fields = parsed?.fields ?? new Map<string, string>()
    const contextId = parsed?.contextId ?? ''
    const mod = activity.moduleName

    if (mod === 'page') {
      await this.renderHtmlActivity(
        fields.get('intro'),
        fields.get('content'),
        'mod_page',
        'content',
        contextId,
        container,
      )
      return
    }
    if (mod === 'label') {
      await this.renderHtmlActivity(
        fields.get('intro'),
        undefined,
        'mod_label',
        'intro',
        contextId,
        container,
      )
      return
    }
    if (mod === 'url') {
      await this.renderUrl(fields, container)
      return
    }
    if (mod === 'resource' || mod === 'file' || mod === 'folder') {
      await this.renderFileList(mod, contextId, fields, container)
      return
    }
    if (mod === 'quiz') {
      await this.renderQuiz(activity, fields, contextId, container)
      return
    }
    // Known module families without a dedicated body renderer: show the
    // intro (if any) plus an advanced/metadata disclosure (ADR-0013).
    await this.renderIntroPlusMetadata(mod, fields, contextId, container)
  }

  private async tryRead(path: string): Promise<Uint8Array | undefined> {
    try {
      return await this.ctx.readEntry(path)
    } catch {
      return undefined
    }
  }

  /**
   * Replaces @@PLUGINFILE@@ references with managed blob URLs and returns
   * sanitized HTML (ADR-0012).
   */
  async resolveHtml(
    html: string | undefined,
    componentName: string,
    fileArea: string,
    contextId: string,
  ): Promise<string> {
    if (!html) return ''
    // Replace over the RAW text: refs are URL-encoded in backup HTML
    // (e.g. @@PLUGINFILE@@/My%20File.jpg) and must be matched verbatim.
    const matches = [...html.matchAll(/@@PLUGINFILE@@[^"'#\s)>]+/g)]
    const resolvedParts: string[] = []
    let cursor = 0
    for (const m of matches) {
      const raw = m[0]
      const index = m.index ?? 0
      resolvedParts.push(html.slice(cursor, index))
      cursor = index + raw.length
      const ref = decodeURIComponent(raw.slice('@@PLUGINFILE@@'.length).replace(/^\//, ''))
      const rec = matchFileRecord(this.ctx.backup.files, {
        fileName: ref,
        contextId: contextId === '' ? undefined : contextId,
        componentName,
        fileArea,
      })
      if (!rec) {
        resolvedParts.push(raw) // keep original token if unresolved
        continue
      }
      const data = await this.tryRead(contentHashPath(rec.contentHash))
      if (!data) {
        resolvedParts.push(raw)
        continue
      }
      resolvedParts.push(this.blobUrl(data, rec.mimeType || guessMime(rec.fileName)))
    }
    resolvedParts.push(html.slice(cursor))
    return sanitizeHtml(resolvedParts.join(''))
  }

  private async renderHtmlActivity(
    intro: string | undefined,
    content: string | undefined,
    componentName: string,
    fileArea: string,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    const introHtml = await this.resolveHtml(intro, componentName, fileArea, contextId)
    const contentHtml = await this.resolveHtml(content, componentName, fileArea, contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }
    if (contentHtml) {
      const el = document.createElement('div')
      el.className = 'activity-content'
      el.innerHTML = contentHtml
      container.appendChild(el)
    } else if (!introHtml) {
      notAvailable(container)
    }
  }

  private async renderUrl(fields: Map<string, string>, container: HTMLElement): Promise<void> {
    const introHtml = await this.resolveHtml(fields.get('intro'), 'mod_url', 'intro', '')
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }
    const target = fields.get('externalurl') ?? ''
    if (/^https?:\/\//i.test(target)) {
      const a = document.createElement('a')
      a.href = target
      a.target = '_blank'
      a.rel = 'noreferrer noopener nofollow'
      a.className = 'button-link'
      a.textContent = `Open external link ↗`
      container.appendChild(a)
      const code = document.createElement('code')
      code.className = 'url-target'
      code.textContent = target
      container.appendChild(code)
    } else if (target) {
      const p = document.createElement('p')
      p.textContent = `Unsupported URL target: ${target}`
      container.appendChild(p)
    }
    if (!introHtml && !target) notAvailable(container)
  }

  private async renderFileList(
    mod: string,
    contextId: string,
    fields: Map<string, string>,
    container: HTMLElement,
  ): Promise<void> {
    const introHtml = await this.resolveHtml(fields.get('intro'), `mod_${mod}`, 'intro', contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }

    const records = [...this.ctx.backup.files.values()].filter(
      (f) =>
        f.component === `mod_${mod}` &&
        f.fileArea === 'content' &&
        f.fileName !== '.' &&
        f.fileSize > 0 &&
        (contextId === '' || f.contextId === contextId),
    )
    if (records.length === 0) {
      if (!introHtml) notAvailable(container)
      return
    }
    for (const rec of sortRecords(records)) {
      container.appendChild(await this.filePreview(rec))
    }
  }

  /** Builds a preview card: inline when safe/possible, download otherwise. */
  async filePreview(rec: BackupFileRecord): Promise<HTMLElement> {
    const card = document.createElement('div')
    card.className = 'file-card'
    const head = document.createElement('div')
    head.className = 'file-head'
    const nameSpan = document.createElement('span')
    nameSpan.textContent = `${rec.fileName} (${formatBytes(rec.fileSize)})`
    const kind = document.createElement('span')
    kind.className = 'type-chip'
    kind.textContent = contentKind(rec.mimeType || guessMime(rec.fileName), rec.fileName)
    head.append(nameSpan, kind)
    card.appendChild(head)

    const data = await this.tryRead(contentHashPath(rec.contentHash)).catch(() => undefined)
    if (!data) return card

    const mime = rec.mimeType || guessMime(rec.fileName)
    if (mime.startsWith('image/')) {
      const img = document.createElement('img')
      img.src = this.blobUrl(data, mime)
      img.alt = rec.fileName
      img.loading = 'lazy'
      card.appendChild(img)
      addDownload(card, this.blobUrl(data, mime), rec.fileName)
      return card
    }
    if (mime === 'application/pdf') {
      await this.renderPdf(data, rec, card)
      addDownload(card, this.blobUrl(data, mime), rec.fileName)
      return card
    }
    if (mime === 'text/html' || /\.html?$/i.test(rec.fileName)) {
      await this.renderSandboxedHtml(data, rec, card)
      addDownload(card, this.blobUrl(data, mime), rec.fileName)
      return card
    }
    if (mime.startsWith('text/') || mime.includes('json')) {
      const text = new TextDecoder().decode(data.slice(0, 256 * 1024))
      const pre = document.createElement('pre')
      pre.textContent = text
      pre.className = 'text-preview'
      card.appendChild(pre)
      addDownload(card, this.blobUrl(data, mime), rec.fileName)
      return card
    }
    addDownload(card, this.blobUrl(data, mime), rec.fileName)
    return card
  }

  /** Draws PDF pages onto canvases with pdf.js (ADR-0014). */
  private async renderPdf(
    data: Uint8Array,
    rec: BackupFileRecord,
    card: HTMLElement,
  ): Promise<void> {
    try {
      const doc = await pdfjs.getDocument({ data: data.slice() }).promise
      const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(2, Math.max(1, 900 / base.width))
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.className = 'pdf-canvas'
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        await page.render({
          canvas,
          canvasContext: canvas.getContext('2d') as CanvasRenderingContext2D,
          viewport,
        }).promise
        card.appendChild(canvas)
      }
      if (doc.numPages > MAX_PDF_PAGES) {
        const note = document.createElement('p')
        note.className = 'fallback-note'
        note.textContent = `Showing ${MAX_PDF_PAGES} of ${doc.numPages} pages — use Download for the rest.`
        card.appendChild(note)
      }
    } catch {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = `Could not render “${rec.fileName}” inline — use Download.`
      card.appendChild(note)
    }
  }

  /**
   * Renders a backup HTML file inside an opaque-origin sandboxed iframe
   * (ADR-0014): scripts may run but cannot touch the app, and the injected
   * CSP blocks all network access. Relative references are rewritten to
   * blob URLs of sibling archive files when found.
   */
  private async renderSandboxedHtml(
    data: Uint8Array,
    rec: BackupFileRecord,
    card: HTMLElement,
  ): Promise<void> {
    let html = new TextDecoder().decode(data)
    const dir = rec.filePath.replace(/[^/]+$/, '')
    html = await this.rewriteRelativeRefs(html, dir, rec)
    html = injectCsp(html, SANDBOX_CSP)
    const frame = document.createElement('iframe')
    frame.src = this.blobUrl(new TextEncoder().encode(html), 'text/html')
    frame.title = rec.fileName
    frame.className = 'html-frame'
    // allow-scripts only: opaque origin — no same-origin access to the app.
    frame.sandbox.add('allow-scripts')
    card.appendChild(frame)
  }

  /** Rewrites relative src/href references to blob URLs of archive files. */
  private async rewriteRelativeRefs(
    html: string,
    dir: string,
    owner: BackupFileRecord,
  ): Promise<string> {
    const re = /\s(src|href)=("([^"]*)"|'([^']*)')/gi
    const refs: Array<{ raw: string; ref: string }> = []
    for (const m of html.matchAll(re)) {
      const ref = (m[3] ?? m[4] ?? '').trim()
      if (!ref || ref.startsWith('#') || /^(https?:|data:|blob:|mailto:|javascript:)/i.test(ref)) {
        continue
      }
      refs.push({ raw: m[0], ref })
    }
    for (const { raw, ref } of refs) {
      const target = resolveRelative(dir, ref)
      // Prefer assets scoped to the same activity context; fall back to a
      // path-suffix search for shared folders.
      const fileName = target.split('/').pop() ?? ''
      const rec =
        matchFileRecord(this.ctx.backup.files, {
          fileName,
          contextId: owner.contextId,
          componentName: owner.component,
        }) ?? (await this.findByPathSuffix(target))
      if (!rec) continue
      const bytes = await this.tryRead(contentHashPath(rec.contentHash))
      if (!bytes) continue
      const url = this.blobUrl(bytes, rec.mimeType || guessMime(rec.fileName))
      const quote = raw.includes('"') ? '"' : "'"
      const attr = /src=/i.test(raw) ? 'src' : 'href'
      html = html.replace(raw, ` ${attr}=${quote}${url}${quote}`)
    }
    return html
  }

  private async findByPathSuffix(path: string): Promise<BackupFileRecord | undefined> {
    const needle = path.replace(/^\//, '')
    for (const r of this.ctx.backup.files.values()) {
      if ((r.filePath + r.fileName).replace(/^\//, '').endsWith(needle)) return r
    }
    return undefined
  }

  /** Intro rendered as HTML plus a collapsible raw-metadata disclosure. */
  private async renderIntroPlusMetadata(
    mod: string,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    const introHtml = await this.resolveHtml(fields.get('intro'), `mod_${mod}`, 'intro', contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    } else {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('noRenderer', { mod })
      container.appendChild(note)
    }
    container.appendChild(this.buildAdvanced(fields))
  }

  /** <details> with the raw Moodle fields (ADR-0013 inspect capability). */
  private buildAdvanced(fields: Map<string, string>): HTMLElement {
    const details = document.createElement('details')
    details.className = 'advanced'
    const summary = document.createElement('summary')
    summary.textContent = `${t('advanced')} (${fields.size})`
    details.appendChild(summary)
    const dl = document.createElement('dl')
    dl.className = 'meta-list'
    for (const [k, v] of fields) {
      const dt = document.createElement('dt')
      dt.textContent = k
      const dd = document.createElement('dd')
      dd.textContent = v.length > 400 ? `${v.slice(0, 400)}…` : v
      dl.append(dt, dd)
    }
    details.appendChild(dl)
    return details
  }

  /** Read-only quiz inspection with question navigation (prompt §6). */
  private async renderQuiz(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    const introHtml = await this.resolveHtml(fields.get('intro'), 'mod_quiz', 'intro', contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }

    const notice = document.createElement('p')
    notice.className = 'quiz-notice'
    notice.textContent = t('quiz.inspectOnly')
    container.appendChild(notice)

    let questionIds: number[] = []
    const quizXml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    if (quizXml) {
      questionIds = await parseQuizQuestionIds(new TextDecoder().decode(quizXml))
    }
    const bank = await this.questionBank()
    const questions: QuizQuestion[] = []
    for (const id of questionIds) {
      const q = bank.get(id)
      if (q) questions.push(q)
    }
    if (questions.length === 0) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('quiz.noQuestions')
      container.appendChild(note)
      return
    }

    let index = 0
    const nav = document.createElement('div')
    nav.className = 'quiz-nav'
    const prev = document.createElement('button')
    prev.type = 'button'
    prev.className = 'btn-outline'
    prev.textContent = `‹ ${t('prev')}`
    const counter = document.createElement('span')
    counter.className = 'quiz-counter'
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'btn-outline'
    next.textContent = `${t('next')} ›`
    nav.append(prev, counter, next)
    container.appendChild(nav)

    const card = document.createElement('div')
    card.className = 'quiz-card'
    container.appendChild(card)

    const showQuestion = (i: number): void => {
      index = Math.max(0, Math.min(questions.length - 1, i))
      counter.textContent = `${t('quiz.question')} ${index + 1} ${t('quiz.of')} ${questions.length}`
      prev.toggleAttribute('disabled', index === 0)
      next.toggleAttribute('disabled', index === questions.length - 1)
      card.replaceChildren(this.questionCard(questions[index] as QuizQuestion))
    }
    prev.addEventListener('click', () => showQuestion(index - 1))
    next.addEventListener('click', () => showQuestion(index + 1))
    showQuestion(0)
  }

  private questionBankCache: Map<number, QuizQuestion> | undefined
  private async questionBank(): Promise<Map<number, QuizQuestion>> {
    this.questionBankCache ??= await (async () => {
      const bytes = await this.tryRead('questions.xml')
      if (!bytes) return new Map()
      return parseQuestionsXml(new TextDecoder().decode(bytes))
    })()
    return this.questionBankCache
  }

  private questionCard(q: QuizQuestion): HTMLElement {
    const el = document.createElement('div')
    const head = document.createElement('div')
    head.className = 'quiz-q-head'
    const badge = document.createElement('span')
    badge.className = 'mod-badge t-blue'
    badge.textContent = q.qtype
    const name = document.createElement('strong')
    name.textContent = q.name
    head.append(badge, ' ', name)
    el.appendChild(head)

    const body = document.createElement('div')
    body.className = 'activity-content'
    body.innerHTML = sanitizeHtml(q.questionText)
    el.appendChild(body)

    if (q.answers.length > 0) {
      const list = document.createElement('ol')
      list.className = 'q-answers'
      for (const a of q.answers) {
        const li = document.createElement('li')
        li.className =
          a.fraction >= 1
            ? 'q-correct'
            : a.fraction > 0
              ? 'q-partial'
              : a.fraction < 0
                ? 'q-penalty'
                : 'q-neutral'
        const text = document.createElement('span')
        text.innerHTML = sanitizeHtml(a.text)
        const mark = document.createElement('em')
        mark.className = 'q-fraction'
        mark.textContent =
          a.fraction >= 1
            ? `✓ ${t('quiz.correct')}`
            : a.fraction > 0
              ? `~ ${t('quiz.partial')}`
              : a.fraction < 0
                ? `✗ ${t('quiz.wrong')}`
                : ''
        li.append(text, ' ', mark)
        list.appendChild(li)
      }
      const title = document.createElement('div')
      title.className = 'q-answers-title'
      title.textContent = t('quiz.answers')
      el.append(title, list)
    }
    el.appendChild(this.buildAdvanced(new Map()))
    return el
  }
}

function sortRecords(records: BackupFileRecord[]): BackupFileRecord[] {
  return [...records].sort((a, b) =>
    (a.filePath + a.fileName).localeCompare(b.filePath + b.fileName),
  )
}

function addDownload(card: HTMLElement, url: string, name: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.textContent = 'Download'
  a.className = 'button-link'
  card.appendChild(a)
}

function notAvailable(container: HTMLElement): void {
  const p = document.createElement('p')
  p.className = 'fallback-note'
  p.textContent = 'This item stores no additional content in the backup.'
  container.appendChild(p)
}

/** DOMPurify wrapper — the single sanitization point (ADR-0012). */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: false } })
}

function moduleNameDir(a: ActivityInfo): string {
  // Directory convention from moodle_backup.xml <directory>: activities/<mod>_<id>.
  return `activities/${a.moduleName}_${a.id}/${a.moduleName}`
}
