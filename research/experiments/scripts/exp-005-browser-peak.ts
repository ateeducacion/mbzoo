/**
 * EXP-005: what opening one backup costs a real browser, per process.
 *
 *   bun run research/experiments/scripts/exp-005-browser-peak.ts <file.mbz>
 *
 * Drives the built viewer in Chromium through its own file input, so the
 * archive travels the production path (File → worker → ArchiveReader), and
 * samples RSS of every process in the browser's tree every 100 ms. Chrome
 * splits the work: the tab's JS heap and its ArrayBuffers live in the
 * renderer, while Blob bytes are held by the browser process, which is free
 * to page them to disk. Reporting the two separately is the whole point —
 * a total alone cannot tell an allocation that must succeed in one block
 * from bytes the platform may spill.
 *
 * Needs `bun run build:viewer` first. Measurement harness, not product code.
 */
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const path = process.argv[2]
if (!path) {
  console.error('usage: exp-005-browser-peak.ts <file.mbz>')
  process.exit(2)
}
const port = 21_845

interface Sample {
  browser: number
  renderers: number
  other: number
}

/** RSS in bytes of every process descending from `root`, by Chrome role. */
function sample(root: number): Sample {
  const ps = Bun.spawnSync(['ps', '-ax', '-o', 'pid=,ppid=,rss=,command='])
  const rows: Array<{ pid: number; ppid: number; rss: number; command: string }> = []
  for (const line of ps.stdout.toString().split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (m?.[1] && m[2] && m[3]) {
      rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, command: m[4] ?? '' })
    }
  }
  const tree = new Set<number>([root])
  // Chrome spawns helpers from the browser process, but re-scan until stable
  // so a grandchild is not missed.
  for (let pass = 0; pass < 4; pass++) {
    for (const r of rows) if (tree.has(r.ppid)) tree.add(r.pid)
  }
  const out: Sample = { browser: 0, renderers: 0, other: 0 }
  for (const r of rows) {
    if (!tree.has(r.pid)) continue
    if (r.command.includes('--type=renderer')) out.renderers += r.rss
    else if (r.command.includes('--type=')) out.other += r.rss
    else out.browser += r.rss
  }
  return out
}

/** Chromium browser processes (helpers carry --type=, so they are excluded). */
function chromiumPids(): number[] {
  const ps = Bun.spawnSync(['ps', '-ax', '-o', 'pid=,command='])
  const out: number[] = []
  for (const line of ps.stdout.toString().split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (m?.[1] && m[2]?.includes('ms-playwright') && !m[2].includes('--type=')) out.push(+m[1])
  }
  return out
}

const server = spawn(
  'bunx',
  ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { cwd: 'apps/viewer', stdio: 'ignore' },
)
try {
  const url = `http://127.0.0.1:${port}/`
  for (let i = 0; ; i++) {
    try {
      await fetch(url)
      break
    } catch {
      if (i > 100) throw new Error('preview server did not start')
      await Bun.sleep(100)
    }
  }

  // launch(), not launchServer(): a connected browser makes setInputFiles
  // ship the whole file over the wire, which on a 1.4 GB backup dwarfs the
  // thing being timed. The price is that the browser process has to be found
  // by hand — it is the one new Chromium process that is not a helper.
  const before = chromiumPids()
  const browser = await chromium.launch()
  let pid = 0
  for (let i = 0; pid === 0 && i < 100; i++) {
    pid = chromiumPids().find((p) => !before.includes(p)) ?? 0
    if (pid === 0) await Bun.sleep(50)
  }
  if (pid === 0) throw new Error('no browser pid')
  const page = await browser.newPage()
  await page.goto(url)
  await page.locator('#file-input').waitFor({ state: 'attached' })

  // Absolute, not a delta from an idle baseline: RSS falls as well as rises,
  // and a peak below the moment of measurement start would read as zero.
  const base = sample(pid)
  const peak: Sample = { ...base }
  const timer = setInterval(() => {
    const s = sample(pid)
    peak.browser = Math.max(peak.browser, s.browser)
    peak.renderers = Math.max(peak.renderers, s.renderers)
    peak.other = Math.max(peak.other, s.other)
  }, 100)

  const t0 = performance.now()
  await page.setInputFiles('#file-input', path)
  let outcome = 'opened'
  try {
    // The explorer (#course) and the error card are both in the DOM from the
    // start; `hidden` is what the app actually toggles. A missing element
    // would read as "shown", so require it to exist and be visible.
    await page.waitForFunction(
      () => {
        const done = (id: string): boolean => {
          const el = document.getElementById(id)
          return el !== null && !el.hidden
        }
        return done('course') || done('error')
      },
      undefined,
      { timeout: 600_000, polling: 100 },
    )
    if (!(await page.locator('#error').evaluate((el: HTMLElement) => el.hidden))) {
      outcome = `failed: ${await page.locator('#error-msg').textContent()}`
    }
  } catch {
    outcome = 'timed out'
  }
  const ms = Math.round(performance.now() - t0)
  clearInterval(timer)

  const mb = (n: number): number => Math.round(n / 1048576)
  console.log(
    JSON.stringify({
      file: path.split('/').pop(),
      outcome,
      ms,
      idleRendererMB: mb(base.renderers),
      peakRendererMB: mb(peak.renderers),
      idleBrowserProcMB: mb(base.browser),
      peakBrowserProcMB: mb(peak.browser),
      peakOtherMB: mb(peak.other),
    }),
  )
  await browser.close()
} finally {
  server.kill()
}
