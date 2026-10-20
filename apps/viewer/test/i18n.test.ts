import { afterEach, describe, expect, test } from 'bun:test'
import { EVIDENCE_TEXT, LIMITATIONS, RULES } from '@mbzoo/core'
import { evidenceText } from '../src/doctor-panel.ts'
import { detectLang, labelled, STRINGS } from '../src/lib/i18n.ts'

const originalNavigator = globalThis.navigator

function setLanguage(language: string | undefined): void {
  if (language === undefined) {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
    })
    return
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: { language },
    configurable: true,
  })
}

describe('detectLang', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
  })

  test('selects French for fr prefixes', () => {
    setLanguage('fr')
    expect(detectLang()).toBe('fr')
    setLanguage('fr-FR')
    expect(detectLang()).toBe('fr')
    setLanguage('fr-CA')
    expect(detectLang()).toBe('fr')
  })

  test('doctor rules have a title, a body and a consequence in every language', () => {
    for (const id of Object.keys(RULES)) {
      for (const part of ['title', 'body', 'consequence'] as const) {
        const key = `doctor.rule.${id}.${part}` as keyof typeof STRINGS.en
        expect(STRINGS.en[key]).toBeTruthy()
        expect(STRINGS.es[key]).toBeTruthy()
        expect(STRINGS.fr[key]).toBeTruthy()
      }
    }
  })

  test('doctor limitations have a translation for every core sentence', () => {
    for (const line of LIMITATIONS) {
      const match = Object.entries(STRINGS.en).find(([, value]) => value === line)
      expect(match?.[0].startsWith('doctor.limit.')).toBe(true)
      const key = match?.[0] as keyof typeof STRINGS.en
      expect(STRINGS.es[key]).toBeTruthy()
      expect(STRINGS.fr[key]).toBeTruthy()
      expect(STRINGS.es[key]).not.toBe(line)
      expect(STRINGS.fr[key]).not.toBe(line)
    }
  })

  test('doctor evidence has a translation for every core evidence code (#41)', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [code, english] of Object.entries(EVIDENCE_TEXT)) {
      const key = `doctor.evidence.${code}` as keyof typeof STRINGS.en
      expect(STRINGS.en[key]).toBe(english)
      for (const language of ['es', 'fr'] as const) {
        expect(STRINGS[language][key]).toBeTruthy()
        expect(STRINGS[language][key]).not.toBe(english)
        expect(placeholders(STRINGS[language][key])).toEqual(placeholders(english))
      }
    }
    expect(STRINGS.fr['doctor.evidence.plugins.not-core-module']).toBe(
      'le module {module} n\u2019est pas dans la liste des modules du cœur connus de MBZoo',
    )
  })

  test('evidence text is translated by code and falls back to the English detail (#41)', () => {
    expect(
      evidenceText({
        code: 'plugins.not-core-module',
        params: { module: '{module}' },
        detail: 'ignored',
      }),
    ).toBe("{module} is not in MBZoo's core module list")
    expect(evidenceText({ detail: 'activities/forum_1/' })).toBe('activities/forum_1/')
    expect(labelled('Evidence', 'x')).toBe('Evidence: x')
  })

  test('French puts a non-breaking space before every colon (#41)', () => {
    expect(STRINGS.fr.labelled).toBe('{label}\u00a0: {value}')
    expect(STRINGS.en.labelled).toBe('{label}: {value}')
    for (const [key, value] of Object.entries(STRINGS.fr)) {
      // restore_dbops::load_… names a PHP method, not French prose.
      const prose = value.replace(/\w+::\w+/g, '').replace(/https?:/g, '')
      for (const match of prose.matchAll(/(.):/g)) {
        expect(`${key}: ${JSON.stringify(match[1])}`).toBe(`${key}: "\u00a0"`)
      }
    }
  })

  test('the shortcut hint pairs each key with the arrow it matches (#39)', () => {
    // main.ts STEP_KEYS: K and ← go back, J and → go forward.
    for (const language of ['en', 'es', 'fr'] as const) {
      const hint = STRINGS[language]['nav.shortcuts']
      expect(hint).toMatch(/K[^J→]*←/)
      expect(hint).toMatch(/J[^K←]*→/)
      expect(hint.indexOf('K')).toBeLessThan(hint.indexOf('J'))
    }
  })

  test('Spanish and French dictionaries cover every English key', () => {
    const english = Object.keys(STRINGS.en).sort()
    expect(Object.keys(STRINGS.es).sort()).toEqual(english)
    expect(Object.keys(STRINGS.fr).sort()).toEqual(english)
  })

  test('doctor translations preserve every interpolation placeholder', () => {
    for (const [key, english] of Object.entries(STRINGS.en)) {
      if (!key.startsWith('doctor.')) continue
      const placeholders = (text: string) => text.match(/\{[^{}]+\}/g)?.sort() ?? []
      for (const language of ['es', 'fr'] as const) {
        expect(placeholders(STRINGS[language][key as keyof typeof STRINGS.en])).toEqual(
          placeholders(english),
        )
      }
    }
  })

  test('French guillemets around placeholders use regular spaces', () => {
    expect(STRINGS.fr.pdfError).toBe(
      'Impossible d\u2019afficher « {name} » en ligne — utiliser Télécharger.',
    )
    expect(STRINGS.fr.noRenderer).toBe('Aucun moteur de rendu dédié pour « {mod} ».')
    expect(STRINGS.fr['grading.notShown']).toContain('« {method} »')
    expect(STRINGS.fr['legacy.notice']).toContain('« {mod} »')
    expect(STRINGS.fr['quiz.randomEmpty']).toContain('« {cat} »')
    expect(STRINGS.fr['quiz.drawnFrom']).toBe('tirée de « {cat} »')
    expect(STRINGS.fr['drop.title']).toBe('Déposer votre fichier')
    expect(STRINGS.fr['drop.file']).toBe('ici')
  })

  test('French Info tab enums match the reviewed wording', () => {
    expect(STRINGS.fr['info.groupMode.separate']).toBe('Séparés')
    expect(STRINGS.fr['info.groupMode.visible']).toBe('Visibles')
    expect(STRINGS.fr['info.groupMode.none']).toBe('Aucun')
    expect(STRINGS.fr['info.completionMode.manual']).toBe('Manuel')
    expect(STRINGS.fr['info.completionMode.automatic']).toBe('Automatique')
    expect(STRINGS.fr.download).toBe('Télécharger')
  })

  test('selects Spanish for es prefixes and English otherwise', () => {
    setLanguage('es')
    expect(detectLang()).toBe('es')
    setLanguage('es-ES')
    expect(detectLang()).toBe('es')
    setLanguage('en-GB')
    expect(detectLang()).toBe('en')
    setLanguage(undefined)
    expect(detectLang()).toBe('en')
  })
})
