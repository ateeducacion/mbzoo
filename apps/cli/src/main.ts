/**
 * MBZoo CLI — Bun adapter over the portable core (ADR-0004).
 *
 * Usage: bun run apps/cli/src/main.ts <backup.mbz> [more.mbz …]
 */
import { basename } from 'node:path'
import { openBackup } from '@mbzoo/core'

async function inspect(path: string): Promise<void> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    console.error(`error: no such file: ${path}`)
    process.exitCode = 1
    return
  }
  const start = performance.now()
  const backup = await openBackup(file)
  const elapsed = Math.round(performance.now() - start)

  console.log(`${basename(path)}  [${backup.format}]  ${elapsed} ms`)
  console.log(`  course:     ${backup.course.fullname || '(untitled)'}`)
  if (backup.course.shortname) console.log(`  short name: ${backup.course.shortname}`)
  console.log(`  sections:   ${backup.sections.length}`)
  console.log(`  activities: ${backup.activities.length}`)
  console.log(`  files:      ${backup.files.size}`)
  for (const warning of backup.warnings.slice(0, 10)) {
    console.log(`  warning [${warning.code}]: ${warning.message}`)
  }
  for (const section of backup.sections) {
    console.log(`  • ${section.name || `section ${section.number}`}`)
    for (const id of section.activityIds) {
      const a = backup.activities.find((act) => act.id === id)
      if (a) console.log(`      – (${a.moduleName}) ${a.title}`)
    }
  }
}

const args = process.argv.slice(2).filter((a) => a !== '--')
if (args.length === 0) {
  console.error('usage: mbzoo <backup.mbz> [more.mbz …]')
  process.exit(1)
}
for (const path of args) await inspect(path)
