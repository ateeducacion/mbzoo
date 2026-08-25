/**
 * Content renderers for activity modules (ADR-0013 capability matrix).
 *
 * Security: HTML from the backup is sanitized with DOMPurify before it is
 * ever inserted into the document (ADR-0012); binary content is previewed
 * through sandboxed contexts (iframe/embed/img) or offered as download.
 */

import type {
  ActivityInfo,
  BackupFileRecord,
  BookChapter,
  ParsedBackup,
  QuizQuestion,
} from '@mbzoo/core'
import {
  backupLinkUrl,
  contentHashPath,
  decodeBackupLink,
  defaultLaunchSco,
  isScorm2004,
  legacyModule,
  matchFileRecord,
  parseActivityXml,
  parseBookXml,
  parseQuestionsXml,
  parseQuizQuestionIds,
  parseScormXml,
  resolveQuizSlots,
} from '@mbzoo/core'
import DOMPurify from 'dompurify'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  composeChapter,
  type EpubBook,
  isEpubFileName,
  readEpub,
  unzipEpub,
  unzipPackage,
} from './lib/epub-reader.ts'
import { exeSiteBook, isExeFileName, readExePackage } from './lib/exe-package.ts'
import { classifyProvider, scanExternalRefs } from './lib/external-refs.ts'
import {
  buildPlayerHtml,
  type H5pEntries,
  isH5pFileName,
  type PlayerAssets,
  unzipH5p,
  vfsHeadScripts,
} from './lib/h5p-player.ts'
import { composeHvpEntries, hvpFields } from './lib/hvp-package.ts'
import { t } from './lib/i18n.ts'
import {
  ALLOWED_URI_REGEXP,
  contentKind,
  decodeRefPath,
  formatBytes,
  formatDate,
  guessMime,
  injectCsp,
  injectHead,
  MAX_PDF_PAGES,
  pageNavScript,
  parseNavigationRequest,
  placeholderizeEmbeds,
  resolveRelative,
  SANDBOX_CSP,
  SCORM_CSP,
  splitRef,
} from './lib/preview-utils.ts'
import {
  MAX_SCO_VFS_BYTES,
  runtimeScript,
  scormBootScript,
  scormToc,
  scoVfsKey,
  splitLaunch,
} from './lib/scorm-player.ts'

// pdf.js renders PDFs onto canvas (ADR-0014): Chrome blocks blob-PDF iframes
// inside sandboxed contexts.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

/** Reads an archive entry (by path or 40-char sha1) through the worker. */
export type EntryReader = (path: string) => Promise<Uint8Array>

export interface RenderContext {
  readonly backup: ParsedBackup
  readonly readEntry: EntryReader
}

/** One activity's module XML, read and parsed once for all three tabs. */
export interface ParsedActivity {
  readonly fields: Map<string, string>
  readonly contextId: string
  /** Plugin instance id from `<activity id>`; '' when the XML is missing. */
  readonly instanceId: string
  /** Raw XML source, or '' when the entry is missing or unreadable. */
  readonly xmlText: string
  readonly xmlPath: string
}

export class Renderer {
  private readonly urls: string[] = []
  /** Listeners registered by a render, torn down on the next one. */
  private readonly cleanups: Array<() => void> = []
  /**
   * Handles minted for files a course embedded in its HTML, and the object
   * URL each stands for. The handle travels through the sanitizer inside a
   * `data-` attribute; the URL never does (ADR-0012).
   */
  private readonly embeds = new Map<string, string>()
  /** Bytes behind each managed blob: URL, so exports can re-inline them. */
  private readonly blobSources = new Map<string, { data: Uint8Array; mime: string }>()

  constructor(private readonly ctx: RenderContext) {}

