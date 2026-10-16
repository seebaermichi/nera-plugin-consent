import path from 'path'
import pug from 'pug'
import { load } from 'cheerio'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAppConsent } from '../src/app-consent.js'
import { normalizeConfig } from '../src/config.js'
import { renderPlaceholder } from '../src/placeholder.js'

// The published views (ROADMAP slice 4), rendered with pug the way core does:
// `app` and `meta` as locals, with the html doctype (terse boolean attributes). The pug path is
// cwd-relative like the fleet's other template tests, so this runs from the
// package root.

const CONFIG = {
    revision: 3,
    privacy_url: { en: '/privacy.html', de: '/de/datenschutz.html' },
    categories: [
        {
            id: 'analytics',
            services: [
                {
                    name: 'Matomo',
                    provider: 'Example & "Sons" <GmbH>',
                    purpose: 'Counts visits.',
                    privacy_url: 'https://stats.example.com/privacy',
                    cookies: [{ name: '_pk_id', duration: '13 months', purpose: 'Recognises visitors.' }],
                    scripts: [
                        { src: '/js/stats.js', async: true },
                        { inline: 'var a = "</script><!-- & </SCRIPT>"; if (1 < 2 && 3 > 2) {}' },
                        { src: 'https://stats.example.com/mod.js', module: true, defer: true },
                    ],
                },
            ],
        },
        {
            id: 'media',
            services: [
                {
                    name: 'YouTube',
                    provider: 'Google Ireland Limited, Dublin',
                    purpose: 'Shows embedded videos.',
                    privacy_url: 'https://policies.google.com/privacy',
                    hosts: ['youtube.com'],
                },
                {
                    name: 'Vimeo\'s <player>',
                    provider: 'Vimeo & Co',
                    purpose: 'Shows videos.',
                    hosts: ['vimeo.com'],
                },
            ],
        },
    ],
}

let warn

beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => warn.mockRestore())

function makeApp(config = CONFIG, { basePath = '', lang = 'en' } = {}) {
    const app = { lang, basePath }
    const pagesData = [{ meta: { lang: 'de' } }]
    return { ...app, consent: buildAppConsent(normalizeConfig(config), { app, pagesData }) }
}

const VIEWS = path.resolve('views')

/** Render `body` (pug source) with the views includable as `/x`. */
function render(body, { app = makeApp(), meta = {} } = {}) {
    return pug.render(body, {
        doctype: 'html',
        filename: path.join(VIEWS, '__test.pug'),
        basedir: VIEWS,
        app,
        meta,
    })
}

const view = (name, locals) => load(render(`include /${name}`, locals), null, false)

describe('banner.pug', () => {
    it('renders Accept all, Reject all and Settings, in that order, with one class', () => {
        const $ = view('banner')
        const buttons = $('[data-consent-banner] button')
        expect(buttons.map((_, el) => $(el).text()).get()).toEqual(['Accept all', 'Reject all', 'Settings'])
        expect(buttons.map((_, el) => $(el).attr('class')).get()).toEqual(Array(3).fill('nera-consent__button'))
        expect(buttons.map((_, el) => $(el).attr('type')).get()).toEqual(Array(3).fill('button'))
        expect(buttons.eq(0).is('[data-consent-accept-all]')).toBe(true)
        expect(buttons.eq(1).is('[data-consent-reject-all]')).toBe(true)
        expect(buttons.eq(2).is('[data-consent-open]')).toBe(true)
    })

    it('keeps Reject all on the first layer whatever the texts say', () => {
        const $ = view('banner', {
            app: makeApp({ ...CONFIG, texts: { en: { reject_all: '   ', accept_all: 'Yes please' } } }),
        })
        expect($('[data-consent-reject-all]').text()).toBe('Reject all')
        expect($('[data-consent-accept-all]').text()).toBe('Yes please')
    })

    it('carries the revision and the category ids for the runtime, and starts hidden', () => {
        const banner = view('banner')('[data-consent-banner]')
        expect(banner.attr('data-consent-revision')).toBe('3')
        expect(banner.attr('data-consent-categories')).toBe('analytics media')
        expect(banner.attr('hidden')).toBeDefined()
    })

    it('has an accessible name and a reachable privacy link with base_path', () => {
        const $ = view('banner', { app: makeApp(CONFIG, { basePath: '/sub' }) })
        const id = $('[data-consent-banner]').attr('aria-labelledby')
        expect($(`#${id}`).text()).toBe('Cookies and external content')
        expect($('[data-consent-banner] a').attr('href')).toBe('/sub/privacy.html')
        expect($('[data-consent-banner] a').text()).toBe('Privacy policy')
    })

    it('leaves the privacy link out when privacy_url is not set', () => {
        const config = { ...CONFIG, privacy_url: undefined }
        expect(view('banner', { app: makeApp(config) })('[data-consent-banner] a')).toHaveLength(0)
    })

    it('uses the page language, else the site language, else en', () => {
        const de = view('banner', { meta: { lang: 'de' } })
        expect(de('[data-consent-reject-all]').text()).toBe('Alle ablehnen')
        expect(de('[data-consent-banner] a').attr('href')).toBe('/de/datenschutz.html')
        const fr = view('banner', { meta: { lang: 'fr' } })
        expect(fr('[data-consent-reject-all]').text()).toBe('Reject all')
    })

    it('renders nothing in notice or none mode', () => {
        expect(render('include /banner', { app: makeApp({}) })).toBe('')
        expect(render('include /banner', { app: makeApp({ notice: false }) })).toBe('')
    })
})

