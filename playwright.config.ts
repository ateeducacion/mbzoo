import { defineConfig } from '@playwright/test'

/**
 * A port per checkout, not a fixed 4173.
 *
 * Two working trees of this repo (a second one for parallel work) both ran
 * their preview server on 4173. With `reuseExistingServer`, whichever started
 * first answered the probe, so one tree's suite silently tested the other
 * tree's build — a renderer that "does nothing", indistinguishable from a real
 * bug, and it cost real debugging time.
 *
 * Derived from the checkout path rather than randomised: a random port is
 * re-rolled every time this config is re-imported in a worker, and the port
 * must be stable for the whole run. Deriving it also keeps it stable across
 * runs, so the server can be opened in a browser by hand, while two checkouts
 * still land on different ports. Set MBZOO_E2E_PORT to pin it explicitly.
 * Kept below the ephemeral range (49152+) so the OS does not hand the same
 * port to something else mid-run.
 */
function portFor(path: string): number {
  let hash = 2166136261
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return 20_000 + (Math.abs(hash) % 20_000)
}

// import.meta.url, not Bun's import.meta.dir: Playwright loads this config
// under Node, where the Bun-only property is undefined.
const port = Number(process.env.MBZOO_E2E_PORT) || portFor(import.meta.url)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // CI: fail fast, don't retry flakiness — fix it instead.
  retries: 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    // Invoked from apps/viewer with the port inline: `bun run --cwd` does not
    // forward CLI flags reliably, which is what timed out the probe in CI.
    command: `bunx vite preview --port ${port} --strictPort --host 127.0.0.1`,
    cwd: 'apps/viewer',
    url: baseURL,
    // Never reuse. With a port of our own there is nothing legitimate to
    // reuse, and reusing is precisely how a stale server goes unnoticed.
    // --strictPort turns the rare collision into a loud startup failure
    // rather than a quiet redirect to somebody else's server.
    reuseExistingServer: false,
    timeout: 20_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
})
