/**
 * EXP-004: reader-layer cost on one ZIP — open, list, read files.xml, read
 * one pool file — for the shipped LazyZipReader.
 *
 *   bun run research/experiments/scripts/exp-004-reader-layer.ts <file.zip>
 *
 * The "before" row in EXP-004 used the reader this one replaced, obtained
 * with `git show 4a2b1a6:packages/core/src/archive/fflate-zip-reader.ts` and
 * driven by the same steps; it is not kept in the tree.
 */
import { LazyZipReader } from '../../../packages/core/src/index.ts'

const path = process.argv[2]
if (!path) {
  console.error('usage: exp-004-reader-layer.ts <file.zip>')
  process.exit(2)
}
const rss = (): number => process.memoryUsage().rss
const base = rss()
let peak = base
const timer = setInterval(() => {
  peak = Math.max(peak, rss())
}, 20)
const t0 = performance.now()
const reader = await LazyZipReader.open(Bun.file(path))
const list = await reader.listEntries()
const filesXml = await reader.readEntry('files.xml')
const pool = list.find((e) => e.name.startsWith('files/') && e.uncompressedSize > 1000)
if (pool) await reader.readEntry(pool.name)
const ms = Math.round(performance.now() - t0)
clearInterval(timer)
peak = Math.max(peak, rss())
console.log(
  JSON.stringify({
    entries: list.length,
    filesXmlKB: Math.round(filesXml.byteLength / 1024),
    ms,
    peakMB: Math.round((peak - base) / 1048576),
  }),
)
await reader.close()
