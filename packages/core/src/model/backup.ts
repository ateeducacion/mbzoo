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
  /** Course format plugin (`topics`, `weeks`, `flexsections`, …), '' when unknown. */
  format: string
  /**
   * Site the backup was taken from (<original_wwwroot>), '' when absent.
   * The only way to turn a `$@…@$` link token back into a real URL, since
   * the backup stores no absolute links (see moodle/links.ts).
   */
  originalWwwroot: string
  readonly source: SourceInfo
}

export interface SectionInfo {
  readonly id: number
  readonly number: number
  name: string
  summary: string
  readonly activityIds: number[]
  /**
   * Moodle 4.5+ lets a module own a section ("delegated section",
   * `mod_subsection`): the section is not a sibling of the numbered ones, it
   * belongs under the activity named here. Undefined for an ordinary section.
   */
  delegatedTo?: { component: string; activityId: number } | undefined
  /**
   * Section this one nests under, or undefined at the top level. Set for a
   * flexsections `parent` (ADR-0030) and for a delegated section, whose
   * parent is the section holding the activity that owns it. Course formats
   * are the one place Moodle stores hierarchy outside the section list, and
   * flattening it silently misreads a course (REPO-004: 111 of 111 Saylor
   * backups nest up to three levels deep).
   */
  parentId?: number | undefined
  /** Raw `<course_format_options>` name → value, kept for formats not modelled. */
  readonly formatOptions: ReadonlyMap<string, string>
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
  /**
   * Moodle's main-file marker. Exactly one record per file area carries 1;
   * every other record is 0. For `mod_resource` it is how Moodle knows which
   * of the files a teacher uploaded is *the* resource — the rest are the
   * folder that came with it.
   */
  readonly sortOrder: number
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
  /**
   * Whether the backup was taken with user data (`users` root setting).
   * Glossary entries, forum discussions and submissions are user-generated,
   * so their absence is expected — not a gap — when this is false.
   */
  readonly includesUserData: boolean
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
