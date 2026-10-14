/**
 * Viewer worker: parses a .mbz off the main thread (ADR-0005) and keeps the
 * archive open so the UI can request entry payloads lazily (activity XML,
 * binary content) without re-reading the file.
 */

import type { DiagnosticReport, ParsedBackup, RepairOutcome } from '@mbzoo/core'
import { analyzeBackup, applyRepairs, contentHashPath, openBackupSession } from '@mbzoo/core'

export type ParseRequest = { kind: 'parse'; id: number; file: File }
export type ReadRequest = { kind: 'read'; id: number; path: string }
export type CloseRequest = { kind: 'close' }
export type DoctorAnalyzeRequest = {
  kind: 'doctor-analyze'
  id: number
  file: File
  targetRelease?: string
}
export type DoctorRepairRequest = {
  kind: 'doctor-repair'
  id: number
  file: File
  selectedIds: string[]
  confirmed: boolean
  targetRelease?: string
}
export type DoctorCancelRequest = { kind: 'doctor-cancel' }
export type WorkerRequest =
  | ParseRequest
  | ReadRequest
  | CloseRequest
  | DoctorAnalyzeRequest
  | DoctorRepairRequest
  | DoctorCancelRequest

export type ParseResponse =
  | { kind: 'parse'; id: number; ok: true; backup: ParsedBackup; elapsedMs: number }
  | { kind: 'parse'; id: number; ok: false; error: string }

export type ReadResponse =
  | { kind: 'read'; id: number; ok: true; data: ArrayBuffer }
  | { kind: 'read'; id: number; ok: false; error: string }

export type DoctorProgress = {
  kind: 'doctor-progress'
  id: number
  done: number
  total: number
  label: string
}

export type DoctorAnalyzeResponse =
  | { kind: 'doctor-analyze'; id: number; ok: true; report: DiagnosticReport }
  | { kind: 'doctor-analyze'; id: number; ok: false; error: string }

export type DoctorRepairPayload = {
  readonly bytes: ArrayBuffer
  readonly before: DiagnosticReport
  readonly after: DiagnosticReport
  readonly applied: RepairOutcome['applied']
  readonly skipped: RepairOutcome['skipped']
  readonly note: string
}

export type DoctorRepairResponse =
  | ({ kind: 'doctor-repair'; id: number; ok: true } & DoctorRepairPayload)
  | { kind: 'doctor-repair'; id: number; ok: false; error: string }

export type WorkerResponse =
  | ParseResponse
  | ReadResponse
  | DoctorAnalyzeResponse
  | DoctorRepairResponse

let session: Awaited<ReturnType<typeof openBackupSession>> | undefined
let currentFile: File | undefined
let doctorAbort: AbortController | undefined

function doctorOptions(
  targetRelease: string | undefined,
  id: number,
): {
  filename: string
  targetRelease?: string
  signal: AbortSignal
  onProgress: (done: number, total: number, label: string) => void
} {
  const options: {
    filename: string
    targetRelease?: string
    signal: AbortSignal
    onProgress: (done: number, total: number, label: string) => void
  } = {
    filename: currentFile?.name ?? 'backup.mbz',
    signal: doctorAbort?.signal ?? new AbortController().signal,
    onProgress: (done, total, label) => {
      const progress: DoctorProgress = { kind: 'doctor-progress', id, done, total, label }
      self.postMessage(progress)
    },
  }
  if (targetRelease) options.targetRelease = targetRelease
  return options
}

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = event.data
  if (msg.kind === 'close') {
    doctorAbort?.abort()
    await session?.close()
    session = undefined
    currentFile = undefined
    return
  }

  if (msg.kind === 'doctor-cancel') {
    doctorAbort?.abort()
    return
  }

  if (msg.kind === 'doctor-analyze' || msg.kind === 'doctor-repair') {
    doctorAbort?.abort()
    doctorAbort = new AbortController()
    currentFile = msg.file
    const options = doctorOptions(msg.targetRelease, msg.id)
    options.filename = msg.file.name
    try {
      if (msg.kind === 'doctor-analyze') {
        const report = await analyzeBackup(msg.file, options)
        const response: DoctorAnalyzeResponse = {
          kind: 'doctor-analyze',
          id: msg.id,
          ok: true,
          report,
        }
        self.postMessage(response)
      } else {
        const outcome = await applyRepairs(msg.file, msg.selectedIds, {
          ...options,
          confirmed: msg.confirmed,
        })
        const bytes = await outcome.blob.arrayBuffer()
        const response: DoctorRepairResponse = {
          kind: 'doctor-repair',
          id: msg.id,
          ok: true,
          bytes,
          before: outcome.before,
          after: outcome.after,
          applied: outcome.applied,
          skipped: outcome.skipped,
          note: outcome.note,
        }
        self.postMessage(response, [bytes])
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      if (msg.kind === 'doctor-analyze') {
        const response: DoctorAnalyzeResponse = {
          kind: 'doctor-analyze',
          id: msg.id,
          ok: false,
          error,
        }
        self.postMessage(response)
      } else {
        const response: DoctorRepairResponse = {
          kind: 'doctor-repair',
          id: msg.id,
          ok: false,
          error,
        }
        self.postMessage(response)
      }
    }
    return
  }

  if (msg.kind === 'parse') {
    try {
      await session?.close()
      const start = performance.now()
      currentFile = msg.file
      const s = await openBackupSession(currentFile)
      const backup = await s.backup
      session = s
      const response: ParseResponse = {
        kind: 'parse',
        id: msg.id,
        ok: true,
        backup,
        elapsedMs: Math.round(performance.now() - start),
      }
      self.postMessage(response)
    } catch (e) {
      const response: ParseResponse = {
        kind: 'parse',
        id: msg.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }
      self.postMessage(response)
    }
    return
  }

  // read
  try {
    if (!session) throw new Error('No backup is open')
    let path = msg.path
    // Allow addressing entries by content hash directly.
    if (/^[0-9a-f]{40}$/.test(path)) path = contentHashPath(path)
    const data = await session.readEntry(path)
    // readEntry owns its bytes now (ADR-0036 rule 3), so an entry that fills
    // its buffer exactly can be transferred as-is; copying it first would
    // hold a second full copy of a large video for no reason.
    const exact = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
    const out = (
      exact ? data.buffer : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    ) as ArrayBuffer
    const response: ReadResponse = {
      kind: 'read',
      id: msg.id,
      ok: true,
      data: out,
    }
    self.postMessage(response, [out])
  } catch (e) {
    const response: ReadResponse = {
      kind: 'read',
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(response)
  }
}
