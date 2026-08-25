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
export { type BackupXmlResult, parseMoodleBackupXml } from './moodle/backup-xml.ts'
export { parseCourseXml, parseSectionXml } from './moodle/course-xml.ts'
export { fileKey, NULL_SENTINEL, parseFilesXml } from './moodle/files-xml.ts'
export {
  parseQuestionsXml,
  parseQuizQuestionIds,
  type QuizAnswer,
  type QuizQuestion,
} from './moodle/questions-xml.ts'
export { MAX_XML_BYTES, parseXmlEvents, type XmlEvent } from './moodle/xml.ts'
export { type BackupSession, openBackup, openBackupSession } from './open-backup.ts'
