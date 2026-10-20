/**
 * Evidence sentences. `detail` stays English for the JSON report and the
 * CLI; `code` and `params` let a front end show the same fact in its own
 * language (#41).
 */

export const EVIDENCE_TEXT = {
  'archive.no-signature': 'The file does not start with a ZIP or gzip signature',
  'archive.not-opened': 'The archive could not be opened',
  'archive.container': '{filename} is a {format} container',
  'archive.no-manifest': 'No moodle_backup.xml entry',
  'archive.manifest-at': 'Manifest is at {entry}',
  'archive.ratio': '{entry} expands from {compressed} to {uncompressed} bytes',
  'archive.would-become': '{entry} would become {target}',
  'xml.manifest-malformed': 'moodle_backup.xml is not well-formed',
  'xml.malformed': '{entry} is not well-formed',
  'xml.size': '{entry} is {bytes} bytes',
  'xml.utf8': '{entry} is not valid UTF-8',
  'xml.illegal-char': '{count} forbidden control character',
  'xml.illegal-chars': '{count} forbidden control characters',
  'metadata.target-older': 'Backup release {release}, target {target}',
  'metadata.roles-root': 'roles.xml root is {root}; Moodle expects roles_definition',
  'metadata.roles-root-none': 'roles.xml root is (none); Moodle expects roles_definition',
  'metadata.roles-referenced':
    'A scanned XML file names a role id. The definition is not invented.',
  'metadata.roles-incomplete':
    'Not every XML file could be scanned, so an empty roles.xml is not created.',
  'metadata.document-unreferenced': '{entry} is absent and no scanned reference requires it',
  'sections.missing': 'Section {sectionId} has no section.xml',
  'sections.cycle': 'Section {sectionId} is its own ancestor through course-format parent links',
  'activities.missing': '{module} {activityId} is declared and absent',
  'activities.missing-module': 'module.xml is absent',
  'activities.bad-section': '{module} {activityId} names section {sectionId}',
  'activities.duplicate': 'Activity id {activityId} is declared {count} times',
  'activities.undeclared': '{entry} is not listed in moodle_backup.xml',
  'plugins.removed': 'Removed in Moodle {removedIn} ({issue})',
  'plugins.not-core-module': "{module} is not in MBZoo's core module list",
  'plugins.not-core-qtype': "Question type {qtype} is not in MBZoo's core list",
  'files.size': 'files.xml says {declared} bytes; the entry is {actual} bytes',
  'files.hash': '{entry} hashes to {hash}',
  'files.matches': '{label} matches {source}',
  'files.above-budget-one': '{label}: {count} entry was above the hash budget',
  'files.above-budget': '{label}: {count} entries were above the hash budget',
  'userdata.missing': 'users.xml is not in the archive',
  'userdata.malformed': 'users.xml did not parse',
  'references.token': 'Token names course-module {moduleId}, which is not in this backup',
  'references.unknown-context':
    '{filename} uses context {contextId}, which no other scanned element declares',
  'references.inforef-file-repeated': 'file id {id} is repeated in {file}',
  'references.inforef-question-repeated': 'question id {id} is repeated in {file}',
  'references.inforef-role-repeated': 'role id {id} is repeated in {file}',
  'references.inforef-file-missing': 'file id {id} in {file} is not in this backup',
  'references.inforef-question-missing': 'question id {id} in {file} is not in this backup',
  'references.inforef-role-missing': 'role id {id} in {file} is not in this backup',
  'embedded.no-bytes': '{module} {activityId} has no file bytes for mod_{module} in this backup',
  'questions.duplicate-id': 'Question id {questionId} appears {count} times',
  'questions.missing-parent':
    'Category {categoryId} names parent {parentId}, which is not in this backup',
  'questions.category-cycle': 'Category {categoryId} is its own ancestor',
  'questions.legacy-random': 'qtype random on the pre-4.0 restore path (question {questionId})',
  'questions.random-path-unknown':
    'Backup release and backup version are both missing, so the legacy and modern restore paths cannot be told apart',
  'questions.random-target-old':
    'Target Moodle {target} is older than 4.0, so a set reference would not match its restore path',
  'questions.random-no-entry':
    'The random question is not inside a question_bank_entry, so there is no question_reference to rewrite and no context id to copy',
  'questions.random-mixed-entry':
    'Question bank entry {bankEntryId} holds {count} questions. A mixed entry is not converted, and nothing is deleted',
  'questions.random-bad-text':
    'The random question text is not 0 or 1, so subcategory inclusion cannot be copied from the legacy questiontext field',
  'questions.random-no-context':
    'Category {categoryId} has no context id to copy into questionscontextid',
  'questions.random-no-category':
    'Category (missing) has no context id to copy into questionscontextid',
  'questions.random-comma-tag':
    'A question tag name contains a comma. Moodle splits legacy tags on the first comma, so the tag would be ambiguous',
  'questions.random-slot-by-id':
    'A quiz slot still points at this question by question id. usingcontextid is not in that XML and is not invented',
  'questions.random-has-set':
    'The slot already has a question_set_reference, so the question_reference was left in place',
  'questions.random-incomplete-reference':
    'The question_reference is missing usingcontextid, component, or questionarea',
  'questions.outside-entry':
    'Slot references question bank entry {bankEntryId}, which is not in this backup',
  'questions.outside-question':
    'Slot references question {questionId}, which is not in this backup',
  'questions.bad-filter': 'filtercondition is not valid JSON',
  'questions.random-modern':
    'Question {questionId} in bank entry {bankEntryId}, category {categoryId}',
  'questions.empty-pool': 'Category {categoryId} has no non-random questions in this backup',
  'questions.top-category':
    'Category {categoryId} is a top-level category in context {contextId} and has {count} child categories in this backup',
  'questions.top-category-no-context':
    'Category {categoryId} is a top-level category in context (empty) and has {count} child categories in this backup',
  'questions.attempt-missing':
    'Legacy attempt references question {questionId}, which is not in this backup',
  'questions.attempt-data':
    'Question {questionId} has {sessions} legacy sessions and {states} legacy states',
  'questions.bank-referenced':
    'A scanned XML file references the question bank. No category or question is invented.',
  'questions.bank-incomplete':
    'Not every XML file could be scanned, so an empty questions.xml is not created.',
  'questions.bank-root': 'questions.xml root is {root}; Moodle expects question_categories',
  'questions.bank-root-none': 'questions.xml root is (none); Moodle expects question_categories',
} as const

export type EvidenceCode = keyof typeof EVIDENCE_TEXT
export type EvidenceParams = Readonly<Record<string, string | number>>

export function fillEvidence(template: string, params: EvidenceParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

/** One evidence sentence: the stable code, its values and the English text. */
export function said(
  code: EvidenceCode,
  params: EvidenceParams = {},
): { code: EvidenceCode; params: EvidenceParams; detail: string } {
  return { code, params, detail: fillEvidence(EVIDENCE_TEXT[code], params) }
}
