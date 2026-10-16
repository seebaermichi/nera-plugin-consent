import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    BUILTIN_CATEGORIES,
    BUILTIN_TEXTS,
    TEXT_KEYS,
    builtinCategory,
    localize,
    resolveTexts,
} from '../src/texts.js'
import { buildAppConsent } from '../src/app-consent.js'
import { normalizeConfig } from '../src/config.js'

let warnSpy

beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('built-in texts', () => {
    it('de and en define exactly the same, non-empty keys', () => {
        expect(Object.keys(BUILTIN_TEXTS.de).sort()).toEqual([...TEXT_KEYS].sort())
        for (const lang of ['de', 'en']) {
            for (const key of TEXT_KEYS) {
                expect(BUILTIN_TEXTS[lang][key].trim(), `${lang}.${key}`).not.toBe('')
            }
        }
    })

    it('the placeholder text names the service and the provider', () => {
        for (const lang of ['de', 'en']) {
            expect(BUILTIN_TEXTS[lang].placeholder_text).toContain('{service}')
            expect(BUILTIN_TEXTS[lang].placeholder_text).toContain('{provider}')
        }
    })

    it('the load button names the service, so two embeds never share a label', () => {
        for (const lang of ['de', 'en']) {
            expect(BUILTIN_TEXTS[lang].placeholder_load).toContain('{service}')
        }
    })

    it('de and en know the same built-in categories', () => {
        expect(Object.keys(BUILTIN_CATEGORIES.de)).toEqual(Object.keys(BUILTIN_CATEGORIES.en))
        expect(builtinCategory('media', 'de').label).toBe('Externe Medien')
        expect(builtinCategory('media', 'fr').label).toBe('External media')
        expect(builtinCategory('custom', 'en')).toBe(null)
    })

    it('never claims compliance', () => {
        const all = JSON.stringify([BUILTIN_TEXTS, BUILTIN_CATEGORIES])
        expect(all).not.toMatch(/konform|compliant|GDPR|DSGVO/i)
    })
})

describe('resolveTexts', () => {
    it('resolves de and en from the built-ins', () => {
        expect(resolveTexts('de').reject_all).toBe('Alle ablehnen')
        expect(resolveTexts('en').reject_all).toBe('Reject all')
        expect(Object.keys(resolveTexts('en'))).toEqual(TEXT_KEYS)
    })

    it('falls back to en for a language without built-in texts', () => {
        expect(resolveTexts('fr')).toEqual(BUILTIN_TEXTS.en)
    })

    it('config texts win over app.translations, which win over the built-ins', () => {
        const texts = resolveTexts('de', {
            texts: { de: { accept_all: 'Ja, gern' } },
            translations: {
                de: { 'consent.accept_all': 'Alles erlauben', 'consent.settings': 'Optionen' },
            },
        })
        expect(texts.accept_all).toBe('Ja, gern')
        expect(texts.settings).toBe('Optionen')
        expect(texts.reject_all).toBe('Alle ablehnen')
    })

    it('a language only configured by the site gets its overrides, else en', () => {
        const texts = resolveTexts('fr', {
            translations: { fr: { 'consent.banner_title': 'Cookies' } },
        })
        expect(texts.banner_title).toBe('Cookies')
        expect(texts.accept_all).toBe('Accept all')
    })

    it('ignores a blank or non-string translation, so Reject all cannot be blanked out', () => {
        const texts = resolveTexts('de', {
            translations: { de: { 'consent.reject_all': ' ', 'consent.accept_all': 42 } },
        })
        expect(texts.reject_all).toBe('Alle ablehnen')
        expect(texts.accept_all).toBe('Alle akzeptieren')
        expect(warnSpy).toHaveBeenCalledTimes(2)
    })

    it('ignores translations that are not a mapping', () => {
        expect(resolveTexts('de', { translations: { de: 'x' } })).toEqual(BUILTIN_TEXTS.de)
    })
})

describe('localize', () => {
    it('returns a string as it is', () => {
        expect(localize('Videos', 'de')).toBe('Videos')
    })

    it('picks the language, then en, then the first value', () => {
        expect(localize({ de: 'Zweck', en: 'Purpose' }, 'de')).toBe('Zweck')
        expect(localize({ de: 'Zweck', en: 'Purpose' }, 'fr')).toBe('Purpose')
        expect(localize({ es: 'Propósito', de: 'Zweck' }, 'fr')).toBe('Propósito')
    })

    it('returns null for an absent value', () => {
        expect(localize(undefined, 'en')).toBe(null)
        expect(localize(null, 'en')).toBe(null)
    })
})

describe('texts in app.consent', () => {
    it('every locale carries the resolved texts of its language', () => {
        const consent = buildAppConsent(
            normalizeConfig({ privacy_url: '/p.html', texts: { fr: { accept_all: 'Tout accepter' } } }),
            {
                app: { lang: 'de', translations: { en: { 'consent.settings': 'Options' } } },
                pagesData: [],
            }
        )
        expect(consent.locales.de.texts.reject_all).toBe('Alle ablehnen')
        expect(consent.locales.en.texts.settings).toBe('Options')
        expect(consent.locales.fr.texts.accept_all).toBe('Tout accepter')
        expect(consent.locales.fr.texts.reject_all).toBe('Reject all')
    })
})
