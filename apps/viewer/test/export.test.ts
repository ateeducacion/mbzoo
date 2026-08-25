import { describe, expect, test } from 'bun:test'
import { strFromU8, strToU8, unzipSync } from 'fflate'
import { buildActivityZip, exportFileName } from '../src/lib/export.ts'

const quiz = { id: 412, moduleName: 'quiz', title: 'Cuestionario tema 1' }

describe('exportFileName', () => {
  test('names the file after module, id and a slug of the title', () => {
    expect(exportFileName(quiz, 'xml')).toBe('quiz-412-cuestionario-tema-1.xml')
  })

  test('uses the extension matching the export kind', () => {
    expect(exportFileName(quiz, 'html')).toBe('quiz-412-cuestionario-tema-1.html')
    expect(exportFileName(quiz, 'zip')).toBe('quiz-412-cuestionario-tema-1.zip')
  })

  test('strips accents and collapses punctuation into single hyphens', () => {
    const activity = { id: 7, moduleName: 'resource', title: 'Apuntes: cadenas tróficas (v2)' }
    expect(exportFileName(activity, 'xml')).toBe('resource-7-apuntes-cadenas-troficas-v2.xml')
  })

  test('falls back to module and id when the title has no usable characters', () => {
    expect(exportFileName({ id: 9, moduleName: 'label', title: '¿¡...!?' }, 'xml')).toBe(
      'label-9.xml',
    )
    expect(exportFileName({ id: 9, moduleName: 'label', title: '' }, 'xml')).toBe('label-9.xml')
  })

  test('never emits path separators or traversal segments', () => {
    const hostile = { id: 1, moduleName: 'page', title: '../../etc/passwd' }
    const name = exportFileName(hostile, 'xml')
    expect(name).not.toContain('/')
    expect(name).not.toContain('\\')
    expect(name).not.toContain('..')
    expect(name).toBe('page-1-etc-passwd.xml')
  })

  test('caps absurdly long titles', () => {
    const name = exportFileName({ id: 2, moduleName: 'page', title: 'a'.repeat(500) }, 'xml')
    expect(name.length).toBeLessThanOrEqual(100)
    expect(name.endsWith('.xml')).toBe(true)
  })
})

describe('buildActivityZip', () => {
  test('round-trips entries through a real ZIP reader', () => {
    const zip = buildActivityZip([
      { name: 'guia.pdf', data: strToU8('pdf bytes') },
      { name: 'notas.txt', data: strToU8('hola') },
    ])

    const entries = unzipSync(zip)
    expect(Object.keys(entries).sort()).toEqual(['guia.pdf', 'notas.txt'])
    expect(strFromU8(entries['notas.txt'] as Uint8Array)).toBe('hola')
  })

  test('disambiguates colliding file names instead of dropping entries', () => {
    const zip = buildActivityZip([
      { name: 'guia.pdf', data: strToU8('first') },
      { name: 'guia.pdf', data: strToU8('second') },
      { name: 'guia.pdf', data: strToU8('third') },
    ])

    const entries = unzipSync(zip)
    expect(Object.keys(entries).sort()).toEqual(['guia-2.pdf', 'guia-3.pdf', 'guia.pdf'])
    expect(strFromU8(entries['guia.pdf'] as Uint8Array)).toBe('first')
    expect(strFromU8(entries['guia-2.pdf'] as Uint8Array)).toBe('second')
  })

  test('keeps entry names flat so a ZIP cannot write outside its folder', () => {
    const zip = buildActivityZip([{ name: '../../evil.sh', data: strToU8('x') }])
    expect(Object.keys(unzipSync(zip))).toEqual(['evil.sh'])
  })

  test('produces a readable archive for an empty entry list', () => {
    expect(Object.keys(unzipSync(buildActivityZip([])))).toEqual([])
  })
})
