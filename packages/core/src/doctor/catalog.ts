/**
 * English catalog of doctor rules. The viewer translates `ruleId`; the JSON
 * report keeps these sentences so an administrator can read it without the UI.
 * Sources are registered records (REPO-005) plus the Moodle 5.2 lines cited
 * in research/analysis/notes/AN-009.
 */
import type {
  Confidence,
  DoctorCategory,
  Evidence,
  Finding,
  Repairability,
  RepairPlan,
  Severity,
  ValidationState,
} from './types.ts'

interface RuleCopy {
  readonly title: string
  readonly explanation: string
  readonly severity: Severity
  readonly category: DoctorCategory
  readonly consequences: string
  readonly repairability: Repairability
  readonly sources: readonly string[]
}

export const RULES = {
  'archive.unreadable': {
    title: 'Archive cannot be opened safely',
    explanation:
      'The container could not be indexed. Repair is refused because a partial rebuild could drop or corrupt entries.',
    severity: 'critical',
    category: 'archive',
    consequences: 'Moodle cannot restore a container MBZoo cannot safely list.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'archive.extension': {
    title: 'File extension does not match the container',
    explanation:
      'The format was detected from magic bytes. The extension is ignored for reading and is not rewritten.',
    severity: 'info',
    category: 'archive',
    consequences: 'Some tools trust the extension and refuse the file before Moodle sees it.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'archive.missing-root': {
    title: 'moodle_backup.xml is missing',
    explanation:
      'A Moodle 2 backup keeps its course manifest at the archive root. Without it this is not a restorable backup.',
    severity: 'critical',
    category: 'archive',
    consequences: 'Restore stops before any course content is created.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'archive.enclosed': {
    title: 'Backup root is inside an extra directory',
    explanation:
      'moodle_backup.xml is not at the archive root. MBZoo does not strip the wrapper automatically: an unusual layout is not assumed to be safe to normalise.',
    severity: 'warning',
    category: 'archive',
    consequences: 'Moodle looks for moodle_backup.xml at the root and will reject the wrapper.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'archive.multiple-roots': {
    title: 'More than one backup manifest',
    explanation:
      'Several moodle_backup.xml entries are present. MBZoo will not choose one and discard the others.',
    severity: 'critical',
    category: 'archive',
    consequences: 'Restore cannot tell which manifest is the course.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'archive.unsafe-path': {
    title: 'Unsafe archive path',
    explanation:
      'An entry name is absolute or contains "..". It is not extracted and a rebuild will not copy it.',
    severity: 'critical',
    category: 'archive',
    consequences: 'A naive unzip could write outside the restore directory.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'archive.duplicate-path': {
    title: 'Duplicate archive path',
    explanation:
      'Two entries share one path. A rebuild would have to drop one of them, so it is refused.',
    severity: 'critical',
    category: 'archive',
    consequences: 'Which bytes survive depends on the unzipper.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'archive.checksum': {
    title: 'TAR header checksum does not match',
    explanation:
      'The ustar checksum field does not match the header bytes. The entry is still listed, and a rebuild is refused.',
    severity: 'critical',
    category: 'archive',
    consequences: 'A strict tar reader may skip or reject the entry.',
    repairability: 'not-repairable',
    sources: ['STD-001'],
  },
  'archive.crc': {
    title: 'ZIP CRC does not match the entry bytes',
    explanation:
      'The central-directory CRC-32 does not match the uncompressed bytes MBZoo read. The bytes are left unchanged.',
    severity: 'critical',
    category: 'archive',
    consequences: 'Moodle ZipArchive can reject the entry on restore.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'archive.ratio': {
    title: 'Suspicious compression ratio',
    explanation:
      'An entry expands far beyond its compressed size. It was not fully expanded during this check.',
    severity: 'warning',
    category: 'archive',
    consequences: 'Opening it could use much more memory than the .mbz suggests.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'xml.malformed': {
    title: 'XML is not well-formed',
    explanation:
      'A strict parse failed. MBZoo will not guess a tree or drop unknown elements to make it parse.',
    severity: 'critical',
    category: 'xml',
    consequences: 'Moodle restore stops on this file.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'xml.utf8': {
    title: 'XML is not valid UTF-8',
    explanation: 'The entry is not valid UTF-8, so it was not edited.',
    severity: 'critical',
    category: 'xml',
    consequences: 'The XML parser on the server will reject the file.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'xml.limit': {
    title: 'XML exceeds the safety limit',
    explanation: 'The entry is larger than the XML parse ceiling, so it was not parsed or edited.',
    severity: 'warning',
    category: 'xml',
    consequences: 'A problem inside this file would not show up in this scan.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'xml.illegal-chars': {
    title: 'Illegal XML control characters',
    explanation:
      'The entry contains XML 1.0-forbidden control characters. Removing them changes those bytes and needs confirmation. Other markup is kept.',
    severity: 'warning',
    category: 'xml',
    consequences: 'A strict XML parser aborts on the first forbidden code point.',
    repairability: 'confirmation-required',
    sources: ['REPO-005'],
  },
  'metadata.no-target': {
    title: 'No target Moodle version selected',
    explanation:
      'Version-dependent incompatibilities are reported as conditional. They are not treated as unconditional errors.',
    severity: 'info',
    category: 'compatibility',
    consequences: 'A destination older than the backup can still refuse the restore.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'metadata.target-older': {
    title: 'Target Moodle is older than the backup',
    explanation:
      'Moodle does not restore a newer backup onto an older release. The declared backup version is left unchanged: lowering it would select the wrong restore code.',
    severity: 'warning',
    category: 'compatibility',
    consequences: 'Restore on that site fails even when the XML is well-formed.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'sections.missing': {
    title: 'Section XML is missing',
    explanation:
      'moodle_backup.xml lists a section whose section.xml is not in the archive. The declaration is kept.',
    severity: 'warning',
    category: 'sections',
    consequences: 'That section is restored from the manifest only, or the step fails closed.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'sections.cycle': {
    title: 'Section parent cycle',
    explanation:
      'Course-format parent links loop. The hierarchy is not flattened and no parent is deleted.',
    severity: 'warning',
    category: 'sections',
    consequences: 'The course format can refuse the section tree or nest it unexpectedly.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'activities.missing': {
    title: 'Declared activity is missing',
    explanation:
      'moodle_backup.xml lists an activity directory that is not in the archive. The declaration is not removed.',
    severity: 'critical',
    category: 'activities',
    consequences: 'Restore looks for that directory and stops or skips the activity.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'activities.missing-module': {
    title: 'module.xml is missing',
    explanation: 'The activity directory has no module.xml. It is not deleted.',
    severity: 'warning',
    category: 'activities',
    consequences: 'Visibility, completion and grouping for that activity are not restored.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'activities.undeclared': {
    title: 'Activity directory is not in the manifest',
    explanation:
      'An activities/ directory is present but moodle_backup.xml does not list it. It is left in place.',
    severity: 'warning',
    category: 'activities',
    consequences: 'Restore ignores it. Removing it would discard whatever it holds.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'activities.duplicate': {
    title: 'Duplicate activity id',
    explanation: 'Two manifest entries share one module id.',
    severity: 'warning',
    category: 'activities',
    consequences: 'Restore mappings for that id become ambiguous.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'activities.bad-section': {
    title: 'Activity points at a missing section',
    explanation:
      'The activity sectionid is not in the manifest section list. The reference is kept.',
    severity: 'warning',
    category: 'activities',
    consequences: 'The activity may restore into the wrong section or fail the section lookup.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'files.excluded': {
    title: 'File content was excluded from the backup',
    explanation:
      'The root files setting is off. Missing file bytes are expected and are not reported as corruption.',
    severity: 'info',
    category: 'files',
    consequences: 'Restore creates the file records without the bytes that were never packed.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'files.missing': {
    title: 'File bytes are missing',
    explanation:
      'files.xml points at a content hash that is not in the archive, and the backup included files. No empty placeholder is written.',
    severity: 'critical',
    category: 'files',
    consequences: 'The activity that uses this file restores without that content.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'files.hash': {
    title: 'Content hash does not match the bytes',
    explanation:
      'The stored bytes hash to a different SHA-1 than files.xml declares. The record and the bytes are both kept.',
    severity: 'critical',
    category: 'files',
    consequences: 'Moodle addresses files by that hash, so the record will not find these bytes.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'files.size': {
    title: 'Declared file size does not match the bytes',
    explanation:
      'The SHA-1 matches the entry, so the byte length in files.xml can be set to the length of those bytes. The bytes are not recompressed or replaced.',
    severity: 'warning',
    category: 'files',
    consequences: 'A size check during restore can reject the record.',
    repairability: 'automatic',
    sources: ['REPO-005'],
  },
  'files.hash-skipped': {
    title: 'Large file was not hashed',
    explanation:
      'The entry is above the doctor hash budget. Its size was compared to the directory; its SHA-1 was not recomputed.',
    severity: 'info',
    category: 'files',
    consequences: 'A hash mismatch in this entry would not show up in this scan.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'files.unreferenced': {
    title: 'Archive file has no files.xml record',
    explanation:
      'A files/ payload has no matching content hash in files.xml. It is kept. It is not treated as safe to delete.',
    severity: 'info',
    category: 'files',
    consequences:
      'Restore will not attach it to an activity. Deleting it could drop content the manifest failed to name.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'questions.legacy-random': {
    title: 'Legacy random question (Moodle restores this)',
    explanation:
      'This backup takes the pre-4.0 question path. Moodle 4.0 and later stash qtype "random" and the quiz step converts the slot into a question set reference. Rewriting it here would bypass that tested path.',
    severity: 'info',
    category: 'questions',
    consequences:
      'On Moodle 4.0 through 5.2 this shape is the supported compatibility case, not the coding_exception.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'questions.random-modern': {
    title: 'Random question in a modern question bank',
    explanation:
      'The backup declares Moodle 4.0 or later and a question bank entry whose only question has qtype "random". Moodle 5.2 refuses to insert that question. The repair matches the quiz slot question_reference to a question_set_reference and removes that placeholder entry. Other questions are not deleted.',
    severity: 'critical',
    category: 'questions',
    consequences:
      'Moodle 5.2 raises: You cannot restore a question with qtype "random". It must be converted to a set reference instead.',
    repairability: 'confirmation-required',
    sources: ['REPO-005'],
  },
  'questions.random-blocked': {
    title: 'Random question cannot be converted safely',
    explanation:
      'A qtype "random" record would hit the modern insert path, but the category context, the slot reference, or neighbouring versions are not unambiguous. No question is deleted and no id is invented.',
    severity: 'critical',
    category: 'questions',
    consequences: 'Moodle 5.2 can still throw the random-question coding_exception on this backup.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'questions.category-cycle': {
    title: 'Question category cycle',
    explanation: 'Category parent links loop. No parent is rewritten.',
    severity: 'warning',
    category: 'questions',
    consequences: 'Category restore can recurse or drop a category.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'questions.missing-parent': {
    title: 'Question category parent is missing',
    explanation:
      'A category parent id is not in this backup and is not the root. It may belong to a context that was not included. No parent is invented.',
    severity: 'warning',
    category: 'questions',
    consequences: 'The category may restore under the top category, or the step may skip it.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'questions.empty-pool': {
    title: 'Random pool has no questions in this backup',
    explanation:
      'The category a random slot draws from contains no other questions here. That can be an empty bank, or the questions may live in a bank this backup did not include. Nothing is generated to fill it.',
    severity: 'warning',
    category: 'questions',
    consequences: 'The slot restores and then has nothing to draw at attempt time.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'questions.outside-bank': {
    title: 'Quiz slot points outside this backup',
    explanation:
      'A slot reference does not match a question or bank entry in this archive. A valid reference can depend on a question bank that was not packed. It is not rewritten.',
    severity: 'info',
    category: 'questions',
    consequences:
      'Restore succeeds only when that bank already exists on the destination, or it reports a missing question.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'questions.bad-filter': {
    title: 'Question set filter is not JSON',
    explanation:
      'filtercondition is not valid JSON, so category and tag filters cannot be checked. It is not rewritten.',
    severity: 'warning',
    category: 'questions',
    consequences: 'Moodle 4.3 and later fail while decoding the set reference.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'questions.duplicate-id': {
    title: 'Duplicate question id',
    explanation: 'Two question elements share one id. Neither is renumbered.',
    severity: 'warning',
    category: 'questions',
    consequences: 'Restore mappings for that id collide.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'plugins.removed': {
    title: 'Activity module was removed from Moodle core',
    explanation:
      'This module is no longer part of Moodle core. Its XML is preserved. It is not converted into another activity.',
    severity: 'warning',
    category: 'plugins',
    consequences: 'A destination that has dropped the module cannot restore the activity.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'plugins.unknown-module': {
    title: 'Activity module is not in Moodle core',
    explanation:
      'The backup names a module MBZoo does not know as core. That does not mean the destination site is missing it. Plugin data is left untouched.',
    severity: 'info',
    category: 'plugins',
    consequences:
      'Restore needs that plugin on the server. Deleting the activity would drop the teacher’s content.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'plugins.unknown-qtype': {
    title: 'Question type is not in the known core set',
    explanation:
      'A question uses a type MBZoo does not list as current core. It may be a third-party type the destination has installed. It is not deleted or renamed.',
    severity: 'info',
    category: 'plugins',
    consequences:
      'Without that qtype plugin, Moodle restores the question as missingtype or stops.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'userdata.excluded': {
    title: 'User data was not included',
    explanation:
      'The root users setting is off. Missing submissions, forum posts and users.xml are expected.',
    severity: 'info',
    category: 'userdata',
    consequences: 'Restore creates the course without participant history.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'userdata.missing': {
    title: 'users.xml is missing',
    explanation:
      'The backup says it includes users, but users.xml is not there. Accounts are not invented.',
    severity: 'warning',
    category: 'userdata',
    consequences: 'Attempts and submissions that point at users cannot be remapped.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'userdata.malformed': {
    title: 'users.xml is malformed',
    explanation:
      'The user file did not parse. Usernames, emails and ids are not modified. This report does not copy them.',
    severity: 'warning',
    category: 'userdata',
    consequences:
      'User restore stops. Conflicts with existing accounts on the destination still cannot be seen from the file alone.',
    repairability: 'manual',
    sources: ['REPO-005'],
  },
  'references.token': {
    title: 'Backup link points at an activity that is not in this file',
    explanation:
      'A $@…@$ token names a course-module id that this backup does not contain. The token is not fetched and its href is not rewritten.',
    severity: 'info',
    category: 'references',
    consequences: 'After restore the link still depends on an activity that was not in the backup.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
  'embedded.package': {
    title: 'Activity package file is missing',
    explanation:
      'A SCORM or H5P activity has no matching file record with bytes in this backup. The package is not reconstructed.',
    severity: 'warning',
    category: 'references',
    consequences: 'The activity shell can restore while the package itself does not play.',
    repairability: 'not-repairable',
    sources: ['REPO-005'],
  },
} as const satisfies Record<string, RuleCopy>

export type RuleId = keyof typeof RULES

export const LIMITATIONS: readonly string[] = [
  'Archive and structural validation is not a Moodle restore. Successful restoration in Moodle has not been verified.',
  'The declared Moodle release and backup version are never changed to bypass a compatibility check.',
  'Questions, activities, files, attempts, submissions and plugin XML are not deleted to force a file to parse.',
  'A missing third-party plugin, a server limit, or a user already on the destination cannot be seen from the .mbz alone.',
  'External URLs, LTI tools, H5P libraries and SCORM runtimes are not fetched or rebuilt.',
  'ZIP entries are stored uncompressed in a repaired ZIP. TAR.GZ rebuilds above 512 MB are refused.',
  'File hashes and ZIP CRC-32 are checked only up to the hash budget. Larger payloads are reported as not hashed.',
  'Evidence in a downloaded report names archive paths. It omits file bytes, question text, passwords, usernames and email addresses.',
  'A ZIP CRC mismatch blocks a rebuild: rewriting would store the same bytes under a freshly computed CRC and hide the mismatch.',
]

interface FindingExtra {
  readonly id: string
  readonly evidence?: readonly Evidence[]
  readonly confidence?: Confidence
  readonly repairability?: Repairability
  readonly state?: ValidationState
  readonly params?: Readonly<Record<string, string | number>>
  readonly activityId?: number
  readonly repair?: RepairPlan
  readonly explanation?: string
  readonly severity?: Severity
}

export function makeFinding(ruleId: RuleId, extra: FindingExtra): Finding {
  const rule = RULES[ruleId]
  const repairability = extra.repairability ?? rule.repairability
  const state: ValidationState =
    extra.state ??
    (extra.repair ? 'repair-available' : repairability === 'manual' ? 'detected' : 'detected')
  const finding: Finding = {
    id: extra.id,
    ruleId,
    title: rule.title,
    severity: extra.severity ?? rule.severity,
    category: rule.category,
    explanation: extra.explanation ?? rule.explanation,
    evidence: extra.evidence ?? [],
    confidence: extra.confidence ?? 'high',
    repairability,
    state,
    consequences: rule.consequences,
    sources: rule.sources,
    params: extra.params ?? {},
    ...(extra.activityId !== undefined ? { activityId: extra.activityId } : {}),
    ...(extra.repair ? { repair: extra.repair } : {}),
  }
  return finding
}
