import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

/**
 * scorm-again's `exports` map publishes `./scorm12` and `./scorm2004`, whose
 * `import` condition resolves to the ESM builds — which export a binding and
 * define no global. MBZoo needs the CLASSIC builds: they are IIFEs that
 * self-assign `Scorm12API`/`Scorm2004API`, and a classic script executes
 * during parsing, so `window.API` exists before the package's own scripts
 * look for it (ADR-0023). `dist/` is not an exported subpath, so it is
 * aliased here rather than deep-imported. Resolved through the package's own
 * manifest so it does not depend on where the installer hoisted it.
 */
function scormAgainDist(): string {
  const require = createRequire(import.meta.url)
  // Neither `./dist/*` nor `./package.json` is an exported subpath, so the
  // package root is found by walking up from whatever `.` resolves to until
  // the classic bundle is in sight.
  // An unguarded resolve throws MODULE_NOT_FOUND out of the Vite config,
  // which reads as "the config is broken" rather than "run bun install" —
  // and the error below never gets a chance to say the useful thing.
  let entry: string
  try {
    entry = require.resolve('scorm-again')
  } catch {
    throw new Error(
      'scorm-again is not installed — run `bun install` (it arrived with the SCORM preview).',
    )
  }
  let dir = dirname(entry)
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(dir, 'scorm12.min.js'))) return dir
    if (existsSync(join(dir, 'dist', 'scorm12.min.js'))) return join(dir, 'dist')
    dir = dirname(dir)
  }
  throw new Error('scorm-again: classic bundles not found')
}

function serveDocsIndex(): Plugin {
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: () => void): void => {
    const path = req.url?.split('?')[0]
    if (path === '/docs' || path === '/docs/') {
      req.url = '/docs/index.html'
    }
    next()
  }
  return {
    name: 'serve-docs-index',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

export default defineConfig({
  // Relative base keeps the static build deployable at any path,
  // including GitHub Pages project sites (ADR-0011).
  base: './',
  plugins: [serveDocsIndex()],
  resolve: {
    alias: { 'scorm-again-classic': scormAgainDist() },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
    // Keep the worker in one self-contained chunk.
    //
    // Left to code-split, the worker's entry chunk doubles as a shared vendor
    // chunk that the worker itself then re-imports. Chromium dedupes that by
    // URL and evaluates the module once; WebKit evaluates it twice, and the
    // second evaluation reassigns `self.onmessage` to a fresh module instance
    // whose `session` is undefined — so parsing succeeds and every read after
    // it fails with "No backup is open", with no error anywhere.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