  /** Creates a managed object URL that is revoked on next render/close. */
  blobUrl(data: Uint8Array, mime: string): string {
    const type = mime || 'application/octet-stream'
    const url = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type }))
    this.urls.push(url)
    this.blobSources.set(url, { data, mime: type })
    return url
  }

  /** Revokes managed object URLs early, before the next full dispose(). */
  private revoke(urls: readonly string[]): void {
    for (const u of urls) {
      URL.revokeObjectURL(u)
      this.blobSources.delete(u)
    }
  }

  dispose(): void {
    for (const fn of this.cleanups) fn()
    this.cleanups.length = 0
    this.embeds.clear()
    for (const u of this.urls) URL.revokeObjectURL(u)
    this.urls.length = 0
    this.blobSources.clear()
  }

  /** Archive path of an activity's module XML, as shown by the Raw tab. */
  activityXmlPath(activity: ActivityInfo): string {
    return `${moduleNameDir(activity)}.xml`
  }

  /**
   * Reads and parses an activity's module XML once. Preview, Info and Raw
   * all need the same bytes, so the panel parses up front and hands the
   * result to each tab instead of re-reading per tab.
   */
  async parseActivity(activity: ActivityInfo): Promise<ParsedActivity> {
    const xmlPath = this.activityXmlPath(activity)
    const xmlBytes = await this.tryRead(xmlPath)
    const xmlText = xmlBytes ? new TextDecoder().decode(xmlBytes) : ''
    const parsed = xmlText ? await parseActivityXml(xmlText) : undefined
    return {
      fields: parsed?.fields ?? new Map<string, string>(),
      contextId: parsed?.contextId ?? '',
      instanceId: parsed?.instanceId ?? '',
      xmlText,
      xmlPath,
    }
  }

  /** File records belonging to this activity's Moodle context. */
  activityFiles(parsed: ParsedActivity): BackupFileRecord[] {
    if (parsed.contextId === '') return []
    return sortRecords(
      [...this.ctx.backup.files.values()].filter(
        (f) => f.contextId === parsed.contextId && f.fileName !== '.' && f.fileSize > 0,
      ),
    )
  }

  /** Reads one file record's bytes, or undefined when unreadable. */
  readFileRecord(rec: BackupFileRecord): Promise<Uint8Array | undefined> {
    return this.tryRead(contentHashPath(rec.contentHash))
  }

  async renderActivity(
    activity: ActivityInfo,
    parsedActivity: ParsedActivity,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderActivityBody(activity, parsedActivity, container)
    // An embed promoted by placeholderizeEmbeds is inert markup until it is
    // turned into a real preview, so that runs on the body before anything
    // is appended after it.
    await this.hydrateEmbeds(container)
    // What the activity is worth and how it is judged sit in sibling files,
    // not in the module payload, so they are appended for every module rather
    // than repeated in each renderer.
    await this.renderGradeItem(activity, container)
    await this.renderGradingForm(activity, container)
  }

  /**
   * Turns each `<div data-mbz-embed>` left by placeholderizeEmbeds into the
   * preview it stands for. The bytes come from the blob URL MBZoo minted for
   * that file, so nothing is fetched and nothing is re-parsed from the page.
   */
  private async hydrateEmbeds(container: HTMLElement): Promise<void> {
    for (const holder of [...container.querySelectorAll('[data-mbz-embed]')]) {
      // The attribute is backup-reachable, so it is only ever a lookup key.
      // The URL comes from our own map, never from the document.
      const url = this.embeds.get(holder.getAttribute('data-mbz-embed') ?? '')
      if (url === undefined) {
        holder.remove()
        continue
      }
      if (/^https?:\/\//i.test(url)) {
        holder.replaceWith(externalEmbedCard(url))
        continue
      }
      const source = this.blobSources.get(url)
      if (!source) {
        holder.remove()
        continue
      }
      const card = document.createElement('div')
      card.className = 'file-card'
      if (source.mime === 'application/pdf') {
        await this.renderPdf(source.data, 'embedded.pdf', card)
      } else {
        const note = document.createElement('p')
        note.className = 'fallback-note'
        note.textContent = t('embed.notPreviewable')
        card.appendChild(note)
      }
      addDownload(card, url, embeddedFileName(source.mime))
      holder.replaceWith(card)
    }
  }

  private async renderActivityBody(
    activity: ActivityInfo,
    parsedActivity: ParsedActivity,
    container: HTMLElement,
  ): Promise<void> {
    this.dispose()
    const fields = parsedActivity.fields
    const contextId = parsedActivity.contextId
    const mod = activity.moduleName

    // Moodle can no longer restore a retired module, which makes reading it
    // the whole point of an inspector. Lead with that rather than rendering
    // it as if nothing had changed.
    const retired = legacyModule(mod)
    if (retired) {
      const note = document.createElement('p')
      note.className = 'quiz-notice legacy-notice'
      note.textContent = t('legacy.notice', {
        mod,
        version: retired.removedIn,
        issue: retired.issue,
      })
      container.appendChild(note)
    }

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
    if (mod === 'book') {
      await this.renderBook(activity, fields, contextId, container)
      return
    }
    if (mod === 'glossary') {
      await this.renderGlossary(activity, fields, contextId, container)
      return
    }
    if (mod === 'feedback') {
      await this.renderFeedback(activity, fields, contextId, container)
      return
    }
    if (mod === 'lesson') {
      await this.renderLesson(activity, fields, contextId, container)
      return
    }
    if (mod === 'choice') {
      await this.renderChoice(activity, fields, contextId, container)
      return
    }
    if (mod === 'data') {
      await this.renderDatabase(activity, fields, contextId, container)
      return
    }
    if (mod === 'workshop') {
      await this.renderWorkshop(activity, fields, contextId, container)
      return
    }
    if (mod === 'imscp') {
      await this.renderImscp(fields, contextId, container)
      return
    }
    if (mod === 'assignment') {
      // The pre-2.3 module, removed in Moodle 4.2. Its dates and type are
      // the authored settings; submissions are user data.
      await this.renderIntroPlusMetadataShell(
        fields,
        contextId,
        container,
        'mod_assignment',
        'intro',
      )
      container.appendChild(
        this.buildSummary([
          ['availableFrom', fields.get('timeavailable')],
          ['dueDate', fields.get('timedue')],
        ]),
      )
      // Shown verbatim: the 2.2 type codes have no mapping we can cite.
      container.appendChild(this.buildFacts([[t('assignment.type'), fields.get('assignmenttype')]]))
      return
    }
    if (mod === 'forum' || mod === 'chat' || mod === 'wiki') {
      await this.renderDiscussionLike(mod, fields, contextId, container)
      return
    }
    if (mod === 'assign') {
      await this.renderAssign(activity, fields, contextId, container)
      return
    }
    if (mod === 'exeweb') {
      await this.renderExeweb(fields, contextId, container)
      return
    }
    if (mod === 'scorm' || mod === 'exescorm') {
      await this.renderScorm(activity, fields, contextId, container)
      return
    }
    if (mod === 'hvp' || mod === 'h5pactivity') {
      await this.renderH5pActivity(
        activity,
        fields,
        contextId,
        container,
        parsedActivity.instanceId,
      )
      return
    }
    if (mod === 'qbank' || mod === 'lti' || mod === 'bigbluebuttonbn') {
      await this.renderToolLike(mod, fields, contextId, container)
      return
    }
    // Known module families without a dedicated body renderer: show the
    // intro (if any). Module metadata lives in the Info tab (ADR-0013).
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
  /** Keeps the raw HTML of the last resolveHtml call for ref scanning. */
  private lastRawHtml = ''

  /**
   * @param itemId Row the file area is keyed by, for the areas Moodle scopes
   *   per record rather than per activity — a lesson page's images are under
   *   `mod_lesson/page_contents` keyed by page id, a question's under
   *   `question/questiontext` keyed by question id. Omitted for the
   *   activity-wide areas like `intro`.
   */
  async resolveHtml(
    html: string | undefined,
    componentName: string,
    fileArea: string,
    contextId: string,
    itemId?: string,
  ): Promise<string> {
    this.lastRawHtml = html ?? ''
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
        ...(itemId === undefined ? {} : { itemId }),
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
    return this.safeHtml(resolvedParts.join(''))
  }

  /** Sanitization plus link decoding — the single path for backup HTML. */
  /**
   * The one path backup HTML takes to the DOM (ADR-0012).
   *
   * Embeds are promoted before sanitizing rather than in resolveHtml,
   * because several renderers — book chapters, rubric text, quiz stems —
   * reach this without resolving files first, and an <iframe> the sanitizer
   * deletes is content the reader never learns existed.
   */
  private safeHtml(html: string): string {
    const promoted = placeholderizeEmbeds(html, (url) => {
      const handle = crypto.randomUUID()
      this.embeds.set(handle, url)
      return handle
    })
    return this.resolveBackupLinks(sanitizeHtml(promoted))
  }

  /**
   * Decodes Moodle's `$@CODE*arg@$` link tokens (see core moodle/links.ts).
   *
   * Untouched, a token stays in the href and the browser resolves it against
   * MBZoo's own origin — a link that looks like ours and leads nowhere. Three
   * outcomes: an activity that travelled in this backup becomes in-app
   * navigation; anything the backup gives us a site for becomes a labelled
   * link to that Moodle, opened in a new tab and never fetched by us; the
   * rest keeps its text and loses its href, because a link MBZoo cannot
   * resolve must not pretend to lead somewhere.
   */
  private resolveBackupLinks(html: string): string {
    if (!html.includes('$@')) return html
    const wwwroot = this.ctx.backup.course.originalWwwroot
    const inBackup = new Set(this.ctx.backup.activities.map((a) => a.id))
    const tpl = document.createElement('template')
    tpl.innerHTML = html // already through sanitizeHtml (ADR-0012)

    for (const el of tpl.content.querySelectorAll('a[href]')) {
      const raw = el.getAttribute('href') ?? ''
      if (!raw.includes('$@')) continue
      el.removeAttribute('href')
      const link = decodeBackupLink(raw.trim())
      const url = link ? backupLinkUrl(link, wwwroot) : undefined
      const cmid = link?.moduleId
      if (cmid !== undefined && inBackup.has(cmid)) {
        el.setAttribute('data-mbz-activity', String(cmid))
        el.setAttribute('href', url ?? '#')
        el.setAttribute('title', t('link.internal'))
        el.classList.add('mbz-link-internal')
      } else if (url !== undefined) {
        el.setAttribute('href', url)
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer nofollow')
        el.setAttribute('title', t('link.original', { url }))
        el.classList.add('mbz-link-original')
      } else {
        // Still a link the author wrote: say so, and name the code, rather
        // than leaving text that silently stopped being a link.
        el.setAttribute(
          'title',
          link ? t('link.unresolvedCode', { code: link.code }) : t('link.unresolved'),
        )
        el.classList.add('mbz-link-dead')
      }
    }

    // Any token left in a URL attribute would be requested from MBZoo's
    // origin. Resolving one is not an option either: fetching course-
    // referenced remote content by itself is exactly what MBZoo does not do.
    for (const el of tpl.content.querySelectorAll('[href], [src], [srcset], [poster]')) {
      for (const attr of ['href', 'src', 'srcset', 'poster']) {
        if (el.getAttribute(attr)?.includes('$@')) el.removeAttribute(attr)
      }
    }
    return tpl.innerHTML
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
    this.renderExternalPanel(this.lastRawHtml, container)
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
    const urlMode = this.displayMode(fields.get('display'))
    if (urlMode) container.appendChild(this.buildFacts([[t('display.label'), urlMode]]))
    if (!introHtml && !target) notAvailable(container)
  }

  /**
   * RESOURCELIB_DISPLAY_* (lib/resourcelib.php, REPO-005): how the student
   * actually met the file. Only the modes that change the encounter are
   * named; 'auto' is Moodle's default and says nothing.
   */
  private displayMode(raw: string | undefined): string | undefined {
    const MODES: Record<string, string> = {
      '1': t('display.embed'),
      '2': t('display.frame'),
      '3': t('display.newWindow'),
      '4': t('display.download'),
      '5': t('display.open'),
      '6': t('display.popup'),
    }
    return raw === undefined ? undefined : MODES[raw]
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

    // Which of these files IS the resource? Moodle marks it with
    // sortorder = 1, and it is not a detail: a teacher who uploads a folder
    // gets every file in it stored under the activity, so a resource can
    // carry hundreds of files that are not the one it points at. Guessing by
    // filename picks the same entry for every resource sharing a folder —
    // six activities in SMR_SEGI (REPO-004) each carry the same 647-file unit
    // tree, and all six showed the same page.
    const main = records.find((f) => f.sortOrder === 1)

    if (main && !isHtmlRecord(main)) {
      // The resource is a single file that happens to travel with a folder:
      // show it, and leave the rest to the collapsed list.
      container.appendChild(await this.filePreview(main))
      appendSiblingList(container, records, main)
      return
    }

    // Website: an HTML entry point plus its assets, e.g. an eXeLearning
    // export. Scope the site to the entry's own directory so a resource does
    // not present another resource's pages as its own.
    const entry = main ?? pickWebsiteEntry(records)
    if (entry) {
      const dir = entry.filePath
      const scoped = records.filter((f) => f.filePath.startsWith(dir))
      await this.renderWebsite(scoped.length > 0 ? scoped : records, entry, container)
      return
    }

    for (const rec of sortRecords(records)) {
      container.appendChild(await this.filePreview(rec))
    }
  }

  /**
   * Mounts a set of sandboxed HTML pages with MBZoo's own navigation chrome:
   * a row of buttons, and the validated in-frame navigation bridge of
   * ADR-0022. Shared by multi-file websites and by SCORM packages so the
   * security-critical message handler exists exactly once.
   */
  private async mountNavigablePages(
    pages: BackupFileRecord[],
    entry: BackupFileRecord,
    container: HTMLElement,
    opts: {
      label: string
      hint: string
      buttonLabel: (rec: BackupFileRecord) => string
      buttonIndent?: (rec: BackupFileRecord) => number
      headScripts?: (rec: BackupFileRecord) => string[]
      csp?: string
    },
  ): Promise<void> {
    const holder = document.createElement('div')
    const pagePaths = new Set(pages.map(recordFullPath))

    if (pages.length <= 1) {
      container.appendChild(holder)
      holder.appendChild(
        await this.filePreview(entry, {
          headScripts: opts.headScripts?.(entry) ?? [],
          ...(opts.csp ? { csp: opts.csp } : {}),
        }),
      )
      return
    }

    const bar = document.createElement('div')
    bar.className = 'site-pages'
    const label = document.createElement('span')
    label.className = 'site-pages-label'
    label.textContent = `${opts.label} (${pages.length})`
    bar.appendChild(label)

    let current = entry
    // Negative infinity, not 0: performance.now() counts from page load, so
    // a 0 baseline would silently refuse a click made in the first 250 ms.
    let lastNavigation = Number.NEGATIVE_INFINITY
    // One token per rendered document, so a document the frame navigated
    // itself to cannot pass the check by inheriting the WindowProxy.
    let token = ''
    // Object URLs minted by the page on display, revoked when it is
    // replaced: only dispose() reclaims the rest, and it does not run while
    // the reader stays on this activity (ADR-0022).
    let pageUrls: string[] = []
    const show = async (rec: BackupFileRecord, hash = ''): Promise<void> => {
      current = rec
      token = crypto.randomUUID()
      for (const b of bar.querySelectorAll('button')) {
        b.classList.toggle('selected', b.dataset.page === rec.filePath + rec.fileName)
      }
      const before = this.urls.length
      const preview = await this.filePreview(rec, {
        pageNav: true,
        hash,
        token,
        pagePaths,
        headScripts: opts.headScripts?.(rec) ?? [],
        ...(opts.csp ? { csp: opts.csp } : {}),
      })
      const minted = this.urls.slice(before)
      holder.replaceChildren(preview)
      this.revoke(pageUrls)
      pageUrls = minted
    }

    // A page asks to navigate (ADR-0022). Every check below is load-bearing:
    // the frame is hostile input.
    const onMessage = (event: MessageEvent): void => {
      const frame = holder.querySelector('iframe')
      // Window identity, not event.origin: the frame is an opaque origin, so
      // its origin is "null" and carries no authority at all. Identity alone
      // is not enough either — see the token below.
      if (!frame || event.source === null || event.source !== frame.contentWindow) return
      // Rate first, so a frame posting in a loop cannot make us do the
      // parsing and lookup work at its chosen frequency.
      const now = performance.now()
      if (now - lastNavigation < 250) return
      const requested = parseNavigationRequest(event.data, token)
      if (requested === undefined) return
      const { hash } = splitRef(requested)
      const target = decodeRefPath(resolveRelative(current.filePath, requested))
      // Allowlist: only the pages mounted here. A "../" payload cannot escape
      // it, because the resolved path has to equal one of these exactly.
      const rec = pages.find((p) => recordFullPath(p) === target)
      if (!rec) return
      // Re-rendering the page already shown buys nothing and is the one
      // request a hostile page can repeat with a fresh fragment each time.
      if (rec === current) return
      lastNavigation = now
      void show(rec, hash)
    }
    window.addEventListener('message', onMessage)
    this.cleanups.push(() => window.removeEventListener('message', onMessage))

    for (const rec of pages) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn-outline'
      button.dataset.page = rec.filePath + rec.fileName
      button.textContent = opts.buttonLabel(rec)
      const indent = opts.buttonIndent?.(rec) ?? 0
      if (indent > 0) button.style.marginLeft = `${Math.min(indent, 4) * 0.75}rem`
      button.addEventListener('click', () => void show(rec))
      bar.appendChild(button)
    }
    container.appendChild(bar)
    const hint = document.createElement('p')
    hint.className = 'fallback-note site-pages-hint'
    hint.textContent = opts.hint
    container.appendChild(hint)
    container.appendChild(holder)
    await show(entry)
  }

  /**
   * Renders a multi-file website as a single sandboxed page; every file
   * stays reachable through the collapsed file list (ADR-0014).
   */
  private async renderWebsite(
    records: BackupFileRecord[],
    entry: BackupFileRecord,
    container: HTMLElement,
  ): Promise<void> {
    const note = document.createElement('p')
    note.className = 'website-note'
    note.textContent = `${contentKind('text/html', entry.fileName)} · ${records.length} files`
    container.appendChild(note)

    // renderFileList drops the context predicate when the activity XML omits
    // contextid, which a crafted backup controls — records can then span the
    // whole archive. The navigable set is narrowed back to the entry's own
    // context and component so a page cannot drive the preview into another
    // activity's files (ADR-0022).
    const owned = records.filter(
      (r) => r.contextId === entry.contextId && r.component === entry.component,
    )
    const pages = sortRecords((owned.length > 0 ? owned : records).filter(isHtmlRecord))
    // Entry first: it is the page the author meant you to land on.
    pages.sort((a, b) => Number(b === entry) - Number(a === entry))

    await this.mountNavigablePages(pages, entry, container, {
      label: t('site.pages'),
      hint: t('site.pagesHint'),
      buttonLabel: (rec) => rec.fileName,
    })

    const details = document.createElement('details')
    details.className = 'advanced'
    const summary = document.createElement('summary')
    summary.textContent = `Files in this resource (${records.length})`
    details.appendChild(summary)
    const list = document.createElement('ul')
    list.className = 'resource-files'
    for (const rec of sortRecords(records)) {
      const li = document.createElement('li')
      const name = document.createElement('span')
      name.textContent = `${rec.filePath}${rec.fileName} `
      const a = document.createElement('a')
      const bytes = await this.tryRead(contentHashPath(rec.contentHash)).catch(() => undefined)
      if (bytes) {
        a.href = this.blobUrl(bytes, rec.mimeType || guessMime(rec.fileName))
        a.download = rec.fileName

        a.textContent = t('download')
      }
      li.append(name, a)
      list.appendChild(li)
    }
    details.appendChild(list)
    container.appendChild(details)
  }

  /** Builds a preview card: inline when safe/possible, download otherwise. */
  async filePreview(
    rec: BackupFileRecord,
    opts?: {
      pageNav?: boolean
      hash?: string
      token?: string
      pagePaths?: ReadonlySet<string>
      headScripts?: readonly string[]
      /** Policy to inject; SANDBOX_CSP unless the document is a SCO (ADR-0032). */
      csp?: string
    },
  ): Promise<HTMLElement> {
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
    if (isExeFileName(rec.fileName)) {
      try {
        await this.renderExePackage(data, card)
      } finally {
        addDownload(card, this.blobUrl(data, mime), rec.fileName)
      }
      return card
    }
    if (isEpubFileName(rec.fileName)) {
      try {
        await this.renderEpub(data, card)
      } finally {
        addDownload(card, this.blobUrl(data, mime), rec.fileName)
      }
      return card
    }
    if (isH5pFileName(rec.fileName)) {
      try {
        await this.renderH5p(data, card)
      } finally {
        addDownload(card, this.blobUrl(data, mime), rec.fileName)
      }
      return card
    }
    if (mime.startsWith('image/')) {
      const img = document.createElement('img')
      img.src = this.blobUrl(data, mime)
      img.alt = rec.fileName
      img.loading = 'lazy'
      card.appendChild(img)
      addDownload(card, this.blobUrl(data, mime), rec.fileName)
      return card
    }
    // contentKind() already labels these "Video"/"Audio"; without a branch
    // they fell through to a download button. A media element decodes the
    // file, it never executes it, so this adds no scripting surface.
    if (mime.startsWith('video/') || mime.startsWith('audio/')) {
      const media = document.createElement(mime.startsWith('video/') ? 'video' : 'audio')
      media.controls = true
      media.preload = 'metadata'
      media.className = 'media-preview'
      media.src = this.blobUrl(data, mime)
      card.appendChild(media)
      addDownload(card, media.src, rec.fileName)
      return card
    }
    if (mime === 'application/pdf') {
      await this.renderPdf(data, rec.fileName, card)
      addDownload(card, this.blobUrl(data, mime), rec.fileName)
      return card
    }
    if (mime === 'text/html' || /\.html?$/i.test(rec.fileName)) {
      await this.renderSandboxedHtml(data, rec, card, opts)
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
  private async renderPdf(data: Uint8Array, fileName: string, card: HTMLElement): Promise<void> {
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
      note.textContent = `Could not render “${fileName}” inline — use Download.`
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
    opts?: {
      pageNav?: boolean
      hash?: string
      token?: string
      pagePaths?: ReadonlySet<string>
      headScripts?: readonly string[]
      /** Policy to inject; SANDBOX_CSP unless the document is a SCO (ADR-0032). */
      csp?: string
    },
  ): Promise<void> {
    let html = new TextDecoder().decode(data)
    const dir = rec.filePath.replace(/[^/]+$/, '')
    html = await this.rewriteRelativeRefs(html, dir, rec, opts?.pagePaths)
    html = retargetExternalLinks(html)
    // injectHead prepends, so these apply in reverse document order: the CSP
    // goes last precisely so it lands as the first head child, ahead of the
    // script below — which would otherwise run before the policy did.
    if (opts?.pageNav && opts.token) html = injectHead(html, pageNavScript(opts.token))
    // injectHead prepends, so the array is walked backwards and therefore
    // reads in document order: a SCORM runtime has to be evaluated before the
    // boot script that instantiates it, and both before the package's own
    // scripts look for window.API (ADR-0023).
    for (const script of [...(opts?.headScripts ?? [])].reverse()) {
      html = injectHead(html, script)
    }
    html = injectHead(html, PAGE_LINK_STYLE)
    html = injectCsp(html, opts?.csp ?? SANDBOX_CSP)
    const frame = document.createElement('iframe')
    const src = this.blobUrl(new TextEncoder().encode(html), 'text/html')
    // The browser applies the fragment on load, so the anchor survives
    // without anyone reaching into the frame's document (ADR-0022).
    frame.src = opts?.hash ? `${src}${opts.hash}` : src
    frame.title = rec.fileName
    frame.className = 'html-frame'
    // Opaque origin: never allow-same-origin, so the frame cannot reach the
    // app. allow-popups (+ escape) lets the author's external links open in
    // a real tab instead of doing nothing; the popup must escape the sandbox
    // or the destination site would load on an opaque origin and break
    // (ADR-0017). Top-level navigation stays denied: the frame cannot
    // replace the MBZoo page itself.
    frame.sandbox.add('allow-scripts')
    frame.sandbox.add('allow-popups')
    frame.sandbox.add('allow-popups-to-escape-sandbox')
    card.appendChild(frame)
  }

  /**
   * mod_exeweb (ADR-0025): an eXeLearning site published straight into a
   * Moodle activity. Its backup names the landing page explicitly in
   * `entrypath`/`entryname`, which beats the filename heuristic
   * `pickWebsiteEntry` has to use for a plain file resource.
   */
  private async renderExeweb(
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    const introHtml = await this.resolveHtml(fields.get('intro'), 'mod_exeweb', 'intro', contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }

    const records = [...this.ctx.backup.files.values()].filter(
      (f) =>
        f.component === 'mod_exeweb' &&
        f.fileArea === 'content' &&
        f.fileName !== '.' &&
        f.fileSize > 0 &&
        (contextId === '' || f.contextId === contextId),
    )
    if (records.length === 0) {
      notAvailable(container)
      return
    }

    const wantedPath = (fields.get('entrypath') ?? '').trim()
    const wantedName = (fields.get('entryname') ?? '').trim()
    const declared =
      wantedName === ''
        ? undefined
        : (records.find(
            (r) =>
              r.fileName === wantedName &&
              (wantedPath === '' ||
                r.filePath === wantedPath ||
                `${r.filePath}` === `/${wantedPath}`),
          ) ?? records.find((r) => r.fileName === wantedName))
    const entry = declared ?? pickWebsiteEntry(records)
    if (!entry) {
      for (const rec of sortRecords(records)) container.appendChild(await this.filePreview(rec))
      return
    }
    await this.renderWebsite(records, entry, container)
  }

  /**
   * SCORM package: the course structure Moodle already flattened into
   * scorm.xml, plus experimental playback of the launchable SCOs
   * (ADR-0023).
   *
   * The SCO and the runtime are composed into ONE document because a SCO
   * finds its LMS with findAPI(window) and a nested frame on an opaque
   * origin could not reach window.parent.API. Same sandbox, same CSP, no new
   * iframe permission.
   */
  private async renderScorm(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    const mod = activity.moduleName
    const introHtml = await this.resolveHtml(fields.get('intro'), `mod_${mod}`, 'intro', contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }

    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    if (!xml) {
      notAvailable(container)
      return
    }
    let scorm: Awaited<ReturnType<typeof parseScormXml>>
    try {
      scorm = await parseScormXml(new TextDecoder().decode(xml))
    } catch {
      notAvailable(container)
      return
    }

    // The extracted package tree lives in the `content` file area at itemid
    // 0; `package` holds the uploaded zip. The revision segment of a
    // pluginfile URL is a cache-buster and is never an itemid.
    const contentFiles = [...this.ctx.backup.files.values()].filter(
      (f) =>
        f.component === `mod_${mod}` &&
        f.fileArea === 'content' &&
        f.fileName !== '.' &&
        f.fileSize > 0 &&
        (contextId === '' || f.contextId === contextId),
    )

    const launchable = scormToc(scorm.scoes).filter((n) => n.sco.launch !== '')
    const byPath = new Map(contentFiles.map((f) => [recordFullPath(f), f]))
    const resolved = launchable.flatMap((node) => {
      const { path } = splitLaunch(node.sco.launch, node.sco.parameters)
      const rec = byPath.get(decodeRefPath(path.replace(/^\/+/, '')))
      return rec ? [{ node, rec }] : []
    })

    if (resolved.length === 0) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t(contentFiles.length === 0 ? 'scorm.noContent' : 'scorm.noLaunchable')
      container.appendChild(note)
      this.appendScormPackageDownload(mod, contextId, container)
      return
    }

    const chip = document.createElement('p')
    chip.className = 'h5p-note'
    chip.textContent = t('scorm.experimental')
    container.appendChild(chip)

    const is2004 = isScorm2004(scorm.version)
    const runtime = await loadScormRuntime(is2004)
    if (!runtime) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('scorm.runtimeUnavailable')
      container.appendChild(note)
    }
    // A SCO may load its own runtime by injecting <script src> or by XHR —
    // Captivate does both — and relative paths resolve to nothing inside a
    // blob: document. The package travels with the SCO as a virtual
    // filesystem, served by the same shim the H5P player uses (ADR-0032).
    const vfs: H5pEntries = new Map()
    let vfsBudget = MAX_SCO_VFS_BYTES
    for (const f of contentFiles) {
      if (f.fileSize > vfsBudget) continue
      const bytes = await this.tryRead(contentHashPath(f.contentHash))
      if (!bytes) continue
      vfsBudget -= bytes.byteLength
      vfs.set(scoVfsKey(f), bytes)
    }
    const headScripts = [
      ...vfsHeadScripts(vfs),
      ...(runtime ? [runtimeScript(runtime), scormBootScript(is2004)] : []),
    ]

    const first = defaultLaunchSco(scorm.scoes)
    const entry =
      resolved.find((r) => first !== undefined && r.node.sco.identifier === first.identifier)
        ?.rec ?? resolved[0]?.rec
    if (!entry) {
      notAvailable(container)
      return
    }
    const depthOf = new Map(resolved.map((r) => [r.rec, r.node.depth]))
    const titleOf = new Map(resolved.map((r) => [r.rec, r.node.sco.title || r.rec.fileName]))

    await this.mountNavigablePages(
      resolved.map((r) => r.rec),
      entry,
      container,
      {
        label: t('scorm.contents'),
        hint: t('scorm.contentsHint'),
        buttonLabel: (rec) => titleOf.get(rec) ?? rec.fileName,
        buttonIndent: (rec) => depthOf.get(rec) ?? 0,
        headScripts: () => headScripts,
        csp: SCORM_CSP,
      },
    )

    this.appendScormPackageDownload(mod, contextId, container)
  }

  /** Offers the uploaded package itself, which lives in the `package` area. */
  private appendScormPackageDownload(mod: string, contextId: string, container: HTMLElement): void {
    const pkg = [...this.ctx.backup.files.values()].find(
      (f) =>
        f.component === `mod_${mod}` &&
        f.fileArea === 'package' &&
        f.fileName !== '.' &&
        f.fileSize > 0 &&
        (contextId === '' || f.contextId === contextId),
    )
    if (!pkg) return
    const card = document.createElement('div')
    card.className = 'file-card'
    const head = document.createElement('div')
    head.className = 'file-head'
    const name = document.createElement('span')
    name.textContent = `${pkg.fileName} (${formatBytes(pkg.fileSize)})`
    head.appendChild(name)
    card.appendChild(head)
    container.appendChild(card)
    void this.tryRead(contentHashPath(pkg.contentHash)).then((bytes) => {
      if (!bytes) return
      addDownload(card, this.blobUrl(bytes, pkg.mimeType || guessMime(pkg.fileName)), pkg.fileName)
    })
  }

  /**
   * H5P activity: intro plus experimental playback of the stored .h5p
   * package (ADR-0018); falls back to the download card when the package
   * cannot be played.
   */
  private async renderH5pActivity(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
    instanceId: string,
  ): Promise<void> {
    const mod = activity.moduleName
    const introHtml = await this.resolveHtml(fields.get('intro'), `mod_${mod}`, 'intro', contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
      this.renderExternalPanel(this.lastRawHtml, container)
    }

    const records = [...this.ctx.backup.files.values()].filter(
      (f) =>
        isH5pFileName(f.fileName) &&
        f.fileSize > 0 &&
        (f.component === `mod_${mod}` || (contextId !== '' && f.contextId === contextId)),
    )
    const record =
      records.find((f) => f.component === `mod_${mod}` && f.contextId === contextId) ?? records[0]
    if (!record) {
      // mod_hvp keeps no package: the content lives in hvp.xml and the
      // libraries and media in file areas, so one is composed (ADR-0031).
      const hvp = mod === 'hvp' ? hvpFields(fields) : undefined
      if (!hvp) {
        notAvailable(container)
        return
      }
      const card = document.createElement('div')
      card.className = 'file-card'
      container.appendChild(card)
      let entries: H5pEntries
      try {
        // The media area is keyed by the hvp *instance* id, never by the
        // course-module id the tree carries; the two differ in every real
        // backup (esl001: instance 6, module 22504).
        entries = await composeHvpEntries(hvp, instanceId, this.ctx.backup.files.values(), (r) =>
          this.tryRead(contentHashPath(r.contentHash)),
        )
      } catch {
        const note = document.createElement('p')
        note.className = 'fallback-note'
        note.textContent = t('h5p.invalid')
        card.appendChild(note)
        return
      }
      await this.renderH5pEntries(entries, card)
      return
    }
    const data = await this.tryRead(contentHashPath(record.contentHash))
    if (!data) {
      notAvailable(container)
      return
    }
    const card = document.createElement('div')
    card.className = 'file-card'
    container.appendChild(card)
    try {
      await this.renderH5p(data, card)
    } finally {
      // Download stays available even when playback fails (ADR-0018).
      addDownload(
        card,
        this.blobUrl(data, record.mimeType || guessMime(record.fileName)),
        record.fileName,
      )
    }
  }

  /**
   * Experimental H5P playback (ADR-0018): unzips the package in memory and
   * boots h5p-standalone inside an opaque-origin sandboxed iframe with the
   * ADR-0014 CSP; every package path is served by an in-frame shim.
   */
  private async renderH5p(data: Uint8Array, card: HTMLElement): Promise<void> {
    // A package is hostile input: unzipping may reject malformed input, and
    // that must not reach the caller as a raw error.
    let entries: H5pEntries
    try {
      entries = unzipH5p(data)
    } catch {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('h5p.invalid')
      card.appendChild(note)
      return
    }
    await this.renderH5pEntries(entries, card)
  }

  /** Plays an H5P package already unfolded into path → bytes (ADR-0018, ADR-0031). */
  private async renderH5pEntries(entries: H5pEntries, card: HTMLElement): Promise<void> {
    const fallback = (key: 'h5p.invalid' | 'h5p.playerUnavailable'): void => {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t(key)
      card.appendChild(note)
    }
    const assets = await loadPlayerAssets()
    if (!assets) {
      fallback('h5p.playerUnavailable')
      return
    }
    let html: string
    try {
      html = buildPlayerHtml(entries, assets)
    } catch {
      fallback('h5p.invalid')
      return
    }
    const chip = document.createElement('p')
    chip.className = 'h5p-note'
    chip.textContent = t('h5p.experimental')
    card.appendChild(chip)
    const frame = document.createElement('iframe')
    frame.src = this.blobUrl(new TextEncoder().encode(html), 'text/html')
    frame.title = t('h5p.frameTitle')
    frame.className = 'html-frame h5p-frame'
    // allow-scripts only: opaque origin — no same-origin access to the app.
    frame.sandbox.add('allow-scripts')
    card.appendChild(frame)
  }

  /**
   * eXeLearning package (ADR-0025). A `.elpx` carries both the re-importable
   * project and a rendered site; when the site is there it is what a reader
   * wants, and it renders through the same in-memory pipeline as an EPUB
   * chapter. A legacy `.elp` has no site — its project data is a binary
   * Twisted jelly stream this browser cannot decode — so MBZoo says what the
   * file is instead of pretending.
   */
  private async renderExePackage(data: Uint8Array, card: HTMLElement): Promise<void> {
    const note = (text: string): void => {
      const p = document.createElement('p')
      p.className = 'fallback-note'
      p.textContent = text
      card.appendChild(p)
    }
    let pkg: ReturnType<typeof readExePackage>
    try {
      pkg = readExePackage(unzipPackage(data))
    } catch {
      note(t('exe.invalid'))
      return
    }

    const chip = document.createElement('p')
    chip.className = 'h5p-note'
    chip.textContent = t(`exe.kind.${pkg.kind}`)
    card.appendChild(chip)

    if (pkg.kind === 'exe-site-modern' || pkg.kind === 'exe-site-legacy') {
      this.renderZipPages(exeSiteBook(pkg), card, {
        list: t('exe.pages'),
        previous: t('epub.previous'),
        next: t('epub.next'),
        hint: t('exe.pagesHint'),
      })
      return
    }
    if (pkg.kind === 'elpx-source' && pkg.entry !== '') {
      // A source package that also shipped its export.
      this.renderZipPages(exeSiteBook(pkg), card, {
        list: t('exe.pages'),
        previous: t('epub.previous'),
        next: t('epub.next'),
        hint: t('exe.pagesHint'),
      })
      return
    }
    if (pkg.title !== '') {
      const title = document.createElement('p')
      title.className = 'website-note'
      title.textContent = pkg.title
      card.appendChild(title)
    }
    if (pkg.kind === 'elp-legacy-opaque') note(t('exe.opaque'))
    else if (pkg.kind === 'unknown') note(t('exe.unknown'))
    else note(t('exe.noSite'))

    const list = document.createElement('details')
    list.className = 'advanced'
    const summary = document.createElement('summary')
    summary.textContent = `${t('exe.files')} (${pkg.entries.size})`
    list.appendChild(summary)
    const ul = document.createElement('ul')
    ul.className = 'resource-files'
    for (const path of [...pkg.entries.keys()].sort()) {
      const li = document.createElement('li')
      li.textContent = path
      ul.appendChild(li)
    }
    list.appendChild(ul)
    card.appendChild(list)
  }

  /**
   * EPUB reading (ADR-0024): the spine becomes a chapter row, and each
   * chapter renders in the same opaque-origin sandbox with the same injected
   * CSP as any other archive HTML. Nothing is fetched; every asset the
   * chapter references is inlined from the package already in memory.
   */
  private async renderEpub(data: Uint8Array, card: HTMLElement): Promise<void> {
    const fallback = (key: 'epub.invalid' | 'epub.empty'): void => {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t(key)
      card.appendChild(note)
    }
    // A package is hostile input: neither unzipping nor reading the package
    // document may reach the caller as a raw error.
    let book: EpubBook
    try {
      book = readEpub(unzipEpub(data))
    } catch {
      fallback('epub.invalid')
      return
    }
    if (book.chapters.length === 0) {
      fallback('epub.empty')
      return
    }
    this.renderZipPages(book, card, {
      list: t('epub.chapters'),
      previous: t('epub.previous'),
      next: t('epub.next'),
      hint: t('epub.hint'),
    })
  }

  /**
   * Renders the pages of an in-memory ZIP package — an EPUB's spine, an
   * eXeLearning export's HTML — as one sandboxed document at a time, with
   * MBZoo's own list and previous/next controls. Every asset is inlined from
   * the package; nothing is fetched (ADR-0024, ADR-0025).
   */
  private renderZipPages(
    book: EpubBook,
    card: HTMLElement,
    labels: { list: string; previous: string; next: string; hint: string },
  ): void {
    if (book.title !== '') {
      const title = document.createElement('p')
      title.className = 'website-note'
      title.textContent = book.title
      card.appendChild(title)
    }

    const holder = document.createElement('div')
    const bar = document.createElement('div')
    bar.className = 'site-pages'
    const label = document.createElement('span')
    label.className = 'site-pages-label'
    label.textContent = `${labels.list} (${book.chapters.length})`
    bar.appendChild(label)

    let index = 0
    let chapterUrls: string[] = []
    const show = (next: number): void => {
      index = Math.min(Math.max(next, 0), book.chapters.length - 1)
      const chapter = book.chapters[index]
      if (!chapter) return
      for (const b of bar.querySelectorAll('button[data-chapter]')) {
        b.classList.toggle('selected', b.getAttribute('data-chapter') === chapter.path)
      }
      let html: string
      try {
        html = composeChapter(book, chapter.path)
      } catch {
        return
      }
      html = retargetExternalLinks(html)
      html = injectHead(html, PAGE_LINK_STYLE)
      html = injectCsp(html, SANDBOX_CSP)
      const before = this.urls.length
      const frame = document.createElement('iframe')
      frame.src = this.blobUrl(new TextEncoder().encode(html), 'text/html')
      frame.title = chapter.title
      frame.className = 'html-frame'
      // Same tokens as every other archive HTML preview (ADR-0014): opaque
      // origin, and never allow-same-origin.
      frame.sandbox.add('allow-scripts')
      frame.sandbox.add('allow-popups')
      frame.sandbox.add('allow-popups-to-escape-sandbox')
      const minted = this.urls.slice(before)
      holder.replaceChildren(frame)
      this.revoke(chapterUrls)
      chapterUrls = minted
      prev.disabled = index === 0
      next_.disabled = index === book.chapters.length - 1
    }

    for (const chapter of book.chapters) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn-outline'
      button.setAttribute('data-chapter', chapter.path)
      button.textContent = chapter.title
      button.addEventListener('click', () => show(book.chapters.indexOf(chapter)))
      bar.appendChild(button)
    }
    card.appendChild(bar)

    const nav = document.createElement('div')
    nav.className = 'site-pages'
    const prev = document.createElement('button')
    prev.type = 'button'
    prev.className = 'btn-outline'
    prev.textContent = labels.previous
    prev.addEventListener('click', () => show(index - 1))
    const next_ = document.createElement('button')
    next_.type = 'button'
    next_.className = 'btn-outline'
    next_.textContent = labels.next
    next_.addEventListener('click', () => show(index + 1))
    nav.append(prev, next_)
    card.appendChild(nav)

    const hint = document.createElement('p')
    hint.className = 'fallback-note site-pages-hint'
    hint.textContent = labels.hint
    card.appendChild(hint)
    card.appendChild(holder)
    show(0)
  }

  /** Rewrites relative src/href references to blob URLs of archive files. */
  private async rewriteRelativeRefs(
    html: string,
    dir: string,
    owner: BackupFileRecord,
    pagePaths?: ReadonlySet<string>,
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
      const quote = raw.includes('"') ? '"' : "'"
      if (isHtmlRecord(rec)) {
        // Another HTML document. Inlining it as a data: document strands it:
        // its own relative stylesheet cannot resolve against a data: base,
        // and the CSP we inject never reaches it. MBZoo offers these pages in
        // its own chrome instead (ADR-0020).
        //
        // Only a document the parent will actually accept is marked as a live
        // page link. matchFileRecord falls back across contexts and
        // findByPathSuffix searches the whole archive, so without this test
        // MBZoo would style links as live and then refuse them in silence —
        // which is the ADR-0020 failure mode with its mitigations removed.
        const navigable = pagePaths?.has(decodeRefPath(target)) ?? false
        const attr = navigable ? 'data-mbz-page' : 'data-mbz-page-inert'
        html = replaceOnce(html, raw, ` ${attr}=${quote}${ref}${quote}`)
        continue
      }
      const bytes = await this.tryRead(contentHashPath(rec.contentHash))
      if (!bytes) continue
      let payload: Uint8Array = bytes
      const mime = rec.mimeType || guessMime(rec.fileName)
      // Resolve url(...) references inside CSS so background images load too.
      if (mime === 'text/css' || /\.css$/i.test(rec.fileName)) {
        payload = new TextEncoder().encode(
          await this.resolveCssUrls(new TextDecoder().decode(bytes), rec.filePath),
        )
      }
      if (payload.byteLength > MAX_SANDBOX_ASSET_BYTES) continue
      const url = dataUrl(payload, mime)
      const attr = /src=/i.test(raw) ? 'src' : 'href'
      html = replaceOnce(html, raw, ` ${attr}=${quote}${url}${quote}`)
    }
    return html
  }

  /** Rewrites url(...) in a CSS file to blob URLs of sibling assets. */
  private async resolveCssUrls(css: string, cssDir: string): Promise<string> {
    const refs = [...css.matchAll(/url\((['"]?)([^)'"#]+)\1\)/g)]
    let out = css
    for (const m of refs) {
      const ref = (m[2] ?? '').trim()
      if (!ref || /^(data:|blob:|https?:)/i.test(ref)) continue
      const target = resolveRelative(cssDir, ref)
      const fileName = target.split('/').pop() ?? ''
      const rec =
        matchFileRecord(this.ctx.backup.files, { fileName }) ??
        (await this.findByPathSuffix(target))
      if (!rec) continue
      const bytes = await this.tryRead(contentHashPath(rec.contentHash))
      if (!bytes) continue
      if (bytes.byteLength > MAX_SANDBOX_ASSET_BYTES) continue
      out = out
        .split(m[0])
        .join(`url('${dataUrl(bytes, rec.mimeType || guessMime(rec.fileName))}')`)
    }
    return out
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
    this.renderExternalPanel(this.lastRawHtml, container)
  }

  /** <details> with the raw Moodle fields (ADR-0013 inspect capability). */

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

    container.appendChild(
      this.buildSummary([
        ['availableFrom', fields.get('timeopen')],
        ['dueDate', fields.get('timeclose')],
        ['timeLimit', fields.get('timelimit')],
      ]),
    )

    let questionIds: number[] = []
    const quizXml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    if (quizXml) {
      questionIds = await parseQuizQuestionIds(new TextDecoder().decode(quizXml))
    }
    const bank = await this.questionBank()
    const plan = resolveQuizSlots(bank, questionIds)
    const questions = plan.questions
    if (questions.length === 0) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('quiz.noQuestions')
      container.appendChild(note)
      return
    }

    // Random slots were expanded into their pool, so the reader is now
    // paging through more questions than an attempt would ever ask. Say so,
    // otherwise the count reads as the length of the exam.
    if (plan.randomSlots > 0 && plan.poolSize > 0) {
      const drawn = document.createElement('p')
      drawn.className = 'quiz-notice quiz-random-summary'
      drawn.textContent =
        plan.fixedSlots > 0
          ? t('quiz.randomSummaryMixed', {
              fixed: plan.fixedSlots,
              n: plan.randomSlots,
              pool: plan.poolSize,
            })
          : t('quiz.randomSummary', { n: plan.randomSlots, pool: plan.poolSize })
      container.appendChild(drawn)
    }

    // questionCard() is synchronous, so question HTML is resolved up front.
    // Question files hang off the *question bank category's* context, not the
    // quiz's, so no contextId is pinned here — component, filearea and the
    // question or answer id are enough to identify the row (REPO-005).
    const resolvedQuestions = new Map<string, string>()
    for (const question of questions) {
      resolvedQuestions.set(
        `q${question.id}`,
        await this.resolveHtml(
          question.questionText,
          'question',
          'questiontext',
          '',
          String(question.id),
        ),
      )
      for (const answer of question.answers) {
        resolvedQuestions.set(
          `a${answer.id}`,
          await this.resolveHtml(answer.text, 'question', 'answer', '', String(answer.id)),
        )
      }
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
    const reveal = document.createElement('button')
    reveal.type = 'button'
    reveal.className = 'btn-outline'
    reveal.textContent = t('reveal')
    let shown = false
    reveal.addEventListener('click', () => {
      shown = !shown
      card.classList.toggle('reveal', shown)
      reveal.textContent = shown ? t('hide') : t('reveal')
    })
    nav.append(prev, counter, next, reveal)
    container.appendChild(nav)

    const card = document.createElement('div')
    card.className = 'quiz-card'
    container.appendChild(card)

    const showQuestion = (i: number): void => {
      index = Math.max(0, Math.min(questions.length - 1, i))
      counter.textContent = `${t('quiz.question')} ${index + 1} ${t('quiz.of')} ${questions.length}`
      prev.toggleAttribute('disabled', index === 0)
      next.toggleAttribute('disabled', index === questions.length - 1)
      const current = questions[index] as QuizQuestion
      card.replaceChildren(
        this.questionCard(current, plan.drawnIds.has(current.id), resolvedQuestions),
      )
    }
    prev.addEventListener('click', () => showQuestion(index - 1))
    next.addEventListener('click', () => showQuestion(index + 1))
    showQuestion(0)
  }

  /** Glossary: concept/definition entries from glossary.xml. */
  /**
   * The activity's grade item: what it is out of, what passes, its weight.
   * Lives in grades.xml beside the payload and travels without user data —
   * the marks themselves (<grade_grades>) do not.
   */
  private async renderGradeItem(activity: ActivityInfo, container: HTMLElement): Promise<void> {
    const dir = `activities/${activity.moduleName}_${activity.id}`
    const bytes = await this.tryRead(`${dir}/grades.xml`)
    if (!bytes) return
    const { parseActivityGradesXml } = await import('@mbzoo/core')
    const items = await parseActivityGradesXml(new TextDecoder().decode(bytes))
    const graded = items.filter((i) => i.kind !== 'none')
    if (graded.length === 0) return

    const title = document.createElement('div')
    title.className = 'q-answers-title'
    title.textContent = t('grade.title')
    container.appendChild(title)
    for (const item of graded) {
      const facts: Array<[string, string | undefined]> = [
        [t('grade.outOf'), item.kind === 'value' ? String(item.max) : t(`grade.kind.${item.kind}`)],
        [t('grade.pass'), item.pass > 0 ? String(item.pass) : undefined],
        [t('grade.weight'), item.weight > 0 ? String(item.weight) : undefined],
        [t('grade.hidden'), item.hidden ? t('info.yes') : undefined],
      ]
      if (items.length > 1 && item.name !== '') facts.unshift([t('grade.item'), item.name])
      container.appendChild(this.buildFacts(facts))
    }
  }

  /**
   * Rubric or marking guide from grading.xml — often the clearest statement
   * of what a task is assessed on, and nothing else in the backup says it.
   */
  private async renderGradingForm(activity: ActivityInfo, container: HTMLElement): Promise<void> {
    const dir = `activities/${activity.moduleName}_${activity.id}`
    const bytes = await this.tryRead(`${dir}/grading.xml`)
    if (!bytes) return
    const { parseGradingXml } = await import('@mbzoo/core')
    const areas = await parseGradingXml(new TextDecoder().decode(bytes))
    for (const area of areas) {
      for (const def of area.definitions) {
        const details = document.createElement('details')
        details.className = 'advanced grading-form'
        details.open = true
        const summary = document.createElement('summary')
        summary.textContent = `${def.name || t(`grading.method.${def.method === 'guide' ? 'guide' : 'rubric'}`)}`
        details.appendChild(summary)

        if (def.description !== '') {
          const body = document.createElement('div')
          body.className = 'activity-content'
          body.innerHTML = this.safeHtml(def.description)
          details.appendChild(body)
        }

        if (def.criteria.length === 0) {
          // A method we do not decode is not a form with no criteria.
          const note = document.createElement('p')
          note.className = 'fallback-note'
          note.textContent = t('grading.notShown', { method: def.method })
          details.appendChild(note)
        } else {
          for (const criterion of def.criteria) {
            const row = document.createElement('div')
            row.className = 'rubric-criterion'
            const head = document.createElement('strong')
            head.innerHTML = this.safeHtml(criterion.description)
            row.appendChild(head)
            const levels = document.createElement('ul')
            levels.className = 'rubric-levels'
            for (const level of criterion.levels) {
              const li = document.createElement('li')
              const score = document.createElement('em')
              score.className = 'rubric-score'
              score.textContent = String(level.score)
              const text = document.createElement('span')
              text.innerHTML = this.safeHtml(level.definition)
              li.append(score, text)
              levels.appendChild(li)
            }
            row.appendChild(levels)
            details.appendChild(row)
          }
        }
        container.appendChild(details)
      }
    }
  }

  /**
   * Question bank, external tool and meeting modules: their payload is a
   * configuration record, so a typed summary is all there is to show.
   */
  private async renderToolLike(
    mod: string,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, `mod_${mod}`, 'intro')
    if (mod === 'lti') {
      // The tool URL is the author's link; MBZoo never launches it.
      container.appendChild(
        this.buildFacts([[t('lti.toolUrl'), fields.get('toolurl') || fields.get('securetoolurl')]]),
      )
    } else if (mod === 'bigbluebuttonbn') {
      container.appendChild(this.buildFacts([[t('bbb.type'), fields.get('type')]]))
    }
    const note = document.createElement('p')
    note.className = 'fallback-note'
    note.textContent = t(mod === 'qbank' ? 'qbank.note' : mod === 'lti' ? 'lti.note' : 'bbb.note')
    container.appendChild(note)
  }

  /** Label/value facts that are not dates — module settings worth naming. */
  private buildFacts(pairs: Array<[string, string | undefined]>): HTMLElement {
    const grid = document.createElement('div')
    grid.className = 'summary-grid'
    for (const [label, value] of pairs) {
      if (!value) continue
      const item = document.createElement('div')
      item.className = 'summary-item'
      const k = document.createElement('span')
      k.className = 'summary-key'
      k.textContent = label
      const v = document.createElement('b')
      v.textContent = value
      item.append(k, v)
      grid.appendChild(item)
    }
    return grid
  }

  /**
   * Lesson: the authored branching sequence. Every page and answer travels in
   * a content-only backup, so this is the whole lesson minus the attempts.
   */
  private async renderLesson(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, 'mod_lesson', 'intro')
    const { parseLessonXml } = await import('@mbzoo/core')
    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const lesson = xml ? await parseLessonXml(new TextDecoder().decode(xml)) : { pages: [] }
    if (lesson.pages.length === 0) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('lesson.noPages')
      container.appendChild(note)
      return
    }

    // show() is synchronous, so every page's HTML is resolved up front.
    // mod_lesson keys these areas by row: page_contents by page id,
    // page_answers and page_responses by answer id (REPO-005).
    const resolved = new Map<string, string>()
    for (const page of lesson.pages) {
      const area = async (html: string, filearea: string, id: number): Promise<string> =>
        await this.resolveHtml(html, 'mod_lesson', filearea, contextId, String(id))
      resolved.set(`c${page.id}`, await area(page.contents, 'page_contents', page.id))
      for (const answer of page.answers) {
        resolved.set(`a${answer.id}`, await area(answer.text, 'page_answers', answer.id))
        resolved.set(`r${answer.id}`, await area(answer.response, 'page_responses', answer.id))
      }
    }

    const titleOf = (id: number): string => lesson.pages.find((p) => p.id === id)?.title ?? `#${id}`

    const toc = document.createElement('div')
    toc.className = 'book-toc'
    container.appendChild(toc)

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

    const body = document.createElement('div')
    body.className = 'quiz-card'
    container.appendChild(body)

    let index = 0
    const show = (i: number): void => {
      index = Math.max(0, Math.min(lesson.pages.length - 1, i))
      const page = lesson.pages[index]
      if (!page) return
      counter.textContent = `${index + 1} ${t('quiz.of')} ${lesson.pages.length}`
      prev.toggleAttribute('disabled', index === 0)
      next.toggleAttribute('disabled', index === lesson.pages.length - 1)
      for (const [i2, b] of [...toc.querySelectorAll('.book-toc-item')].entries()) {
        b.classList.toggle('selected', i2 === index)
      }

      const head = document.createElement('div')
      head.className = 'quiz-q-head'
      const badge = document.createElement('span')
      badge.className = `mod-badge ${page.kind === 'content' ? 't-purple' : 't-blue'}`
      badge.textContent = t(`lesson.kind.${page.kind}`)
      const title = document.createElement('strong')
      title.textContent = page.title
      head.append(badge, ' ', title)

      const content = document.createElement('div')
      content.className = 'activity-content'
      content.innerHTML = resolved.get(`c${page.id}`) ?? ''

      body.replaceChildren(head, content)

      if (page.answers.length > 0) {
        // On a content page these are the branch buttons; on a question page
        // they are the answers. Either way the jump is the interesting part.
        const label = document.createElement('div')
        label.className = 'q-answers-title'
        label.textContent = page.kind === 'content' ? t('lesson.branches') : t('quiz.answers')
        const list = document.createElement('ul')
        list.className = 'lesson-answers'
        for (const answer of page.answers) {
          const li = document.createElement('li')
          li.className = answer.grade > 0 && page.kind !== 'content' ? 'q-correct' : 'q-neutral'
          const text = document.createElement('span')
          text.className = 'lesson-answer-text'
          text.innerHTML = resolved.get(`a${answer.id}`) ?? ''
          const jump = document.createElement('em')
          jump.className = 'lesson-jump'
          jump.textContent =
            answer.jump.kind === 'page'
              ? `→ ${titleOf(answer.jump.pageId)}`
              : `→ ${t(`lesson.jump.${answer.jump.kind}`)}`
          li.append(text, jump)
          if (answer.response !== '') {
            const response = document.createElement('div')
            response.className = 'lesson-response'
            response.innerHTML = resolved.get(`r${answer.id}`) ?? ''
            li.appendChild(response)
          }
          list.appendChild(li)
        }
        body.append(label, list)
      }
    }

    for (const [i, page] of lesson.pages.entries()) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'book-toc-item'
      button.textContent = page.title || `#${page.id}`
      button.addEventListener('click', () => show(i))
      toc.appendChild(button)
    }
    prev.addEventListener('click', () => show(index - 1))
    next.addEventListener('click', () => show(index + 1))
    show(0)
  }

  /** Choice: the poll question and the options it offered. */
  private async renderChoice(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, 'mod_choice', 'intro')
    const { parseNestedRecords } = await import('@mbzoo/core')
    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const options = xml
      ? await parseNestedRecords(new TextDecoder().decode(xml), 'options', 'option')
      : []

    container.appendChild(
      this.buildSummary([
        ['availableFrom', fields.get('timeopen')],
        ['dueDate', fields.get('timeclose')],
      ]),
    )
    container.appendChild(
      this.buildFacts([
        [t('choice.multiple'), fields.get('allowmultiple') === '1' ? t('info.yes') : t('info.no')],
        [t('choice.limit'), fields.get('limitanswers') === '1' ? t('info.yes') : t('info.no')],
        [t('choice.update'), fields.get('allowupdate') === '1' ? t('info.yes') : t('info.no')],
      ]),
    )

    if (options.length === 0) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('choice.noOptions')
      container.appendChild(note)
      return
    }
    const title = document.createElement('div')
    title.className = 'q-answers-title'
    title.textContent = `${t('choice.options')} (${options.length})`
    const list = document.createElement('ul')
    list.className = 'q-answers moodle-inputs'
    const multiple = fields.get('allowmultiple') === '1'
    for (const [i, option] of options.entries()) {
      const li = document.createElement('li')
      li.className = 'q-neutral'
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = multiple ? 'checkbox' : 'radio'
      input.name = `choice-${activity.id}`
      input.value = String(i)
      const text = document.createElement('span')
      text.textContent = option.get('text') ?? ''
      label.append(input, text)
      li.appendChild(label)
      const limit = Number(option.get('maxanswers') ?? '0')
      if (fields.get('limitanswers') === '1' && limit > 0) {
        const cap = document.createElement('em')
        cap.className = 'q-fraction'
        cap.textContent = t('choice.capacity', { n: limit })
        li.appendChild(cap)
      }
      list.appendChild(li)
    }
    container.append(title, list)
  }

  /**
   * Database: the field schema. Records are user-generated, so a content-only
   * backup carries the shape of what was collected but never the entries.
   */
  private async renderDatabase(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, 'mod_data', 'intro')
    const { parseNestedRecords } = await import('@mbzoo/core')
    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const defs = xml
      ? await parseNestedRecords(new TextDecoder().decode(xml), 'fields', 'field')
      : []

    const note = document.createElement('p')
    note.className = 'quiz-notice'
    note.textContent = this.ctx.backup.includesUserData
      ? t('data.schemaOnly')
      : `${t('data.schemaOnly')} ${t('data.noUserData')}`
    container.appendChild(note)

    if (defs.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'fallback-note'
      empty.textContent = t('data.noFields')
      container.appendChild(empty)
      return
    }
    const title = document.createElement('div')
    title.className = 'q-answers-title'
    title.textContent = `${t('data.fields')} (${defs.length})`
    const list = document.createElement('dl')
    list.className = 'glossary-list'
    for (const def of defs) {
      const dt = document.createElement('dt')
      const badge = document.createElement('span')
      badge.className = 'mod-badge t-teal'
      badge.textContent = def.get('type') ?? '?'
      const name = document.createElement('span')
      name.textContent = ` ${def.get('name') ?? ''}`
      dt.append(badge, name)
      if (def.get('required') === '1') {
        const req = document.createElement('span')
        req.className = 'q-pool-chip'
        req.textContent = t('feedback.required')
        dt.append(' ', req)
      }
      const dd = document.createElement('dd')
      dd.textContent = def.get('description') ?? ''
      list.append(dt, dd)
    }
    container.append(title, list)
  }

  /**
   * Workshop: the instructions and the example submissions, which are the
   * parts an author writes. Peer submissions and assessments are user data.
   */
  private async renderWorkshop(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, 'mod_workshop', 'intro')
    const { parseNestedRecords } = await import('@mbzoo/core')
    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const examples = xml
      ? await parseNestedRecords(
          new TextDecoder().decode(xml),
          'examplesubmissions',
          'examplesubmission',
        )
      : []

    // workshop::PHASE_* in mod/workshop/locallib.php (REPO-005).
    const PHASES: Record<string, string> = {
      '10': t('workshop.phase.setup'),
      '20': t('workshop.phase.submission'),
      '30': t('workshop.phase.assessment'),
      '40': t('workshop.phase.evaluation'),
      '50': t('workshop.phase.closed'),
    }
    container.appendChild(
      this.buildFacts([[t('workshop.phase'), PHASES[fields.get('phase') ?? ''] ?? undefined]]),
    )

    for (const [key, label] of [
      ['instructauthors', t('workshop.instructAuthors')],
      ['instructreviewers', t('workshop.instructReviewers')],
    ] as const) {
      const html = await this.resolveHtml(fields.get(key), 'mod_workshop', key, contextId)
      if (!html) continue
      const details = document.createElement('details')
      details.className = 'advanced'
      details.open = true
      const summary = document.createElement('summary')
      summary.textContent = label
      const el = document.createElement('div')
      el.className = 'activity-content'
      el.innerHTML = html
      details.append(summary, el)
      container.appendChild(details)
    }

    if (examples.length === 0) return
    const title = document.createElement('div')
    title.className = 'q-answers-title'
    title.textContent = `${t('workshop.examples')} (${examples.length})`
    container.appendChild(title)
    for (const example of examples) {
      const card = document.createElement('div')
      card.className = 'quiz-card'
      const head = document.createElement('strong')
      head.textContent = example.get('title') ?? ''
      const content = document.createElement('div')
      content.className = 'activity-content'
      content.innerHTML = await this.resolveHtml(
        example.get('content') ?? '',
        'mod_workshop',
        'submission_content',
        contextId,
        example.get('id'),
      )
      card.append(head, content)
      container.appendChild(card)
    }
  }

  /**
   * IMS content package: a website in files, plus a table of contents stored
   * as a PHP-serialized array in the module's own `structure` field.
   */
  private async renderImscp(
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    const { parseImscpStructure } = await import('@mbzoo/core')
    const items = parseImscpStructure(fields.get('structure') ?? '')
    if (items.length > 0) {
      const details = document.createElement('details')
      details.className = 'advanced'
      details.open = true
      const summary = document.createElement('summary')
      summary.textContent = t('imscp.contents')
      details.appendChild(summary)
      const build = (nodes: typeof items): HTMLElement => {
        const ul = document.createElement('ul')
        ul.className = 'imscp-toc'
        for (const node of nodes) {
          const li = document.createElement('li')
          const name = document.createElement('span')
          name.textContent = node.title
          li.appendChild(name)
          if (node.href !== '') {
            const file = document.createElement('code')
            file.textContent = node.href
            li.append(' ', file)
          }
          if (node.children.length > 0) li.appendChild(build(node.children))
          ul.appendChild(li)
        }
        return ul
      }
      details.appendChild(build(items))
      container.appendChild(details)
    }
    await this.renderFileList('imscp', contextId, fields, container)
  }

  /**
   * Forum, chat and wiki: their content is user-generated, so a content-only
   * backup carries the settings that change what the activity meant and
   * nothing else. Naming those beats the generic metadata fallback.
   */
  private async renderDiscussionLike(
    mod: string,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, `mod_${mod}`, 'intro')

    if (mod === 'forum') {
      const TYPES: Record<string, string> = {
        general: t('forum.type.general'),
        news: t('forum.type.news'),
        qanda: t('forum.type.qanda'),
        single: t('forum.type.single'),
        eachuser: t('forum.type.eachuser'),
        blog: t('forum.type.blog'),
      }
      const raw = fields.get('type') ?? ''
      container.appendChild(this.buildFacts([[t('forum.type'), TYPES[raw] ?? raw]]))
    } else if (mod === 'chat') {
      container.appendChild(this.buildSummary([['availableFrom', fields.get('chattime')]]))
    } else {
      const MODES: Record<string, string> = {
        collaborative: t('wiki.mode.collaborative'),
        individual: t('wiki.mode.individual'),
      }
      const raw = fields.get('wikimode') ?? ''
      container.appendChild(
        this.buildFacts([
          [t('wiki.mode'), MODES[raw] ?? raw],
          [t('wiki.firstPage'), fields.get('firstpagetitle')],
        ]),
      )
    }

    const EMPTY = { forum: 'forum.empty', chat: 'chat.empty', wiki: 'wiki.empty' } as const
    const ABSENT = {
      forum: 'forum.noUserData',
      chat: 'chat.noUserData',
      wiki: 'wiki.noUserData',
    } as const
    const key = mod as keyof typeof EMPTY
    const note = document.createElement('p')
    note.className = 'fallback-note'
    note.textContent = this.ctx.backup.includesUserData ? t(EMPTY[key]) : t(ABSENT[key])
    container.appendChild(note)
  }

  /** Feedback questionnaire: every item, in author order (read-only). */
  private async renderFeedback(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, 'mod_feedback', 'intro')
    const { parseFeedbackXml } = await import('@mbzoo/core')
    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const feedback = xml
      ? await parseFeedbackXml(new TextDecoder().decode(xml))
      : { items: [], pageAfterSubmit: '', anonymous: false, autoNumbering: false }

    const notice = document.createElement('p')
    notice.className = 'quiz-notice'
    notice.textContent = feedback.anonymous
      ? `${t('feedback.inspectOnly')} ${t('feedback.anonymous')}`
      : t('feedback.inspectOnly')
    container.appendChild(notice)

    container.appendChild(
      this.buildSummary([
        ['availableFrom', fields.get('timeopen')],
        ['dueDate', fields.get('timeclose')],
      ]),
    )

    if (feedback.items.length === 0) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent = t('feedback.noItems')
      container.appendChild(note)
      return
    }

    const list = document.createElement('ol')
    list.className = 'feedback-list'
    let number = 0
    for (const item of feedback.items) {
      if (item.type === 'pagebreak') {
        const hr = document.createElement('hr')
        hr.className = 'feedback-pagebreak'
        list.appendChild(hr)
        continue
      }
      const li = document.createElement('li')
      li.className = `feedback-item t-${item.type}`

      if (item.html !== '') {
        // A label carries authored HTML instead of a question.
        const body = document.createElement('div')
        body.className = 'activity-content'
        body.innerHTML = await this.resolveHtml(
          item.html,
          'mod_feedback',
          'item',
          contextId,
          String(item.id),
        )
        li.appendChild(body)
        li.classList.add('feedback-label')
        list.appendChild(li)
        continue
      }

      // Moodle numbers only the items that collect an answer, and only when
      // the activity asked for it (REPO-005: complete_form::add_item_number).
      if (item.hasValue) number++
      const head = document.createElement('div')
      head.className = 'quiz-q-head'
      const badge = document.createElement('span')
      badge.className = 'mod-badge t-blue'
      badge.textContent = item.type
      const name = document.createElement('strong')
      name.textContent =
        feedback.autoNumbering && item.hasValue ? `${number}. ${item.text}` : item.text
      head.append(badge, ' ', name)
      if (item.required) {
        const req = document.createElement('span')
        req.className = 'q-pool-chip'
        req.textContent = t('feedback.required')
        head.append(' ', req)
      }
      li.appendChild(head)

      if (item.choices.length > 0) {
        const options = document.createElement('ul')
        options.className = 'q-answers moodle-inputs'
        for (const [i, choice] of item.choices.entries()) {
          const option = document.createElement('li')
          option.className = 'q-neutral'
          const label = document.createElement('label')
          const input = document.createElement('input')
          input.type = item.choiceStyle === 'checkbox' ? 'checkbox' : 'radio'
          input.name = `fb-${item.id}`
          input.value = String(i)
          const span = document.createElement('span')
          span.textContent = choice
          label.append(input, span)
          option.appendChild(label)
          options.appendChild(option)
        }
        li.appendChild(options)
      } else if (item.type === 'textarea') {
        const ta = document.createElement('textarea')
        ta.className = 'q-input'
        ta.rows = 4
        li.appendChild(ta)
      } else if (item.type === 'textfield' || item.type === 'numeric') {
        const input = document.createElement('input')
        input.type = item.type === 'numeric' ? 'number' : 'text'
        input.className = 'q-input'
        li.appendChild(input)
      }
      list.appendChild(li)
    }
    container.appendChild(list)

    if (feedback.pageAfterSubmit !== '') {
      const after = document.createElement('details')
      after.className = 'advanced'
      const summary = document.createElement('summary')
      summary.textContent = t('feedback.afterSubmit')
      const body = document.createElement('div')
      body.className = 'activity-content'
      // page_after_submit is activity-wide: no itemid (REPO-005).
      body.innerHTML = await this.resolveHtml(
        feedback.pageAfterSubmit,
        'mod_feedback',
        'page_after_submit',
        contextId,
      )
      after.append(summary, body)
      container.appendChild(after)
    }
  }

  private async renderGlossary(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, 'mod_glossary', 'intro')
    const { parseGlossaryXml } = await import('@mbzoo/core')
    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const entries = xml ? await parseGlossaryXml(new TextDecoder().decode(xml)) : []
    if (entries.length === 0) {
      const note = document.createElement('p')
      note.className = 'fallback-note'
      // Entries are user-generated, so a backup taken without user data has
      // none by construction. Saying only "no entries" reads like a gap.
      note.textContent = this.ctx.backup.includesUserData
        ? t('glossaryEmpty')
        : t('glossaryNoUserData')
      container.appendChild(note)
      return
    }
    const head = document.createElement('div')
    head.className = 'q-answers-title'
    head.textContent = `${entries.length} ${t('entries')}`
    container.appendChild(head)
    const list = document.createElement('dl')
    list.className = 'glossary-list'
    for (const e of entries) {
      const dt = document.createElement('dt')
      dt.textContent = e.concept
      const dd = document.createElement('dd')
      // mod_glossary/entry is keyed by entry id (REPO-005). Entries are user
      // data, so this only ever resolves in a backup taken with users.
      dd.innerHTML = await this.resolveHtml(
        e.definition,
        'mod_glossary',
        'entry',
        contextId,
        String(e.id),
      )
      list.append(dt, dd)
    }
    container.appendChild(list)
  }

  /** Assign: intro + friendly summary (dates, submission types). */
  private async renderAssign(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    await this.renderIntroPlusMetadataShell(fields, contextId, container, 'mod_assign', 'intro')
    // Submission plugins live deeper than the generic field capture; scan
    // the raw module XML for enabled plugin types (documented shape, REPO-005).
    const xmlBytes = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    const submissionTypes: string[] = []
    if (xmlBytes) {
      const raw = new TextDecoder().decode(xmlBytes)
      const block = /<submissionplugins>[\s\S]*?<\/submissionplugins>/.exec(raw)?.[0] ?? ''
      const seen = new Set<string>()
      for (const m of block.matchAll(/<plugin[\s\S]*?<\/plugin>/g)) {
        const type = /<type>(\w+)<\/type>/.exec(m[0])?.[1]
        const enabled = /<enabled>(\d)<\/enabled>/.exec(m[0])?.[1]
        if (type && enabled === '1' && !seen.has(type)) {
          seen.add(type)
          submissionTypes.push(
            type === 'file' ? 'File' : type === 'onlinetext' ? 'Online text' : type,
          )
        }
      }
    }
    container.appendChild(
      this.buildSummary([
        ['availableFrom', fields.get('allowsubmissionsfromdate')],
        ['dueDate', fields.get('duedate')],
        ['cutoffDate', fields.get('cutoffdate')],
      ]),
    )
    if (submissionTypes.length > 0) {
      const row = document.createElement('p')
      row.className = 'summary-row'
      const label = document.createElement('b')
      label.textContent = `${t('submissionTypes')}: `
      row.appendChild(label)
      row.appendChild(document.createTextNode(submissionTypes.join(', ')))
      container.appendChild(row)
    }
  }

  /** Intro + advanced shell shared by summary-style renderers. */
  private async renderIntroPlusMetadataShell(
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
    componentName: string,
    fileArea: string,
  ): Promise<void> {
    const introHtml = await this.resolveHtml(
      fields.get('intro'),
      componentName,
      fileArea,
      contextId,
    )
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }
  }

  /** Key/value summary grid with human dates for known time fields. */
  private buildSummary(pairs: Array<[string, string | undefined]>): HTMLElement {
    const lang = navigator.language
    const grid = document.createElement('div')
    grid.className = 'summary-grid'
    const labels: Record<string, string> = {
      availableFrom: t('availableFrom'),
      dueDate: t('dueDate'),
      cutoffDate: t('cutoffDate'),
      timeLimit: t('timeLimit'),
    }
    for (const [key, raw] of pairs) {
      if (!raw) continue
      const n = Number(raw)
      let value = ''
      if (key === 'timeLimit') {
        if (!Number.isFinite(n) || n <= 0) continue
        value = `${Math.round(n / 60)} ${t('minutes')}`
      } else {
        if (!Number.isFinite(n) || n <= 0) continue
        value = formatDate(n, lang)
      }
      const item = document.createElement('div')
      item.className = 'summary-item'
      const k = document.createElement('span')
      k.className = 'summary-key'
      k.textContent = labels[key] ?? key
      const v = document.createElement('b')
      v.textContent = value
      item.append(k, v)
      grid.appendChild(item)
    }
    return grid
  }

  /** Book: TOC + chapter navigation with sanitized chapter HTML. */
  private async renderBook(
    activity: ActivityInfo,
    fields: Map<string, string>,
    contextId: string,
    container: HTMLElement,
  ): Promise<void> {
    const introHtml = await this.resolveHtml(fields.get('intro'), 'mod_book', 'intro', contextId)
    if (introHtml) {
      const el = document.createElement('div')
      el.className = 'activity-intro'
      el.innerHTML = introHtml
      container.appendChild(el)
    }

    const xml = await this.tryRead(`${moduleNameDir(activity)}.xml`)
    if (!xml) {
      notAvailable(container)
      return
    }
    const book = await parseBookXml(new TextDecoder().decode(xml))
    if (book.chapters.length === 0) {
      notAvailable(container)
      return
    }

    // Table of contents.
    const toc = document.createElement('ol')
    toc.className = 'book-toc'
    book.chapters.forEach((ch, i) => {
      const li = document.createElement('li')
      li.className = ch.subchapter ? 'book-sub' : ''
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'book-toc-item'
      b.textContent = ch.title || `Chapter ${i + 1}`
      b.addEventListener('click', () => showChapter(i))
      li.appendChild(b)
      toc.appendChild(li)
    })
    container.appendChild(toc)

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

    const chapterBox = document.createElement('div')
    chapterBox.className = 'book-chapter'
    container.appendChild(chapterBox)

    let index = 0
    const showChapter = (i: number): void => {
      index = Math.max(0, Math.min(book.chapters.length - 1, i))
      const ch = book.chapters[index] as BookChapter
      counter.textContent = `${index + 1} ${t('quiz.of')} ${book.chapters.length}`
      prev.toggleAttribute('disabled', index === 0)
      next.toggleAttribute('disabled', index === book.chapters.length - 1)
      for (const b of toc.querySelectorAll('.book-toc-item')) b.classList.remove('selected')
      toc.querySelectorAll('.book-toc-item')[index]?.classList.add('selected')
      chapterBox.replaceChildren()
      const title = document.createElement('h4')
      title.textContent = ch.title
      const body = document.createElement('div')
      body.className = 'activity-content'
      body.innerHTML = this.safeHtml(ch.content)
      chapterBox.append(title, body)
      // Chapter images resolve from mod_book/chapters filearea.
      void this.resolveChapterImages(body, ch, contextId)
      for (const panel of chapterBox.querySelectorAll('.external-panel'))
        chapterBox.appendChild(panel)
    }
    prev.addEventListener('click', () => showChapter(index - 1))
    next.addEventListener('click', () => showChapter(index + 1))
    showChapter(0)
  }

  /** Rewrites @@PLUGINFILE@@ images inside chapter HTML (mod_book scope). */
  private async resolveChapterImages(
    body: HTMLElement,
    ch: BookChapter,
    contextId: string,
  ): Promise<void> {
    const html = await this.resolveHtml(ch.content, 'mod_book', 'chapters', contextId)
    body.innerHTML = html
  }

  /** Moodle settings panel: visibility, groups, completion, availability. */
  /**
   * Serializes what the Preview tab rendered into a standalone document
   * (ADR-0016).
   *
   * Exporting the rendered DOM rather than re-resolving the source fields
   * means the file matches the screen for every module — page, book,
   * glossary, quiz — with one implementation. The markup was already
   * sanitized on its way in (ADR-0012), so no new trust boundary opens
   * here; blob: URLs are re-inlined as data: URIs so the file survives on
   * its own, and live-only surfaces (sandboxed iframes, pdf.js canvases)
   * are replaced by a note pointing at the file download instead.
   *
   * Returns undefined when nothing textual survives — a PDF-only resource
   * has no HTML worth exporting.
   */
  exportContentHtml(preview: HTMLElement, title: string): string | undefined {
    const clone = preview.cloneNode(true) as HTMLElement

    // Inspector chrome, not authored course content. Dropping it keeps
    // the export to what the course author actually wrote, and stops an
    // activity whose body is only a "not available" note or a metadata
    // disclosure from looking like it has something worth exporting —
    // the XML export already covers that case.
    for (const node of clone.querySelectorAll('.fallback-note, .advanced')) node.remove()

    for (const node of clone.querySelectorAll('iframe, canvas, embed, object, script, style')) {
      const note = document.createElement('p')
      note.className = 'mbzoo-omitted'
      note.textContent = t('export.omitted')
      node.replaceWith(note)
    }
    for (const node of clone.querySelectorAll('[src], [href]')) {
      for (const attr of ['src', 'href']) {
        const value = node.getAttribute(attr)
        if (value === null || !value.startsWith('blob:')) continue
        const inlined = this.dataUri(value)
        if (inlined) node.setAttribute(attr, inlined)
        else node.removeAttribute(attr)
      }
    }
    if ((clone.textContent ?? '').trim() === '') return undefined

    // Assembled by hand rather than through innerHTML: `clone` is already
    // sanitized and the wrapper carries no backup-derived markup.
    const head = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      `<title>${escapeHtmlText(title)}</title>`,
      '</head>',
      '<body>',
      `<h1>${escapeHtmlText(title)}</h1>`,
    ].join('\n')
    const footer = `<hr>\n<p>${escapeHtmlText(t('export.note'))}</p>`
    return `${head}\n${clone.innerHTML}\n${footer}\n</body>\n</html>\n`
  }

  /** Converts a managed blob: URL back into an inline data: URI. */
  private dataUri(url: string): string | undefined {
    const source = this.blobSources.get(url)
    if (!source || source.data.byteLength > MAX_INLINE_BYTES) return undefined
    return `data:${source.mime};base64,${base64(source.data)}`
  }

  /** External references panel: detected and listed, never fetched. */
  renderExternalPanel(rawHtml: string, container: HTMLElement): void {
    const refs = scanExternalRefs(rawHtml)
    if (refs.length === 0) return
    const details = document.createElement('details')
    details.className = 'advanced external-panel'
    const summary = document.createElement('summary')
    const providers = new Map<string, number>()
    for (const ref of refs) providers.set(ref.provider, (providers.get(ref.provider) ?? 0) + 1)
    summary.textContent = `External content (${refs.length})`
    details.appendChild(summary)
    const list = document.createElement('ul')
    list.className = 'external-list'
    for (const [provider, count] of [...providers.entries()].sort((a, b) => b[1] - a[1])) {
      const li = document.createElement('li')
      li.textContent = `${provider}: ${count}`
      list.appendChild(li)
    }
    details.appendChild(list)
    const urls = document.createElement('ul')
    urls.className = 'external-urls'
    for (const ref of refs.slice(0, 20)) {
      const li = document.createElement('li')
      const code = document.createElement('code')
      code.textContent = `[${ref.provider}] ${ref.url.slice(0, 120)}`
      li.appendChild(code)
      urls.appendChild(li)
    }
    details.appendChild(urls)
    container.appendChild(details)
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

  private questionCard(
    q: QuizQuestion,
    drawn = false,
    resolved?: ReadonlyMap<string, string>,
  ): HTMLElement {
    const type = q.qtype.toLowerCase()
    const el = document.createElement('div')
    const head = document.createElement('div')
    head.className = 'quiz-q-head'
    const badge = document.createElement('span')
    badge.className = 'mod-badge t-blue'
    badge.textContent = q.qtype
    const name = document.createElement('strong')
    name.textContent = q.name
    head.append(badge, ' ', name)
    if (drawn) {
      // Which questions are drawn and which are always asked is not visible
      // from the question itself, and matters most in a mixed quiz.
      const from = document.createElement('span')
      from.className = 'q-pool-chip'
      from.textContent =
        q.categoryName === '' ? t('quiz.drawnChip') : t('quiz.drawnFrom', { cat: q.categoryName })
      head.append(' ', from)
    }
    el.appendChild(head)

    const body = document.createElement('div')
    body.className = 'activity-content'
    if (type === 'random') {
      // resolveQuizSlots keeps a placeholder only when its category has
      // nothing drawable in this backup — a pool that exists was expanded
      // into its own cards, so there is none to list here.
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent =
        q.categoryName === ''
          ? t('quiz.randomUnknown')
          : t('quiz.randomEmpty', { cat: q.categoryName })
      body.appendChild(note)
      el.appendChild(body)
      return el
    }
    body.innerHTML = resolved?.get(`q${q.id}`) ?? this.safeHtml(q.questionText)
    el.appendChild(body)

    if (type === 'essay') {
      const ta = document.createElement('textarea')
      ta.className = 'q-input'
      ta.rows = 5
      ta.placeholder = '…'
      el.appendChild(ta)
      return el
    }
    if (type === 'shortanswer' || type === 'numerical') {
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'q-input'
      el.appendChild(input)
      return el
    }
    if (q.matches.length > 0) {
      // A match question's pairs are the answer: showing the stem alone
      // renders a question with nothing under it.
      const title = document.createElement('div')
      title.className = 'q-answers-title'
      title.textContent = t('quiz.matchPairs')
      const list = document.createElement('dl')
      list.className = 'q-match-list'
      for (const pair of q.matches) {
        const dt = document.createElement('dt')
        dt.innerHTML = this.safeHtml(pair.stem)
        const dd = document.createElement('dd')
        dd.className = 'q-correct'
        dd.innerHTML = this.safeHtml(pair.response)
        list.append(dt, dd)
      }
      el.append(title, list)
      return el
    }
    if (q.answers.length === 0) return el

    const multi = q.answers.filter((a) => a.fraction > 0).length > 1
    const list = document.createElement('ul')
    list.className = 'q-answers moodle-inputs'
    q.answers.forEach((a, i) => {
      const li = document.createElement('li')
      li.className =
        a.fraction >= 1
          ? 'q-correct'
          : a.fraction > 0
            ? 'q-partial'
            : a.fraction < 0
              ? 'q-penalty'
              : 'q-neutral'
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = multi ? 'checkbox' : 'radio'
      input.name = `q-${q.id}`
      input.value = String(i)
      const text = document.createElement('span')
      text.innerHTML = resolved?.get(`a${a.id}`) ?? this.safeHtml(a.text)
      label.append(input, text)
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
      li.append(label, mark)
      list.appendChild(li)
    })
    const title = document.createElement('div')
    title.className = 'q-answers-title'
    title.textContent = t('quiz.answers')
    el.append(title, list)
    return el
  }
}

