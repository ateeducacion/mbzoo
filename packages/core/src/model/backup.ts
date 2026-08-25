/**
 * Normalized, UI-independent model of a Moodle course backup.
 *
 * These types are the internal contract of MBZoo. They intentionally do not
 * mirror Moodle's XML serialization (see ADR-0004 / research/AN-002).
 * Data read from untrusted sources enters as `unknown` and is narrowed by
 * the parsers in src/moodle before it may appear here.
 */

/** Archive container detected for a backup. */
export type BackupFormat = 'zip' | 'targz' | 'unknown'

/** Provenance metadata preserved for debugging (never shown in primary UI). */
export interface SourceInfo {
  /** Path of the source element inside moodle_backup.xml, e.g. "course". */
  readonly xmlPath: string
}

export interface CourseInfo {
  fullname: string
  shortname: string
  readonly idNumber: string
  summary: string
  readonly startDate?: number | undefined
  readonly source: SourceInfo
}

export interface SectionInfo {
  readonly id: number
  readonly number: number
  name: string
  summary: string
  readonly activityIds: number[]
  readonly source: SourceInfo
}

/** Capability flags for an activity module. */
export type ActivityCapability = 'inspect' | 'render' | 'launch' | 'export'

import type { ActivitySettings } from '../moodle/module-xml.ts'

export interface ActivityInfo {
  readonly id: number
  /** Moodle section id this activity belongs to (from <activity><sectionid>). */
  readonly sectionId: number
  /** module.xml settings: visibility, completion, availability, groups. */
  readonly settings?: ActivitySettings | undefined
  /** Moodle mod name, e.g. "page", "forum", unknown third-party names pass through. */
  readonly moduleName: string
  title: string
  /**
   * Raw module XML payload, kept verbatim so activity-specific parsers can
   * upgrade independently without reparsing the archive.
   */
  readonly rawXml: string
  readonly source: SourceInfo
}

export interface BackupFileRecord {
  readonly contentHash: string
  readonly filePath: string
  readonly fileName: string
  readonly mimeType: string
  readonly fileSize: number
  readonly component: string
  readonly fileArea: string
  readonly itemId: string
  readonly contextId: string
}

export interface BackupParseWarning {
  /** Machine-readable warning code for tests and tooling. */
  readonly code: string
  readonly message: string
  readonly detail?: string | undefined
}

/**
 * Top-level result of opening a backup. Warnings carry unsupported or
 * malformed data instead of silently dropping it.
 */
export interface ParsedBackup {
  readonly format: BackupFormat
  readonly course: CourseInfo
  readonly sections: SectionInfo[]
  readonly activities: ActivityInfo[]
  readonly files: Map<string, BackupFileRecord>
  readonly warnings: BackupParseWarning[]
}

export class MbzParseError extends Error {
  constructor(
    message: string,
    readonly options: { cause?: unknown } = {},
  ) {
    super(message, options)
    this.name = 'MbzParseError'
  }
}
