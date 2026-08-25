export { FflateZipReader } from './archive/fflate-zip-reader.ts'
export type { ArchiveEntryInfo, ArchiveReader } from './archive/reader.ts'
export { detectFormat } from './archive/reader.ts'
export { sanitizeTarName, TarGzReader } from './archive/targz-reader.ts'
export * from './model/backup.ts'
export {
  contentHashPath,
  extractPluginFileRefs,
  matchFileRecord,
  parseActivityXml,
  parseNestedRecords,
} from './moodle/activity-xml.ts'
export {
  type AvailabilityCondition,
  type AvailabilitySummary,
  humanizeAvailability,
} from './moodle/availability.ts'
export { type BackupXmlResult, parseMoodleBackupXml } from './moodle/backup-xml.ts'
export { type BookChapter, type MoodleBook, parseBookXml } from './moodle/book-xml.ts'
export { parseCourseXml, parseSectionXml } from './moodle/course-xml.ts'
export {
  type FeedbackChoiceStyle,
  type FeedbackItem,
  type MoodleFeedback,
  parseFeedbackXml,
} from './moodle/feedback-xml.ts'
export { fileKey, NULL_SENTINEL, parseFilesXml } from './moodle/files-xml.ts'
export { type GlossaryEntry, parseGlossaryXml } from './moodle/glossary-xml.ts'
export {
  type CourseGradebook,
  type GradeAggregation,
  type GradeCategory,
  type GradeItem,
  type GradeKind,
  type GradeLetter,
  parseActivityGradesXml,
  parseGradebookXml,
} from './moodle/grades-xml.ts'
export {
  type GradingArea,
  type GradingDefinition,
  parseGradingXml,
  type RubricCriterion,
  type RubricLevel,
} from './moodle/grading-xml.ts'
export { type LegacyModule, legacyModule } from './moodle/legacy-modules.ts'
export {
  type LessonAnswer,
  type LessonJump,
  type LessonJumpKind,
  type LessonPage,
  type LessonPageKind,
  type MoodleLesson,
  parseLessonXml,
} from './moodle/lesson-xml.ts'
export {
  BACKUP_LINK_TOKEN,
  type BackupLink,
  backupLinkUrl,
  decodeBackupLink,
} from './moodle/links.ts'
export {
  type ActivitySettings,
  parseModuleXml,
} from './moodle/module-xml.ts'
export {
  type ImscpItem,
  MAX_PHP_BYTES,
  type PhpArray,
  type PhpValue,
  parseImscpStructure,
  parsePhpSerialized,
} from './moodle/php-serialized.ts'
export {
  parseQuestionsXml,
  parseQuizQuestionIds,
  type QuizAnswer,
  type QuizMatchPair,
  type QuizQuestion,
  type QuizSlotPlan,
  randomQuestionPool,
  resolveQuizSlots,
} from './moodle/questions-xml.ts'
export {
  type BackupUser,
  type BackupUsers,
  type PersonalDataKind,
  parseUsersXml,
} from './moodle/users-xml.ts'
export { leafValue, MAX_XML_BYTES, parseXmlEvents, type XmlEvent } from './moodle/xml.ts'
export { type BackupSession, openBackup, openBackupSession } from './open-backup.ts'