/** Is this stored file an HTML document, i.e. a page rather than an asset? */
export function isHtmlRecord(rec: BackupFileRecord): boolean {
  return rec.mimeType === 'text/html' || /\.(html?|xhtml)$/i.test(rec.fileName)
}

/**
 * Page links used to be inert (ADR-0020) and were styled to say so. They
 * navigate again through the parent (ADR-0022), so they are styled as the
 * live links they now are; the attribute stays as the navigation hook.
 */
const PAGE_LINK_STYLE =
  '<style>[data-mbz-page]{cursor:pointer;text-decoration:underline}' +
  '[data-mbz-page-inert]{cursor:not-allowed;opacity:.7;' +
  'text-decoration:underline dotted}</style>'

/**
 * Full archive path of a record, normalized the way resolveRelative returns
 * paths so the two can be compared directly. Record paths are stored
 * decoded, so the reference side is decoded too (ADR-0022).
 */
/**
 * Replaces the first occurrence of a literal, treating the replacement as
 * literal too. String.replace expands $&, $`, $' and $1 in the replacement,
 * and these replacements are built from backup-controlled references — a ref
 * containing $' would otherwise splice the rest of the document into the
 * attribute (ADR-0022).
 */
function replaceOnce(haystack: string, needle: string, replacement: string): string {
  const at = haystack.indexOf(needle)
  if (at < 0) return haystack
  return haystack.slice(0, at) + replacement + haystack.slice(at + needle.length)
}

