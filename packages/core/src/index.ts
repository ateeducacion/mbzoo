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
} from './moodle/activity-xml.ts'
export {
  type AvailabilityCondition,
  type AvailabilitySummary,
  humanizeAvailability,
} from './moodle/availability.ts'
export { type BackupXmlResult, parseMoodleBackupXml } from './moodle/backup-xml.ts'
export { type BookChapter, type MoodleBook, parseBookXml } from './moodle/book-xml.ts'
export { parseCourseXml, parseSectionXml } from './moodle/course-xml.ts'
export { fileKey, NULL_SENTINEL, parseFilesXml } from './moodle/files-xml.ts'
export { type GlossaryEntry, parseGlossaryXml } from './moodle/glossary-xml.ts'
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
  parseQuestionsXml,
  parseQuizQuestionIds,
  type QuizAnswer,
  type QuizQuestion,
  type QuizSlotPlan,
  randomQuestionPool,
  resolveQuizSlots,
} from './moodle/questions-xml.ts'
export { MAX_XML_BYTES, parseXmlEvents, type XmlEvent } from './moodle/xml.ts'
export { type BackupSession, openBackup, openBackupSession } from './open-backup.ts'
