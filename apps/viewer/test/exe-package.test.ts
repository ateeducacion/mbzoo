import { describe, expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import { unzipPackage } from '../src/lib/epub-reader.ts'
import {
  classifyExe,
  classifyZip,
  exeSiteBook,
  isExeFileName,
  readExePackage,
} from '../src/lib/exe-package.ts'

const zip = (files: Record<string, string>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))

describe('isExeFileName', () => {
  test('matches both eXeLearning extensions', () => {
    expect(isExeFileName('course.elp')).toBe(true)
    expect(isExeFileName('course.elpx')).toBe(true)
    expect(isExeFileName('COURSE.ELPX')).toBe(true)
    expect(isExeFileName('course.zip')).toBe(false)
  })
})

describe('classifyExe', () => {
  test('recognises the modern exported site by its marker files', () => {
    const entries = unzipPackage(
      zip({
        'index.html': '<html></html>',
        'content/css/base.css': '',
        'libs/exe_export.js': '',
        'libs/common.js': '',
      }),
    )
    expect(classifyExe(entries)).toBe('exe-site-modern')
  })

  test('recognises the legacy exported site', () => {
    const entries = unzipPackage(
      zip({
        'index.html': '<html></html>',
        'base.css': '',
        'nav.css': '',
        'common.js': '',
        'exe_jquery.js': '',
      }),
    )
    expect(classifyExe(entries)).toBe('exe-site-legacy')
  })

  test('prefers the site over the source when a package carries both', () => {
    // A .elpx holds the re-importable project AND the render; the render is
    // what a reader wants to see (ADR-0025).
    const entries = unzipPackage(
      zip({
        'content.xml': '<odeProject/>',
        'index.html': '<html></html>',
        'content/css/base.css': '',
        'libs/exe_export.js': '',
        'libs/common.js': '',
      }),
    )
    expect(classifyExe(entries)).toBe('exe-site-modern')
  })

  test('separates a legacy project with an XML mirror from one without', () => {
    expect(classifyExe(unzipPackage(zip({ 'contentv3.xml': '<x/>' })))).toBe('elp-legacy-xml')
    expect(classifyExe(unzipPackage(zip({ 'content.data': 'binary' })))).toBe('elp-legacy-opaque')
  })

  test('classifies by entry names, not by extension', () => {
    expect(classifyExe(unzipPackage(zip({ 'notes.txt': 'x' })))).toBe('unknown')
  })
})

describe('readExePackage', () => {
  test('reads the project title from whichever project XML is present', () => {
    const pkg = readExePackage(
      unzipPackage(zip({ 'content.xml': '<odeProject><title>My Course</title></odeProject>' })),
    )
    expect(pkg.kind).toBe('elpx-source')
    expect(pkg.title).toBe('My Course')
    expect(pkg.entry).toBe('')
  })
})

describe('exeSiteBook', () => {
  test('lists every page with the entry first, named by its own title', () => {
    const pkg = readExePackage(
      unzipPackage(
        zip({
          'index.html': '<html><head><title>Home</title></head></html>',
          'aside.html': '<html><head><title>Aside</title></head></html>',
          'content/css/base.css': '',
          'libs/exe_export.js': '',
          'libs/common.js': '',
        }),
      ),
    )
    const book = exeSiteBook(pkg)
    // Entry first, so the reader lands where the author meant; pages the
    // landing page never links to are still reachable.
    expect(book.chapters.map((c) => c.path)).toEqual(['index.html', 'aside.html'])
    expect(book.chapters.map((c) => c.title)).toEqual(['Home', 'Aside'])
  })
})

describe('classifyZip', () => {
  const zip = (...paths: string[]) => new Map(paths.map((p) => [p, new Uint8Array()]))

  // scorm.zip / scorm3.zip: imsmanifest.xml at the root.
  test('a SCORM package is recognised by its manifest', () => {
    expect(classifyZip(zip('imsmanifest.xml', 'shared/launchpage.html', 'index.html'))).toBe(
      'scorm',
    )
  })

  // atque.zip / galeria_2.9.zip / task.zip: eXe legacy site with contentv3.xml.
  test('an eXe project/site is recognised by its content XML', () => {
    expect(classifyZip(zip('contentv3.xml', 'index.html'))).toBe('exe')
    expect(classifyZip(zip('content.xml'))).toBe('exe')
  })

  // contenido-antiguo-...zip: a .elp file nested inside the zip.
  test('a .elp nested inside a zip is routed to the eXe renderer', () => {
    expect(classifyZip(zip('contenido.elp', 'readme.txt'))).toBe('exe-nested-elp')
  })

  // A SCORM manifest wins even if the package also ships a stray .elp.
  test('a manifest takes priority over a nested .elp', () => {
    expect(classifyZip(zip('imsmanifest.xml', 'stray.elp'))).toBe('scorm')
  })

  test('a plain zip is left for the download path', () => {
    expect(classifyZip(zip('notes.txt', 'photo.jpg'))).toBe('other')
  })
})
