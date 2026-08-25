import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

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
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
})
