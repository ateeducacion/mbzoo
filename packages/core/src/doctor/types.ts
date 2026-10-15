/**
 * MBZ Doctor result model. A static pass is not a Moodle restore (ADR-0037).
 */

export type Severity = 'critical' | 'warning' | 'info'

export type DoctorCategory =
  | 'archive'
  | 'xml'
  | 'metadata'
  | 'course'
  | 'sections'
  | 'activities'
  | 'files'
  | 'questions'
  | 'plugins'
  | 'compatibility'
  | 'references'
  | 'userdata'
  | 'environment'

export type Repairability = 'automatic' | 'confirmation-required' | 'manual' | 'not-repairable'

export type Confidence = 'high' | 'medium' | 'low'

export type ValidationState =
  | 'detected'
  | 'repair-available'
  | 'repair-planned'
  | 'repaired'
  | 'verified-statically'
  | 'verification-failed'
  | 'external-verification-required'

export interface Evidence {
  readonly entry?: string
  readonly activityId?: number
  readonly moduleName?: string
  readonly questionId?: number
  readonly detail: string
}

export interface RepairPreview {
  readonly entry: string
  readonly before: string
  readonly after: string
}

export interface RepairPlan {
  readonly id: string
  readonly safety: 'automatic' | 'confirmation-required'
  readonly summary: string
  readonly transforms: readonly string[]
  readonly contentLoss: boolean
  /** The original file is never modified; a new archive is written. */
  readonly reversible: true
  readonly why: string
  readonly entries: readonly string[]
  readonly preview: readonly RepairPreview[]
}

export interface Finding {
  readonly id: string
  readonly ruleId: string
  readonly title: string
  readonly severity: Severity
  readonly category: DoctorCategory
  readonly explanation: string
  readonly evidence: readonly Evidence[]
  readonly confidence: Confidence
  readonly repairability: Repairability
  readonly state: ValidationState
  readonly consequences: string
  readonly sources: readonly string[]
  readonly params: Readonly<Record<string, string | number>>
  readonly activityId?: number
  readonly repair?: RepairPlan
}

export interface BackupFacts {
  readonly filename: string
  readonly format: 'zip' | 'targz' | 'unknown'
  readonly bytes: number
  readonly moodleRelease: string
  readonly moodleVersion: string
  readonly backupVersion: string
  readonly backupDate: string
  readonly courseName: string
  readonly sections: number
  readonly activities: number
  readonly questionCategories: number
  readonly questions: number
  readonly fileRecords: number
  readonly includesUserData: boolean | undefined
  readonly includesFiles: boolean | undefined
  readonly targetRelease: string
}

export interface DiagnosticReport {
  readonly generatedAt: string
  readonly facts: BackupFacts
  readonly findings: readonly Finding[]
  readonly limitations: readonly string[]
  /** Always false unless a real Moodle restore was recorded elsewhere. */
  readonly moodleRestoreVerified: false
}

export interface DoctorOptions {
  readonly filename?: string
  readonly targetRelease?: string
  readonly now?: string
  readonly signal?: { readonly aborted: boolean }
  readonly onProgress?: (done: number, total: number, label: string) => void
  /** Entries larger than this are not hashed. Default 8 MiB. */
  readonly hashBudgetBytes?: number
}

/** A pure edit re-run against the current text of one entry (ADR-0037). */
export interface RepairStep {
  readonly id: string
  readonly order: number
  readonly entry: string
  readonly safety: 'automatic' | 'confirmation-required'
  apply(xml: string): string
}

/** Bytes added next to the manifest. `logicalPath` is relative to that directory. */
export interface ArchiveAddition {
  readonly logicalPath: string
  readonly data: Uint8Array
}

/**
 * A structural archive edit that does not rewrite XML in place (ADR-0038).
 * `stripPrefix` renames every entry. `placeUnder` is where an addition lands
 * when no unwrap is applied in the same run.
 */
export interface ArchiveEditStep {
  readonly id: string
  readonly order: number
  readonly safety: 'automatic' | 'confirmation-required'
  readonly entries: readonly string[]
  readonly stripPrefix: string
  readonly additions: readonly ArchiveAddition[]
  readonly omit: readonly string[]
  readonly placeUnder: string
}

export interface AppliedRepair {
  readonly id: string
  readonly entries: readonly string[]
}

export interface RepairOutcome {
  readonly blob: Blob
  readonly before: DiagnosticReport
  readonly after: DiagnosticReport
  readonly applied: readonly AppliedRepair[]
  readonly skipped: readonly string[]
  readonly note: string
}
