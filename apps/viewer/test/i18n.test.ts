import { afterEach, describe, expect, test } from 'bun:test'
import { LIMITATIONS, RULES } from '@mbzoo/core'
import { detectLang, STRINGS } from '../src/lib/i18n.ts'

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
