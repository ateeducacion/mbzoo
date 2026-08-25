/**
 * EXP-004: peak RSS and wall time of opening one backup end to end.
 *
 *   bun run research/experiments/scripts/exp-004-peak-memory.ts <file.mbz>
 *
 * Samples RSS every 25 ms across open + parse + one pool-file read and
 * reports the peak above the starting baseline. Bun-only (process.memoryUsage);
 * this is a measurement harness, not product code.
 */
import { openBackupSession } from '../../../packages/core/src/index.ts'

const path = process.argv[2]
if (!path) {
  console.error('usage: exp-004-peak-memory.ts <file.mbz>')
  process.exit(2)
}
const rss = (): number => process.memoryUsage().rss
const base = rss()
let peak = base
const timer = setInterval(() => {
  peak = Math.max(peak, rss())
}, 25)
const t0 = performance.now()
const session = await openBackupSession(Bun.file(path))
const backup = await session.backup
const pool = [...backup.files.values()].find((f) => f.fileSize > 0)
if (pool) await session.readEntry(`files/${pool.contentHash.slice(0, 2)}/${pool.contentHash}`)
const ms = Math.round(performance.now() - t0)
clearInterval(timer)
peak = Math.max(peak, rss())
console.log(
  JSON.stringify({
    file: path.split('/').pop(),
    sizeMB: Number((Bun.file(path).size / 1048576).toFixed(1)),
    ms,
    peakMB: Math.round((peak - base) / 1048576),
    files: backup.files.size,
  }),
)
await session.close()
