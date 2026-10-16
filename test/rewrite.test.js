import { load } from 'cheerio'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAppConsent } from '../src/app-consent.js'
import { normalizeConfig } from '../src/config.js'
import { escapeHtml, renderPlaceholder } from '../src/placeholder.js'
import { findLiveGatedIframes, hasIframe, matchHost, rewriteIframes, srcHost } from '../src/rewrite.js'
import { getMetaData } from '../index.js'

const CONFIG = {
    privacy_url: '/privacy.html',
    categories: [
        {
            id: 'media',
            services: [
                {
                    name: 'YouTube',
                    provider: 'Google Ireland Limited, Dublin',
                    purpose: 'Shows embedded videos.',
                    privacy_url: 'https://policies.google.com/privacy',
                    hosts: ['youtube.com', 'youtube-nocookie.com'],
                },
                {
                    name: 'Google Maps',
                    provider: 'Google Ireland Limited, Dublin',
                    purpose: 'Shows maps.',
                    hosts: ['maps.google.com'],
                },
            ],
        },
        {
            id: 'analytics',
            services: [
                {
                    name: 'Google',
                    provider: 'Google <Ireland> & "Co"',
                    purpose: 'Counts.',
                    hosts: ['google.com'],
                },
            ],
        },
    ],
}

let consent
const context = (lang = 'en') => ({
    hosts: consent.hosts,
    locale: consent.locales[lang],
})
const $ = (html) => load(html, null, false)

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    consent = buildAppConsent(normalizeConfig(CONFIG), { app: { lang: 'en' }, pagesData: [{ meta: { lang: 'de' } }] })
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('srcHost', () => {
    it('returns the host a browser would request', () => {
        expect(srcHost('https://www.YouTube.com/embed/x')).toBe('www.youtube.com')
        expect(srcHost('//www.youtube.com/embed/x')).toBe('www.youtube.com')
        expect(srcHost('http://youtube.com.:80/x')).toBe('youtube.com')
        expect(srcHost('  https://youtube.com/x  ')).toBe('youtube.com')
        expect(srcHost('https://user@youtube.com/x')).toBe('youtube.com')
        expect(srcHost('\\\\youtube.com/x')).toBe('youtube.com')
        expect(srcHost('\thttps://you\ntube.com/x')).toBe('youtube.com')
    })

    it('finds the host of a scheme-only URL, whichever scheme the site uses', () => {
        // Relative on a page of the same scheme, absolute on the other one.
        expect(srcHost('https:youtube.com/x')).toBe('youtube.com')
        expect(srcHost('http:youtube.com/x')).toBe('youtube.com')
    })

    it('returns null for URLs that stay on the site or have no host', () => {
        expect(srcHost('/embed/x')).toBeNull()
        expect(srcHost('embed/x')).toBeNull()
        expect(srcHost('data:text/html,hi')).toBeNull()
        expect(srcHost('about:blank')).toBeNull()
        expect(srcHost(undefined)).toBeNull()
        expect(srcHost('https://')).toBeNull()
    })
})

describe('matchHost', () => {
    it('matches the host and its subdomains, never a lookalike', () => {
        expect(matchHost('youtube.com', consent.hosts)?.service).toBe('YouTube')
        expect(matchHost('www.youtube.com', consent.hosts)?.service).toBe('YouTube')
        expect(matchHost('notyoutube.com', consent.hosts)).toBeNull()
        expect(matchHost('youtube.com.evil.example', consent.hosts)).toBeNull()
        expect(matchHost(null, consent.hosts)).toBeNull()
    })

    it('prefers the most specific configured host', () => {
        expect(matchHost('maps.google.com', consent.hosts)).toMatchObject({ category: 'media', service: 'Google Maps' })
        expect(matchHost('www.google.com', consent.hosts)).toMatchObject({ category: 'analytics' })
    })
})