export function recordFullPath(r: BackupFileRecord): string {
  return decodeRefPath(`${r.filePath}${r.fileName}`.replace(/^\/+/, ''))
}

/**
 * Chooses the entry HTML of a multi-file website, if any: index/default at
 * the shallowest path wins, otherwise the shallowest .html file.
 */
export function pickWebsiteEntry(records: BackupFileRecord[]): BackupFileRecord | undefined {
  const htmls = records.filter((r) => /\.(html?|xhtml)$/i.test(r.fileName))
  if (htmls.length === 0) return undefined
  const depth = (r: BackupFileRecord): number => r.filePath.split('/').filter(Boolean).length
  const byPreference = (pred: (r: BackupFileRecord) => boolean): BackupFileRecord | undefined =>
    htmls
      .filter(pred)
      .sort((a, b) => depth(a) - depth(b) || a.fileName.localeCompare(b.fileName))[0]
  return (
    byPreference((r) => /^index\.html?$/i.test(r.fileName)) ??
    byPreference((r) => /^default\.html?$/i.test(r.fileName)) ??
    byPreference(() => true)
  )
}

function sortRecords(records: BackupFileRecord[]): BackupFileRecord[] {
  return [...records].sort((a, b) =>
    (a.filePath + a.fileName).localeCompare(b.filePath + b.fileName),
  )
}

