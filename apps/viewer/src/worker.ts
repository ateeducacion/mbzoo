/**
 * Viewer worker: parses a .mbz off the main thread (ADR-0005) and keeps the
 * archive open so the UI can request entry payloads lazily (activity XML,
 * binary content) without re-reading the file.
 */

import type { ParsedBackup } from '@mbzoo/core'
import { contentHashPath, openBackupSession } from '@mbzoo/core'

export type ParseRequest = { kind: 'parse'; id: number; file: File }
export type ReadRequest = { kind: 'read'; id: number; path: string }
export type CloseRequest = { kind: 'close' }
export type WorkerRequest = ParseRequest | ReadRequest | CloseRequest

export type ParseResponse =
  | { kind: 'parse'; id: number; ok: true; backup: ParsedBackup; elapsedMs: number }
  | { kind: 'parse'; id: number; ok: false; error: string }

export type ReadResponse =
  | { kind: 'read'; id: number; ok: true; data: ArrayBuffer }
  | { kind: 'read'; id: number; ok: false; error: string }

export type WorkerResponse = ParseResponse | ReadResponse

let session: Awaited<ReturnType<typeof openBackupSession>> | undefined
let currentFile: File | undefined

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = event.data
  if (msg.kind === 'close') {
    await session?.close()
    session = undefined
    currentFile = undefined
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
