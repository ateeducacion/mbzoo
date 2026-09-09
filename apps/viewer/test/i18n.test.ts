import { afterEach, describe, expect, test } from 'bun:test'
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

  test('Spanish and French dictionaries cover every English key', () => {
    const english = Object.keys(STRINGS.en).sort()
    expect(Object.keys(STRINGS.es).sort()).toEqual(english)
    expect(Object.keys(STRINGS.fr).sort()).toEqual(english)
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