describe('settings.pug', () => {
    it('is a native dialog named by its title', () => {
        const $ = view('settings')
        const dialog = $('dialog[data-consent-dialog]')
        expect(dialog).toHaveLength(1)
        expect(dialog.attr('open')).toBeUndefined()
        expect($(`#${dialog.attr('aria-labelledby')}`).text()).toBe('Privacy settings')
    })

    it('ticks nothing but the disabled necessary category', () => {
        const $ = view('settings')
        const boxes = $('input[type="checkbox"]')
        expect(boxes).toHaveLength(3)
        expect(boxes.filter('[checked]').get()).toEqual(boxes.filter('[disabled]').get())
        expect(boxes.filter('[checked]').is('[data-consent-category]')).toBe(false)
        expect($('[data-consent-category]').map((_, el) => $(el).attr('data-consent-category')).get())
            .toEqual(['analytics', 'media'])
        expect(boxes.filter('[disabled]').closest('label').text()).toBe('Strictly necessary (Always active)')
    })

    it('labels every checkbox', () => {
        const $ = view('settings')
        $('input[type="checkbox"]').each((_, el) => {
            expect($(el).closest('label').text().trim()).not.toBe('')
        })
        expect($('[data-consent-category="media"]').closest('label').text()).toBe('External media')
    })

    it('closes natively, and offers Accept all, Reject all and Save selection', () => {
        const $ = view('settings')
        const close = $('form[method="dialog"] button[type="submit"]')
        expect(close).toHaveLength(1)
        expect(close.attr('aria-label')).toBe('Close')
        expect($('.nera-consent-dialog__actions button').map((_, el) => $(el).text()).get())
            .toEqual(['Accept all', 'Reject all', 'Save selection'])
        expect($('[data-consent-accept-all][data-consent-reject-all], [data-consent-save][type="submit"]')).toHaveLength(0)
    })

    it('names every service with provider, purpose, privacy link and cookies, escaped', () => {
        const html = render('include /settings')
        const $ = load(html, null, false)
        const matomo = $('.nera-consent-dialog__service').first()
        expect(matomo.find('h3').text()).toBe('Matomo')
        expect(matomo.find('dd').map((_, el) => $(el).text()).get()).toEqual(['Example & "Sons" <GmbH>', 'Counts visits.'])
        expect(matomo.find('a').attr('href')).toBe('https://stats.example.com/privacy')
        expect(matomo.find('td').map((_, el) => $(el).text()).get()).toEqual(['_pk_id', '13 months', 'Recognises visitors.'])
        expect(html).not.toContain('<GmbH>')
        expect($('.nera-consent-dialog__service').last().find('a, table')).toHaveLength(0)
    })

    it('renders nothing in notice mode', () => {
        expect(render('include /settings', { app: makeApp({}) })).toBe('')
    })
})

describe('notice.pug', () => {
    it('renders the info notice, hidden, with Got it and the privacy link', () => {
        const $ = view('notice', { app: makeApp({ revision: 2, privacy_url: '/privacy.html' }) })
        const notice = $('[data-consent-notice]')
        expect(notice.hasClass('nera-consent--notice')).toBe(true)
        expect(notice.attr('data-consent-revision')).toBe('2')
        expect(notice.attr('hidden')).toBeDefined()
        expect($(`#${notice.attr('aria-labelledby')}`).text()).toContain('only technically necessary cookies')
        expect($('[data-consent-dismiss]').text()).toBe('Got it')
        expect($('[data-consent-dismiss]').attr('type')).toBe('button')
        expect(notice.find('a').attr('href')).toBe('/privacy.html')
    })

    it('renders nothing in banner or none mode', () => {
        expect(render('include /notice')).toBe('')
        expect(render('include /notice', { app: makeApp({ notice: false }) })).toBe('')
    })
})