/**
 * Player assets are raw texts inlined into the generated player page; opaque
 * origins cannot load blob URLs minted by the application origin (ADR-0017),
 * so they cannot be emitted as separate files. Imported dynamically so the
 * ~190 KB H5P core stays out of the main bundle for the majority of visitors
 * who never open an H5P (ADR-0018); it is still bundled, never fetched from a
 * network origin, and resolved once per session.
 */
let playerAssetsPromise: Promise<PlayerAssets | undefined> | undefined

/**
 * Loads a SCORM runtime bundle on demand (TECH-015). The classic (non-ESM)
 * build is required: it is an IIFE that self-assigns the constructor to a
 * global, whereas the ESM build exports a binding and would have to be a
 * deferred module — too late for a SCO that looks for the API while parsing.
 * Only the flavor the package declares is fetched, so a 1.2 course never
 * pays for the much larger 2004 bundle.
 */
let scorm12Promise: Promise<string | undefined> | undefined
let scorm2004Promise: Promise<string | undefined> | undefined

function loadScormRuntime(is2004: boolean): Promise<string | undefined> {
  const load = async (mod: Promise<{ default: string }>): Promise<string | undefined> => {
    try {
      return (await mod).default
    } catch {
      return undefined
    }
  }
  if (is2004) {
    scorm2004Promise ??= load(import('scorm-again-classic/scorm2004.min.js?raw'))
    return scorm2004Promise
  }
  scorm12Promise ??= load(import('scorm-again-classic/scorm12.min.js?raw'))
  return scorm12Promise
}

