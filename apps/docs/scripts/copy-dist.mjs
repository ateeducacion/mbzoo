// Copies the built docs into the viewer's public dir so the single Pages
// artifact serves viewer + docs (AN-007).
import { cp, rm } from 'node:fs/promises'

await rm(new URL('../../viewer/public/docs', import.meta.url), { recursive: true, force: true })
await cp(
  new URL('../doc_build', import.meta.url),
  new URL('../../viewer/public/docs', import.meta.url),
  {
    recursive: true,
  },
)
console.log('docs copied to apps/viewer/public/docs')
