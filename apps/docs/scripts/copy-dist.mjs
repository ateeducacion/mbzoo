// Copies the built docs into the viewer's public dir so the single Pages
// artifact serves viewer + docs (AN-007).
import { cp, rm } from 'node:fs/promises'

const viewerPublic = new URL('../../viewer/public/', import.meta.url)
const docBuild = new URL('../doc_build/', import.meta.url)

await rm(new URL('docs', viewerPublic), { recursive: true, force: true })
await cp(docBuild, new URL('docs', viewerPublic), { recursive: true })
// llmstxt.org looks at the site root as well as the docs base.
await cp(new URL('llms.txt', docBuild), new URL('llms.txt', viewerPublic))
await cp(new URL('llms-full.txt', docBuild), new URL('llms-full.txt', viewerPublic))
console.log('docs copied to apps/viewer/public/docs; llms.txt at viewer public root')