function loadPlayerAssets(): Promise<PlayerAssets | undefined> {
  playerAssetsPromise ??= Promise.all([
    import('h5p-standalone/dist/frame.bundle.js?raw'),
    import('h5p-standalone/dist/styles/h5p.css?raw'),
  ])
    .then(([core, css]) => ({ coreJs: core.default, css: css.default }))
    .catch(() => undefined)
  return playerAssetsPromise
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

/**
 * Card standing in for content the course embedded from another site.
 *
 * The embed is never loaded: MBZoo does not fetch backup-referenced remote
 * content (ADR-0009). But deleting the element outright — which is what the
 * sanitizer does to an <iframe> — loses the fact that the author put a video
 * there, and a page whose only content was one embed then reports itself as
 * empty, which is worse than showing nothing because it is untrue.
 */
function externalEmbedCard(url: string): HTMLElement {
  const card = document.createElement('div')
  card.className = 'file-card'
  const head = document.createElement('div')
  head.className = 'file-head'
  const name = document.createElement('span')
  name.textContent = t('embed.external')
  const kind = document.createElement('span')
  kind.className = 'type-chip'
  kind.textContent = classifyProvider(url)
  head.append(name, kind)
  card.appendChild(head)

  const note = document.createElement('p')
  note.className = 'fallback-note'
  note.textContent = t('embed.externalHint')
  card.appendChild(note)

  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noreferrer noopener nofollow'
  link.className = 'button-link'
  link.textContent = t('embed.externalOpen')
  card.appendChild(link)

  const shown = document.createElement('code')
  shown.className = 'url-target'
  shown.textContent = url
  card.appendChild(shown)
  return card
}

/**
 * Lists the files that travelled with a resource but are not the resource.
 * Collapsed, because they are context rather than content.
 */
function appendSiblingList(
  container: HTMLElement,
  records: BackupFileRecord[],
  main: BackupFileRecord,
): void {
  const others = records.filter((f) => f !== main)
  if (others.length === 0) return
  const details = document.createElement('details')
  details.className = 'advanced'
  const summary = document.createElement('summary')
  summary.textContent = `${t('resource.alsoStored')} (${others.length})`
  details.appendChild(summary)
  const list = document.createElement('ul')
  list.className = 'resource-files'
  for (const rec of sortRecords(others).slice(0, 500)) {
    const li = document.createElement('li')
    li.textContent = `${rec.filePath}${rec.fileName}`
    list.appendChild(li)
  }
  details.appendChild(list)
  container.appendChild(details)
}

/** Download name for a file the course embedded rather than listed. */
function embeddedFileName(mime: string): string {
  const ext = mime === 'application/pdf' ? 'pdf' : (mime.split('/').pop() ?? 'bin')
  return `embedded.${ext}`
}

/** DOMPurify wrapper — the single sanitization point (ADR-0012). */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: false },
    ALLOWED_URI_REGEXP,
  })
}