describe('head.pug', () => {
    it('emits every configured script inert, in order, with its category', () => {
        const $ = view('head', { app: makeApp(CONFIG, { basePath: '/sub' }) })
        const scripts = $('script')
        expect(scripts).toHaveLength(3)
        scripts.each((_, el) => {
            expect($(el).attr('type')).toBe('text/plain')
            expect($(el).attr('data-consent')).toBe('analytics')
            expect($(el).attr('src')).toBeUndefined()
        })
        expect(scripts.eq(0).attr('data-src')).toBe('/sub/js/stats.js')
        expect(scripts.eq(0).attr('async')).toBeDefined()
        expect(scripts.eq(1).attr('data-src')).toBeUndefined()
        expect(scripts.eq(2).attr('data-type')).toBe('module')
        expect(scripts.eq(2).attr('defer')).toBeDefined()
        expect(scripts.eq(2).attr('async')).toBeUndefined()
    })

    it('writes inline code raw, with only </script and <!-- escaped', () => {
        const html = render('include /head')
        expect(html).toContain(
            '<script type="text/plain" data-consent="analytics">var a = "<\\/script><\\!-- & <\\/SCRIPT>"; if (1 < 2 && 3 > 2) {}</script>'
        )
        expect(html).toContain('<script type="text/plain" data-consent="analytics" data-src="/js/stats.js" async></script>')
    })

    it('renders nothing without scripts', () => {
        expect(render('include /head', { app: makeApp({}) })).toBe('')
    })
})

describe('embed.pug (D2)', () => {
    const mixin = (embed, locals) =>
        render(`include /embed\n+consent-embed(${JSON.stringify(embed)})`, locals)

    const expected = ({ category, service, src, attributes = {} }, { app = makeApp(), lang = 'en' } = {}) => {
        const locale = app.consent.locales[lang]
        return renderPlaceholder({
            category,
            src,
            service: locale.categories.find((c) => c.id === category).services.find((s) => s.name === service),
            texts: locale.texts,
            attributes,
            basePath: app.basePath,
        })
    }

    it.each([
        ['a plain embed', { category: 'media', service: 'YouTube', src: 'https://www.youtube.com/embed/a' }],
        [
            'attributes in order, bare and escaped',
            {
                category: 'media',
                service: 'YouTube',
                src: 'https://www.youtube.com/embed/a?x=1&y=2',
                attributes: { width: '560', title: 'Tom\'s <"video"> & more', allowfullscreen: '', SRC: '/x', srcdoc: '<p>x</p>', hidden: '' },
            },
        ],
        ['a service without privacy_url and with markup in its names', { category: 'media', service: 'Vimeo\'s <player>', src: 'https://vimeo.com/1' }],
        ['a root-absolute src', { category: 'media', service: 'YouTube', src: '/local/embed' }],
    ])('renders %s exactly like renderPlaceholder', (_, embed) => {
        expect(mixin(embed)).toBe(expected(embed))
        const app = makeApp(CONFIG, { basePath: '/sub' })
        expect(mixin(embed, { app })).toBe(expected(embed, { app }))
        expect(mixin(embed, { meta: { lang: 'de' } })).toBe(expected(embed, { lang: 'de' }))
    })

    it('fills {service} and {provider} into the load button, escaped and without markup', () => {
        const app = makeApp()
        app.consent.locales.en.texts.placeholder_load = 'Load {service} <now> — connects to {provider}'
        const embed = { category: 'media', service: 'Vimeo\'s <player>', src: 'https://vimeo.com/1' }
        const html = mixin(embed, { app })
        expect(html).toBe(expected(embed, { app }))
        expect(html).toContain(
            '<button class="nera-consent-embed__load" type="button" data-consent-load>' +
            'Load Vimeo&#39;s &lt;player&gt; &lt;now&gt; — connects to Vimeo &amp; Co</button>'
        )
    })

    it('drops srcdoc, like the rewrite', () => {
        const embed = { category: 'media', service: 'YouTube', src: 'https://youtube.com/e', attributes: { srcdoc: '<p>x</p>', title: 't' } }
        expect(mixin(embed)).not.toMatch(/srcdoc/i)
        expect(mixin(embed)).toBe(expected(embed))
    })

    it('renders true as a bare attribute and drops false and null', () => {
        const embed = { category: 'media', service: 'YouTube', src: 'https://youtube.com/e', attributes: { width: 560, allowfullscreen: true, loading: false, name: null } }
        expect(mixin(embed)).toBe(expected({ ...embed, attributes: { width: '560', allowfullscreen: '' } }))
    })

    it('fails the build for a service config/consent.yaml does not have', () => {
        expect(() => mixin({ category: 'media', service: 'Dailymotion', src: 'https://d.example/1' }))
            .toThrow(/service "Dailymotion" in category "media"/)
    })

    it('fails the build for Pug attributes, which Pug escapes before the mixin sees them', () => {
        expect(() => render('include /embed\n+consent-embed({ category: "media", service: "YouTube", src: "https://youtube.com/e" })(title="a&b")'))
            .toThrow(/`attributes` option/)
    })
})
