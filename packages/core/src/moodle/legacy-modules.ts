/**
 * Activity modules that Moodle core has removed.
 *
 * A backup outlives the Moodle that wrote it: SMR_SOR and SMR_SEGI both
 * carry `chat` activities, and no Moodle 5 can restore them — the plugin is
 * gone. An inspector is the only thing left that can read them, so MBZoo
 * renders them like any other module and says plainly that the format has
 * been retired.
 *
 * Releases verified in the Moodle tree (REPO-005, read 2026-08-25):
 * `mod/UPGRADING.md` names 5.0 for chat and survey, and the commit removing
 * mod_assignment first ships in v4.2.0.
 */

export interface LegacyModule {
  /** Moodle release that dropped the module from core. */
  readonly removedIn: string
  /** Tracker issue that did it. */
  readonly issue: string
}

const REMOVED: ReadonlyMap<string, LegacyModule> = new Map([
  ['chat', { removedIn: '5.0', issue: 'MDL-82457' }],
  ['survey', { removedIn: '5.0', issue: 'MDL-82457' }],
  // Superseded by mod_assign in 2.3; the files went in 4.2.
  ['assignment', { removedIn: '4.2', issue: 'MDL-72350' }],
])

/**
 * Returns when a module was removed from Moodle core, or undefined for one
 * that still exists (and for third-party modules, which MBZoo cannot know
 * anything about and must not label).
 */
export function legacyModule(moduleName: string): LegacyModule | undefined {
  return REMOVED.get(moduleName.toLowerCase())
}
