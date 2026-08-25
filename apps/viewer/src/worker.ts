/**
 * Viewer worker: parses a .mbz off the main thread (ADR-0005).
 * Receives the raw file bytes, returns the normalized model.
 */

import type { ParsedBackup } from '@mbzoo/core'
import { openBackup } from '@mbzoo/core'

export type ParseRequest = { id: number; buffer: ArrayBuffer }
export type ParseResponse =
  | { id: number; ok: true; backup: ParsedBackup; elapsedMs: number }
  | { id: number; ok: false; error: string }

self.onmessage = async (event: MessageEvent<ParseRequest>): Promise<void> => {
  const { id, buffer } = event.data
  try {
    const start = performance.now()
    const backup = await openBackup(new Blob([buffer]))
    const response: ParseResponse = {
      id,
      ok: true,
      backup,
      elapsedMs: Math.round(performance.now() - start),
    }
    self.postMessage(response)
  } catch (e) {
    const response: ParseResponse = {
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(response)
  }
}
