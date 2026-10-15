/**
 * Findings that refuse a rebuild. Shared so the scan and the applier agree
 * without importing each other (ADR-0037, ADR-0038).
 */
export const REBUILD_BLOCKERS: ReadonlySet<string> = new Set([
  'archive.unreadable',
  'archive.unsafe-path',
  'archive.duplicate-path',
  'archive.checksum',
  'archive.crc',
  'archive.missing-root',
  'archive.multiple-roots',
])
