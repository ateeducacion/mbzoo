/**
 * Downloadable doctor reports. Preview XML is omitted: it can contain
 * question text. The on-screen preview is separate and stays in memory.
 */
import type { DiagnosticReport, Finding, RepairOutcome } from './types.ts'

export interface ReportSession {
  readonly applied?: RepairOutcome['applied']
  readonly skipped?: RepairOutcome['skipped']
  readonly note?: string
}

export function redactReport(report: DiagnosticReport): DiagnosticReport {
  return {
    ...report,
    findings: report.findings.map((finding) => redactFinding(finding)),
  }
}

export function reportJson(report: DiagnosticReport, session: ReportSession = {}): string {
  return JSON.stringify(
    {
      ...redactReport(report),
      repairsApplied: session.applied ?? [],
      repairsSkipped: session.skipped ?? [],
      note: session.note ?? report.limitations[0] ?? '',
    },
    null,
    2,
  )
}

export function reportText(report: DiagnosticReport, session: ReportSession = {}): string {
  const lines: string[] = []
  const facts = report.facts
  lines.push('MBZ Doctor report')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`File: ${facts.filename}`)
  lines.push(`Container: ${facts.format}`)
  lines.push(`Size: ${facts.bytes} bytes`)
  lines.push(`Moodle release: ${facts.moodleRelease || '(not declared)'}`)
  lines.push(`Moodle version: ${facts.moodleVersion || '(not declared)'}`)
  lines.push(`Backup version: ${facts.backupVersion || '(not declared)'}`)
  lines.push(`Backup date: ${facts.backupDate || '(not declared)'}`)
  lines.push(`Course: ${facts.courseName || '(untitled)'}`)
  lines.push(
    `Sections: ${facts.sections}. Activities: ${facts.activities}. Question categories: ${facts.questionCategories}. Questions: ${facts.questions}. File records: ${facts.fileRecords}.`,
  )
  lines.push(
    `Users included: ${labelFlag(facts.includesUserData)}. Files included: ${labelFlag(facts.includesFiles)}.`,
  )
  lines.push(`Target Moodle: ${facts.targetRelease || '(not selected)'}`)
  lines.push('')
  lines.push(`Findings: ${report.findings.length}`)
  for (const finding of report.findings) {
    lines.push('')
    lines.push(`[${finding.severity}] ${finding.title}`)
    lines.push(`Id: ${finding.id}`)
    lines.push(
      `Category: ${finding.category}. Repair: ${finding.repairability}. State: ${finding.state}.`,
    )
    lines.push(finding.explanation)
    lines.push(`Consequences: ${finding.consequences}`)
    for (const item of finding.evidence) {
      const where = item.entry ? `${item.entry}: ` : ''
      lines.push(`- ${where}${item.detail}`)
    }
    if (finding.repair) {
      lines.push(`Repair: ${finding.repair.summary}`)
      for (const transform of finding.repair.transforms) lines.push(`- ${transform}`)
      lines.push(`Entries: ${finding.repair.entries.join(', ')}`)
      lines.push('XML preview omitted from this report.')
    }
  }
  if ((session.applied ?? []).length > 0) {
    lines.push('')
    lines.push('Repairs applied:')
    for (const repair of session.applied ?? [])
      lines.push(`- ${repair.id} (${repair.entries.join(', ')})`)
  }
  if ((session.skipped ?? []).length > 0) {
    lines.push('')
    lines.push(`Repairs skipped: ${(session.skipped ?? []).join(', ')}`)
  }
  lines.push('')
  lines.push(session.note ?? 'No repair was applied in this report.')
  lines.push('')
  lines.push('Limitations:')
  for (const limitation of report.limitations) lines.push(`- ${limitation}`)
  lines.push('')
  lines.push('Archive and structural validation is not a Moodle restore.')
  return lines.join('\n')
}

function redactFinding(finding: Finding): Finding {
  const repair = finding.repair
  if (!repair) return finding
  return {
    ...finding,
    repair: {
      ...repair,
      preview: repair.preview.map((preview) => ({
        entry: preview.entry,
        before: '[omitted]',
        after: '[omitted]',
      })),
    },
  }
}

function labelFlag(value: boolean | undefined): string {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return 'not declared'
}