/** Assets larger than this stay out of an exported HTML file. */
const MAX_INLINE_BYTES = 2 * 1024 * 1024

/**
 * Cap for assets inlined into a sandboxed site. Higher than the export cap
 * because a course page legitimately carries a lot of imagery, but still
 * bounded: base64 inflates a payload by roughly a third.
 */
const MAX_SANDBOX_ASSET_BYTES = 8 * 1024 * 1024

function base64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) overflows the call stack on
  // anything more than a few hundred KB.
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Points a sandboxed site's external links at a new tab (ADR-0017).
 *
 * Without a target the click would navigate the frame itself, loading a
 * remote page inside MBZoo's layout; with one it opens a normal tab. rel
 * is rewritten wholesale rather than appended so an author-supplied rel
 * cannot weaken it. Only http(s) is retargeted — in-page anchors, and the
 * data: URIs just produced for archive assets, are left alone.
 */
function retargetExternalLinks(html: string): string {
  return html.replace(
    /<a\s([^>]*\bhref=("https?:\/\/[^"]*"|'https?:\/\/[^']*')[^>]*)>/gi,
    (_tag, attrs: string) => {
      const cleaned = attrs
        .replace(/\s*\btarget=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s*\brel=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .trim()
      return `<a ${cleaned} target="_blank" rel="noopener noreferrer nofollow">`
    },
  )
}

/**
 * Inline data: URI for an archive asset.
 *
 * Sandboxed previews run on an opaque origin (ADR-0014), where a blob: URL
 * minted by the app origin is not loadable — the browser rejects it as a
 * cross-origin local resource, which silently broke every image,
 * stylesheet and script in multi-file HTML resources. A data: URI travels
 * with the document, so it is the form that works inside the sandbox.
 */
function dataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime || 'application/octet-stream'};base64,${base64(bytes)}`
}

/** Escapes text interpolated into the export wrapper's markup. */
function escapeHtmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function moduleNameDir(a: ActivityInfo): string {
  // Directory convention from moodle_backup.xml <directory>: activities/<mod>_<id>.
  return `activities/${a.moduleName}_${a.id}/${a.moduleName}`
}
