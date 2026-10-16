import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaults, loadConfig, normalizeConfig } from '../src/config.js'
import { buildAppConsent, withBasePath } from '../src/app-consent.js'
import { getAppData } from '../index.js'

const youtube = {
    name: 'YouTube',
    provider: 'Google Ireland Limited, Dublin',
    purpose: 'Shows embedded videos.',
    privacy_url: 'https://policies.google.com/privacy',
    hosts: ['youtube.com', 'YouTube-NoCookie.com'],
}

const matomo = {
    name: 'Matomo',
    provider: 'Example GmbH, Berlin',
    purpose: { en: 'Counts visits.', de: 'Zählt Besuche.' },
    cookies: [{ name: '_pk_id', duration: '13 months' }],
    scripts: [
        { src: '/js/matomo.js', async: true },
        { inline: 'var _paq = [];' },
    ],
}

let warnSpy
const warnings = () => warnSpy.mock.calls.map(([message]) => message)

beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('normalizeConfig', () => {
    it('returns the defaults for an empty or missing config, without warnings', () => {
        expect(normalizeConfig({})).toEqual(defaults())
        expect(normalizeConfig(undefined)).toEqual(defaults())
        expect(defaults()).toEqual({
            revision: 1,
            privacy_url: null,
            notice: true,
            categories: [],
            texts: {},
        })
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('falls back per key on bad values and warns', () => {
        const config = normalizeConfig({
            revision: 0,
            privacy_url: '  ',
            notice: 'no',
            texts: 'x',
        })
        expect(config).toEqual(defaults())
        expect(warnings()).toHaveLength(4)
        expect(warnings()[0]).toMatch(/^⚠️ plugin-consent: config\/consent.yaml: invalid revision 0/)
    })

    it('accepts a valid revision, privacy_url map and notice flag', () => {
        const config = normalizeConfig({
            revision: 3,
            privacy_url: { de: '/datenschutz.html', en: '/en/privacy.html' },
            notice: false,
        })
        expect(config.revision).toBe(3)
        expect(config.privacy_url).toEqual({ de: '/datenschutz.html', en: '/en/privacy.html' })
        expect(config.notice).toBe(false)
    })

    it('reads categories with services, cookies, hosts and scripts', () => {
        const config = normalizeConfig({
            categories: [{ id: 'media', services: [youtube] }, { id: 'analytics', services: [matomo] }],
        })
        expect(warnSpy).not.toHaveBeenCalled()
        expect(config.categories.map((c) => c.id)).toEqual(['media', 'analytics'])
        expect(config.categories[0].services[0].hosts).toEqual(['youtube.com', 'youtube-nocookie.com'])
        expect(config.categories[1].services[0].scripts).toEqual([
            { src: '/js/matomo.js', async: true, defer: false, module: false },
            { inline: 'var _paq = [];', async: false, defer: false, module: false },
        ])
        expect(config.categories[1].services[0].cookies).toEqual([
            { name: '_pk_id', duration: '13 months', purpose: undefined },
        ])
    })

    it('never accepts "necessary" as a category: it is implicit and always on', () => {
        const config = normalizeConfig({
            categories: [{ id: 'necessary', services: [youtube] }],
        })
        expect(config.categories).toEqual([])
        expect(warnings().join('\n')).toMatch(/dropping category "necessary"/)
    })

    it.each(['default', 'enabled', 'checked', 'preselected'])(
        'ignores the pre-selection key %s on a category and warns',
        (key) => {
            const config = normalizeConfig({
                categories: [{ id: 'media', [key]: true, services: [youtube] }],
            })
            expect(config.categories[0]).not.toHaveProperty(key)
            expect(Object.keys(config.categories[0])).toEqual(['id', 'label', 'description', 'services'])
            expect(warnings().join('\n')).toMatch(new RegExp(`unknown key categories\\[0\\]\\."${key}"`))
        }
    )

    it.each([
        ['hide_reject_all', true],
        ['reject_all', false],
        ['buttons', ['accept_all', 'settings']],
        ['storage_key', 'x'],
        ['preselect', ['media']],
    ])('ignores the first-layer/floor key %s and changes nothing', (key, value) => {
        const config = normalizeConfig({ [key]: value })
        expect(config).toEqual(defaults())
        expect(warnings()).toEqual([
            `⚠️ plugin-consent: config/consent.yaml: ignoring unknown key "${key}"`,
        ])
    })

    it('drops invalid categories: bad id, duplicate id, no services', () => {
        const config = normalizeConfig({
            categories: [
                { id: 'Media', services: [youtube] },
                { id: 'media', services: [youtube] },
                { id: 'media', services: [youtube] },
                { id: 'empty', services: [] },
                'analytics',
            ],
        })
        expect(config.categories.map((c) => c.id)).toEqual(['media'])
        expect(warnings()).toHaveLength(4)
    })

    it('drops services missing name, provider or purpose', () => {
        const config = normalizeConfig({
            categories: [
                {
                    id: 'media',
                    services: [{ name: 'X', provider: 'Y' }, { ...youtube, purpose: { de: '' } }, youtube],
                },
            ],
        })
        expect(config.categories[0].services.map((s) => s.name)).toEqual(['YouTube'])
        expect(warnings().join('\n')).toMatch(/dropping categories\[0\]\.services\[0\], missing or invalid purpose/)
    })

    it('drops bad hosts and scripts, defaults bad script flags to false', () => {
        const config = normalizeConfig({
            categories: [
                {
                    id: 'media',
                    services: [
                        {
                            ...youtube,
                            hosts: ['https://youtube.com', 'youtube.com/embed', 'vimeo.com'],
                            scripts: [{ src: '/a.js', inline: 'x' }, {}, { src: '/b.js', defer: 'yes' }],
                        },
                    ],
                },
            ],
        })
        const [service] = config.categories[0].services
        expect(service.hosts).toEqual(['vimeo.com'])
        expect(service.scripts).toEqual([{ src: '/b.js', async: false, defer: false, module: false }])
        expect(warnings()).toHaveLength(5)
    })

    it('ignores unknown and empty text overrides, so no label can be blanked out', () => {
        const config = normalizeConfig({
            texts: { de: { reject_all: '   ', accept_all: 'Ja', hide: 'x' }, fr: 'x' },
        })
        expect(config.texts).toEqual({ de: { accept_all: 'Ja' } })
        expect(warnings()).toHaveLength(3)
    })

    it('ignores notice: false once a category exists', () => {
        const config = normalizeConfig({
            notice: false,
            categories: [{ id: 'media', services: [youtube] }],
        })
        expect(config.notice).toBe(true)
        expect(warnings().join('\n')).toMatch(/ignoring notice: false/)
    })

    it('uses the defaults for a non-mapping top level', () => {
        expect(normalizeConfig(['x'])).toEqual(defaults())
        expect(warnSpy).toHaveBeenCalledTimes(1)
    })
})

describe('buildAppConsent', () => {
    const build = (raw, app = { lang: 'en' }, pagesData = []) =>
        buildAppConsent(normalizeConfig(raw), { app, pagesData })

    it('is banner mode with categories, notice without, none with notice: false', () => {
        expect(build({ categories: [{ id: 'media', services: [youtube] }] }).mode).toBe('banner')
        expect(build({}).mode).toBe('notice')
        expect(build({ notice: false }).mode).toBe('none')
    })

    it('warns about a missing privacy_url unless there is no UI at all', () => {
        build({})
        expect(warnings().join('\n')).toMatch(/privacy_url is not set/)
        warnSpy.mockClear()
        build({ notice: false })
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('carries revision, storage key, scripts and hosts in document order', () => {
        const consent = build({
            revision: 2,
            privacy_url: '/privacy.html',
            categories: [{ id: 'media', services: [youtube] }, { id: 'analytics', services: [matomo] }],
        })
        expect(consent.revision).toBe(2)
        expect(consent.storageKey).toBe('nera-consent')
        expect(consent.scripts).toEqual([
            { category: 'analytics', service: 'Matomo', src: '/js/matomo.js', async: true, defer: false, module: false },
            { category: 'analytics', service: 'Matomo', inline: 'var _paq = [];', async: false, defer: false, module: false },
        ])
        expect(consent.hosts).toEqual([
            { category: 'media', service: 'YouTube', host: 'youtube.com' },
            { category: 'media', service: 'YouTube', host: 'youtube-nocookie.com' },
        ])
    })

    it('collects languages from app.lang, meta.lang and texts, always with en, sorted', () => {
        const consent = build(
            { privacy_url: '/p.html', texts: { fr: { accept_all: 'Tout accepter' } } },
            { lang: 'de' },
            [{ meta: { lang: 'es' } }, { meta: {} }, { meta: { lang: 'de' } }]
        )
        expect(consent.languages).toEqual(['de', 'en', 'es', 'fr'])
        expect(Object.keys(consent.locales)).toEqual(['de', 'en', 'es', 'fr'])
    })

    it('localizes categories and services per language', () => {
        const consent = build(
            {
                privacy_url: { de: '/datenschutz.html', en: '/en/privacy.html' },
                categories: [
                    { id: 'analytics', services: [matomo] },
                    { id: 'video-x', label: { de: 'Videos' }, services: [youtube] },
                ],
            },
            { lang: 'de' }
        )
        const de = consent.locales.de
        expect(de.privacyUrl).toBe('/datenschutz.html')
        expect(de.categories[0]).toMatchObject({ id: 'analytics', label: 'Statistik' })
        expect(de.categories[0].services[0]).toEqual({
            name: 'Matomo',
            provider: 'Example GmbH, Berlin',
            purpose: 'Zählt Besuche.',
            privacyUrl: null,
            cookies: [{ name: '_pk_id', duration: '13 months', purpose: null }],
        })
        expect(de.categories[1]).toMatchObject({ label: 'Videos', description: null })
        expect(consent.locales.en.privacyUrl).toBe('/en/privacy.html')
        expect(consent.locales.en.categories[0].label).toBe('Statistics')
        // a map without the language or en → its first value
        expect(consent.locales.en.categories[1].label).toBe('Videos')
    })

    it('prefixes base_path on root-absolute URLs only, once', () => {
        const consent = build(
            {
                privacy_url: '/privacy.html',
                categories: [
                    {
                        id: 'analytics',
                        services: [{ ...matomo, privacy_url: '/sub/terms.html', scripts: [{ src: '/js/a.js' }, { src: 'https://cdn.example.com/b.js' }, { src: '//cdn.example.com/c.js' }] }],
                    },
                ],
            },
            { lang: 'en', basePath: '/sub' }
        )
        expect(consent.locales.en.privacyUrl).toBe('/sub/privacy.html')
        expect(consent.locales.en.categories[0].services[0].privacyUrl).toBe('/sub/terms.html')
        expect(consent.scripts.map((s) => s.src)).toEqual([
            '/sub/js/a.js',
            'https://cdn.example.com/b.js',
            '//cdn.example.com/c.js',
        ])
    })

    it('withBasePath leaves relative URLs and an empty base path alone', () => {
        expect(withBasePath('privacy.html', '/sub')).toBe('privacy.html')
        expect(withBasePath('/sub', '/sub')).toBe('/sub')
        expect(withBasePath('/privacy.html', '')).toBe('/privacy.html')
        expect(withBasePath(null, '/sub')).toBe(null)
    })
})

describe('loadConfig and getAppData', () => {
    let cwd
    let dir

    beforeEach(() => {
        cwd = process.cwd()
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nera-consent-'))
        process.chdir(dir)
    })

    afterEach(() => {
        process.chdir(cwd)
        fs.rmSync(dir, { recursive: true, force: true })
    })

    const writeConfig = (folder, content) => {
        fs.mkdirSync(path.join(dir, folder), { recursive: true })
        fs.writeFileSync(path.join(dir, folder, 'consent.yaml'), content)
    }

    it('a missing file yields notice mode', () => {
        expect(loadConfig()).toEqual(defaults())
        const app = getAppData({ app: { lang: 'en' }, pagesData: [] })
        expect(app.consent.mode).toBe('notice')
        expect(app.consent.scripts).toEqual([])
    })

    it('reads the site config, honouring app.folders.config', () => {
        writeConfig('settings', 'revision: 4\ncategories:\n    - id: media\n      services:\n          - name: YouTube\n            provider: Google\n            purpose: Videos\n            hosts: [youtube.com]\n')
        const app = getAppData({
            app: { lang: 'en', folders: { config: './settings' } },
            pagesData: [],
        })
        expect(app.consent.mode).toBe('banner')
        expect(app.consent.revision).toBe(4)
        expect(app.consent.hosts).toEqual([{ category: 'media', service: 'YouTube', host: 'youtube.com' }])
    })

    it('the shipped config/consent.yaml is valid and yields notice mode without warnings', () => {
        fs.mkdirSync(path.join(dir, 'config'))
        fs.copyFileSync(path.join(cwd, 'config/consent.yaml'), path.join(dir, 'config/consent.yaml'))
        expect(loadConfig()).toEqual(defaults())
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('getAppData keeps every existing app key and returns a new object', () => {
        writeConfig('config', 'privacy_url: /p.html\n')
        const app = { lang: 'en', title: 'Site', translations: { en: {} }, nested: { a: 1 } }
        const result = getAppData({ app, pagesData: [] })
        expect(result).not.toBe(app)
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
        const { consent, ...rest } = result
        expect(rest).toEqual(app)
        expect(consent.mode).toBe('notice')
        expect(app).not.toHaveProperty('consent')
    })
})
