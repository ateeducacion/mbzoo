/**
 * Moodle backup version gates used by question restore (REPO-005).
 *
 * Moodle 5.2 `restore_create_categories_and_questions::process_question`
 * stashes `qtype=random` and returns when
 * `backup_release_compare('4.0', '<') || backup_version_compare(20220202, '<')`.
 * Otherwise inserting that question throws
 * `coding_exception`: it must be converted to a set reference instead.
 * An empty release compares as older than 4.0 in PHP `version_compare`.
 */

export interface ParsedRelease {
  readonly major: number | undefined
  readonly minor: number | undefined
}

export function parseRelease(release: string): ParsedRelease {
  const match = /(\d+)\.(\d+)/.exec(release)
  if (!match) return { major: undefined, minor: undefined }
  return { major: Number(match[1]), minor: Number(match[2]) }
}

export type RandomRestorePath = 'legacy' | 'modern' | 'unknown'

export function randomRestorePath(release: string, backupVersion: string): RandomRestorePath {
  const trimmed = release.trim()
  const version = Number(backupVersion)
  const hasVersion = backupVersion.trim() !== '' && Number.isFinite(version)
  if (trimmed === '' && !hasVersion) return 'unknown'
  // version_compare('', '4.0', '<') is true, so a blank release takes the legacy arm.
  if (trimmed === '') return 'legacy'
  const parsed = parseRelease(trimmed)
  const releaseLegacy = parsed.major !== undefined && parsed.major < 4
  const stamp = hasVersion ? Number(String(Math.trunc(version)).slice(0, 8)) : undefined
  const versionLegacy = stamp !== undefined && stamp < 20220202
  if (stamp === undefined)
    return releaseLegacy ? 'legacy' : parsed.major === undefined ? 'unknown' : 'modern'
  return releaseLegacy || versionLegacy ? 'legacy' : 'modern'
}

/** True when `target` is an older Moodle release than `source`. */
export function targetIsOlder(target: string, source: string): boolean | undefined {
  const left = parseRelease(target)
  const right = parseRelease(source)
  if (left.major === undefined || right.major === undefined) return undefined
  if (left.major !== right.major) return left.major < right.major
  if (left.minor === undefined || right.minor === undefined) return undefined
  return left.minor < right.minor
}

export function targetAtLeast(target: string, removedIn: string): boolean | undefined {
  const left = parseRelease(target)
  const right = parseRelease(removedIn)
  if (left.major === undefined || right.major === undefined) return undefined
  if (left.major !== right.major) return left.major > right.major
  if (left.minor === undefined || right.minor === undefined) return undefined
  return left.minor >= right.minor
}