describe('rewriteIframes', () => {
    const IFRAME = '<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/abc?a=1&amp;b=2" title="A video" allowfullscreen></iframe>'

    it('replaces a matched iframe with the placeholder and keeps no live src', () => {
        const out = rewriteIframes(`<p>Intro</p>\n${IFRAME}\n`, context())
        const doc = $(out)
        const iframe = doc('iframe')
        expect(iframe.attr('src')).toBeUndefined()
        expect(iframe.attr('data-consent-src')).toBe('https://www.youtube-nocookie.com/embed/abc?a=1&b=2')
        expect(iframe.attr('data-consent')).toBe('media')
        expect(iframe.is('[hidden]')).toBe(true)
        expect(iframe.attr('title')).toBe('A video')
        expect(iframe.attr('width')).toBe('560')
        expect(iframe.is('[allowfullscreen]')).toBe(true)
        const embed = doc('.nera-consent-embed')
        expect(embed.attr('data-consent')).toBe('media')
        expect(embed.is('[data-consent-embed]')).toBe(true)
        expect(doc('[data-consent-load]').text()).toBe('Load YouTube')
        expect(doc('[data-consent-open]').text()).toBe('Privacy settings')
        expect(doc('.nera-consent-embed__privacy').attr('href')).toBe('https://policies.google.com/privacy')
        expect(doc('.nera-consent-embed__text').html()).toBe(
            'This content is provided by YouTube. Loading it connects to <strong>Google Ireland Limited, Dublin</strong>.'
        )
    })

    it('leaves everything else byte-identical', () => {
        // Markup cheerio would normalise on re-serialisation: entities, an
        // unquoted attribute, a void element without slash, odd spacing,
        // upper-case tags, a comment, and an ungated iframe.
        const before = '<p class=x>a &amp; b &#169; &copy;<br>  <B>c</B></p>\n<!-- note -->\n'
        const between = '\n<IMG SRC="/a.png"  alt=\'q\'>\n<iframe src="https://example.org/x"></iframe>\n'
        const after = '\n<table><td>cell</table>\n'
        const out = rewriteIframes(before + IFRAME + between + IFRAME + after, context())

        const placeholder = rewriteIframes(IFRAME, context())
        expect(out).toBe(before + placeholder + between + placeholder + after)
        expect(out).toContain('<iframe src="https://example.org/x"></iframe>')
    })

    it('returns a page without a matched iframe as the same string', () => {
        const content = '<p>No embeds &amp; no iframes</p>'
        expect(rewriteIframes(content, context())).toBe(content)
        const ungated = '<iframe src="https://example.org/x"></iframe><iframe src="/local.html"></iframe><iframe></iframe>'
        expect(rewriteIframes(ungated, context())).toBe(ungated)
        expect(rewriteIframes(content, { ...context(), hosts: [] })).toBe(content)
    })

    it('gates subdomain, protocol-relative, upper-case and trailing-dot sources', () => {
        const sources = [
            '//www.youtube.com/embed/x',
            'https://m.youtube.com/embed/x',
            'HTTPS://WWW.YOUTUBE.COM/embed/x',
            'https://youtube.com./embed/x',
            ' https://youtube.com/embed/x',
        ]
        for (const src of sources) {
            const out = rewriteIframes(`<iframe src="${src}"></iframe>`, context())
            expect($(out)('iframe').attr('src'), src).toBeUndefined()
            expect($(out)('iframe').attr('data-consent-src'), src).toBe(src)
        }
    })

    it('gates iframes inside noscript, template and svg, and unclosed ones', () => {
        const html = [
            '<noscript><iframe src="https://youtube.com/a"></iframe></noscript>',
            '<template><iframe src="https://youtube.com/b"></iframe></template>',
            '<svg><foreignObject><iframe src="https://youtube.com/c"></iframe></foreignObject></svg>',
            '<p>x</p><IFRAME SRC="https://youtube.com/d">rest',
        ].join('\n')
        const out = rewriteIframes(html, context())
        expect(out).not.toMatch(/\ssrc=/i)
        expect(out.match(/data-consent-embed/g)).toHaveLength(4)
        expect(out).toContain('<p>x</p>')
        expect(out).toMatch(/hidden>rest<\/iframe>/)
    })

    it('decodes entities in src before matching', () => {
        const out = rewriteIframes('<iframe src="https&#58;//youtube.com/x"></iframe>', context())
        expect(out).not.toMatch(/\ssrc=/)
    })

    it('is idempotent: a placeholder has no live src left to rewrite', () => {
        const once = rewriteIframes(IFRAME, context())
        expect(rewriteIframes(once, context())).toBe(once)
    })

    it('uses the page language and the service of the matched host', () => {
        const out = rewriteIframes('<iframe src="https://maps.google.com/x"></iframe>', context('de'))
        const doc = $(out)
        expect(doc('.nera-consent-embed').attr('data-consent')).toBe('media')
        expect(doc('[data-consent-load]').text()).toBe('Google Maps laden')
        expect(doc('.nera-consent-embed__text').text()).toContain('Google Ireland Limited, Dublin')
        // Google Maps has no privacy_url: no link.
        expect(doc('.nera-consent-embed__privacy')).toHaveLength(0)
    })

    it('escapes service and provider texts', () => {
        const out = rewriteIframes('<iframe src="https://google.com/x"></iframe>', context())
        expect(out).toContain('<strong>Google &lt;Ireland&gt; &amp; &quot;Co&quot;</strong>')
    })

    it('prefixes base_path on a root-absolute src in the renderer (D8), never on a gated one', () => {
        const service = { name: 'S', provider: 'P', privacyUrl: null }
        const texts = consent.locales.en.texts
        const local = renderPlaceholder({ category: 'media', src: '/embed/x', service, texts, basePath: '/sub' })
        expect($(local)('iframe').attr('data-consent-src')).toBe('/sub/embed/x')
        // `/\host/x` is root-absolute to a string test but reaches the host in
        // a browser; the rewrite passes no base_path, so it stays as written.
        const app = { lang: 'en', basePath: '/sub', consent }
        const pagesData = [
            { content: '<iframe src="/\\youtube.com/x"></iframe>', meta: {} },
            { content: IFRAME, meta: {} },
        ]
        const [backslash, absolute] = getMetaData({ app, pagesData })
        expect($(backslash.content)('iframe').attr('data-consent-src')).toBe('/\\youtube.com/x')
        expect($(absolute.content)('iframe').attr('data-consent-src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\//)
    })

    it('drops srcdoc from a gated iframe', () => {
        const out = rewriteIframes('<iframe srcdoc="<p>hi</p>" src="https://youtube.com/x" title="t"></iframe>', context())
        const iframe = $(out)('iframe')
        expect(iframe.attr('srcdoc')).toBeUndefined()
        expect(out).not.toMatch(/srcdoc/i)
        expect(iframe.attr('title')).toBe('t')
    })
})

describe('findLiveGatedIframes', () => {
    it('finds a gated iframe the parser drops inside <select>', () => {
        const html = '<select><iframe src="https://www.youtube.com/x"></iframe></select>'
        expect(rewriteIframes(html, context())).toBe(html)
        expect(findLiveGatedIframes(html, consent.hosts)).toEqual(['www.youtube.com'])
    })

    it('never reports the rewrite\'s own placeholders', () => {
        const html = [
            '<p>x</p>',
            '<iframe width="560" src="https://youtube.com/a" title="a > b" srcdoc="x"></iframe>',
            '<IFRAME SRC=//maps.google.com/b>',
        ].join('')
        const out = rewriteIframes(html, context())
        expect(out.match(/data-consent-embed/g)).toHaveLength(2)
        expect(findLiveGatedIframes(out, consent.hosts)).toEqual([])
    })

    it('reads attributes as a browser does and ignores ungated hosts', () => {
        expect(findLiveGatedIframes('<iframe title=\'>\' src="https&#58;//youtube.com/x">', consent.hosts)).toEqual(['youtube.com'])
        expect(findLiveGatedIframes('<iframe src="https://example.com/x" data-src="https://youtube.com/">', consent.hosts)).toEqual([])
        expect(findLiveGatedIframes('<iframe src="/local" src="https://youtube.com/">', consent.hosts)).toEqual([])
        expect(findLiveGatedIframes('<iframes src="https://youtube.com/">', consent.hosts)).toEqual([])
        // A quote inside an unquoted value is a literal, not the start of a value.
        const swallow = '<select><iframe title=a"b src=/x></iframe><iframe src="https://youtube.com/"></iframe></select>'
        expect(findLiveGatedIframes(swallow, consent.hosts)).toEqual(['youtube.com'])
    })
})

describe('renderPlaceholder', () => {
    it('drops attributes it sets itself and keeps the rest in order', () => {
        const html = renderPlaceholder({
            category: 'media',
            src: 'https://youtube.com/x',
            service: { name: 'S', provider: 'P', privacyUrl: null },
            texts: consent.locales.en.texts,
            attributes: { SRC: 'x', title: 'T "q"', 'data-consent': 'other', SrcDoc: '<p>x</p>', loading: 'lazy', hidden: '' },
        })
        expect(html).toContain(
            '<iframe data-consent="media" data-consent-src="https://youtube.com/x" title="T &quot;q&quot;" loading="lazy" hidden></iframe>'
        )
    })

    it('fixes the placeholder element list (ROADMAP "Gated iframes")', () => {
        const html = renderPlaceholder({
            category: 'media',
            src: 'https://youtube.com/x',
            service: { name: 'S', provider: 'P', privacyUrl: 'https://p.example/privacy' },
            texts: consent.locales.en.texts,
        })
        const doc = $(html)
        expect(doc('.nera-consent-embed').children().map((_, el) => el.tagName).get()).toEqual(['iframe', 'div'])
        expect(
            doc('.nera-consent-embed__placeholder')
                .children()
                .map((_, el) => el.attribs.class)
                .get()
        ).toEqual([
            'nera-consent-embed__text',
            'nera-consent-embed__load',
            'nera-consent-embed__privacy',
            'nera-consent-embed__settings',
        ])
        expect(doc('.nera-consent-embed__privacy').attr('rel')).toBe('noopener')
    })

    it('escapes every special character', () => {
        expect(escapeHtml('<a href="x">\'&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
    })
})

describe('getMetaData', () => {
    it('rewrites only pages with a gated iframe, in each page language', () => {
        const app = { lang: 'en', consent }
        const plain = { content: '<p>Plain</p>', meta: {} }
        const en = { content: '<iframe src="https://youtube.com/x"></iframe>', meta: {} }
        const de = { content: '<iframe src="https://youtube.com/x"></iframe>', meta: { lang: 'de' } }
        const fr = { content: '<iframe src="https://youtube.com/x"></iframe>', meta: { lang: 'fr' } }
        const pagesData = [plain, en, de, fr]

        const result = getMetaData({ app, pagesData })
        expect(console.warn).not.toHaveBeenCalled()
        expect(result).toHaveLength(4)
        expect(result[0]).toBe(plain)
        expect(result[1]).not.toBe(en)
        expect(result[1].meta).toBe(en.meta)
        expect(en.content).toBe('<iframe src="https://youtube.com/x"></iframe>')
        expect($(result[1].content)('[data-consent-load]').text()).toBe('Load YouTube')
        expect($(result[2].content)('[data-consent-load]').text()).toBe('YouTube laden')
        // A language without a locale falls back to en.
        expect($(result[3].content)('[data-consent-load]').text()).toBe('Load YouTube')
    })

    it('warns with page and host when a gated iframe escapes the rewrite', () => {
        const app = { lang: 'en', consent }
        const page = { content: '<select><iframe src="https://youtube.com/x"></iframe></select>', meta: { href: '/form.html' } }
        expect(getMetaData({ app, pagesData: [page] })[0]).toBe(page)
        expect(console.warn).toHaveBeenCalledTimes(1)
        expect(console.warn.mock.calls[0][0]).toMatch(/^⚠️ plugin-consent: \/form\.html: an <iframe> from youtube\.com escaped the rewrite/)
    })

    it('is deterministic', () => {
        const app = { lang: 'en', consent }
        const pagesData = [{ content: '<p>a</p><iframe src="https://youtube.com/x" title="t"></iframe>', meta: {} }]
        expect(getMetaData({ app, pagesData })[0].content).toBe(getMetaData({ app, pagesData })[0].content)
    })

    it('fails on a core older than 4.13.0, but not without consent UI', async () => {
        vi.resetModules()
        vi.doMock('../src/guard.js', async (importOriginal) => ({
            ...(await importOriginal()),
            coreVersion: () => '4.12.0',
        }))
        try {
            const plugin = await import('../index.js')
            const pagesData = [{ content: '<p>x</p>', meta: {} }]
            expect(() => plugin.getMetaData({ app: { lang: 'en', consent }, pagesData })).toThrow(/4\.12\.0 is too old/)
            const none = { ...consent, mode: 'none', hosts: [] }
            expect(plugin.getMetaData({ app: { lang: 'en', consent: none }, pagesData })[0]).toBe(pagesData[0])
        } finally {
            vi.doUnmock('../src/guard.js')
            vi.resetModules()
        }
    })
})

describe('hasIframe', () => {
    it('detects an iframe tag in any case', () => {
        expect(hasIframe('<IFRAME src=x>')).toBe(true)
        expect(hasIframe('<p>no</p>')).toBe(false)
        expect(hasIframe(null)).toBe(false)
    })
})
