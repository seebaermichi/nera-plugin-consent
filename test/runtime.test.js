import fs from 'fs'
import path from 'path'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '../src/app-consent.js'
import { renderPlaceholder } from '../src/placeholder.js'

// The runtime runs in a happy-dom window per page load. Inline gated scripts
// really execute (they push to `window.log`); external ones never touch the
// network: file loading is off and reported as a successful load, and a
// capturing listener logs `load:<src>` when that happens. Every load event
// fires on the script element, so the log is the execution order.

const RUNTIME = fs.readFileSync(path.resolve('assets/consent.js'), 'utf8')

const TEXTS = {
    placeholder_text: 'This content is provided by {service}. Loading it connects to {provider}.',
    placeholder_load: 'Load content',
    placeholder_settings: 'Privacy settings',
    service_privacy: 'Privacy policy of the provider',
}

const embed = (src, category = 'media') =>
    renderPlaceholder({
        category,
        src,
        service: { name: 'YouTube', provider: 'Google', privacyUrl: 'https://policies.google.com/privacy' },
        texts: TEXTS,
        attributes: { title: 'Video' },
    })

const banner = ({ revision = 1, categories = 'analytics media' } = {}) =>
    `<div data-consent-banner data-consent-revision="${revision}" data-consent-categories="${categories}" hidden>` +
    '<button id="accept" data-consent-accept-all>Accept all</button>' +
    '<button id="reject" data-consent-reject-all>Reject all</button>' +
    '<button id="settings" data-consent-open>Settings</button>' +
    '</div>'

const dialog =
    '<dialog data-consent-dialog><form method="dialog">' +
    '<input type="checkbox" id="cb-analytics" data-consent-category="analytics">' +
    '<input type="checkbox" id="cb-media" data-consent-category="media">' +
    '<button id="save" data-consent-save>Save</button>' +
    '<button id="dialog-accept" data-consent-accept-all>Accept all</button>' +
    '<button id="dialog-reject" data-consent-reject-all>Reject all</button>' +
    '<button id="close">Close</button>' +
    '</form></dialog>'

const notice = (revision = 1) =>
    `<div data-consent-notice data-consent-revision="${revision}" hidden>` +
    '<button id="dismiss" data-consent-dismiss>Got it</button></div>'

const SCRIPTS =
    '<script type="text/plain" data-consent="analytics">window.log.push("a1")</script>' +
    '<script type="text/plain" data-consent="analytics" data-src="https://stats.test/a.js"></script>' +
    '<script type="text/plain" data-consent="media">window.log.push("m1")</script>' +
    '<script type="text/plain" data-consent="analytics">window.log.push("a2")</script>'

const windows = []
const restores = []

afterEach(async () => {
    restores.splice(0).reverse().forEach((restore) => restore())
    await Promise.all(windows.splice(0).map((window) => window.happyDOM.close()))
})

/**
 * Load a page: body HTML, an optional stored value, then the runtime.
 *
 * @param {string} body
 * @param {object} [options]
 * @param {string|null} [options.stored] raw `localStorage` value
 * @param {boolean} [options.blockStorage] make `localStorage` throw
 * @param {(window: Window) => void} [options.before] runs before the runtime
 */
function load(body, { stored = null, blockStorage = false, before } = {}) {
    const window = new Window({
        url: 'https://site.test/',
        settings: {
            enableJavaScriptEvaluation: true,
            suppressInsecureJavaScriptEnvironmentWarning: true,
            disableJavaScriptFileLoading: true,
            handleDisabledFileLoadingAsSuccess: true,
            disableIframePageLoading: true,
        },
    })
    windows.push(window)
    const { document } = window
    window.log = []
    window.events = []
    document.addEventListener('load', (event) => {
        if (event.target.tagName === 'SCRIPT') window.log.push(`load:${event.target.getAttribute('src')}`)
    }, true)
    document.addEventListener('nera-consent:change', (event) => window.events.push(event.detail))
    if (stored !== null) window.localStorage.setItem(STORAGE_KEY, stored)
    if (blockStorage) {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
                throw new window.DOMException('The operation is insecure.', 'SecurityError')
            },
        })
    }
    document.body.innerHTML = body
    before?.(window)
    const runtime = document.createElement('script')
    runtime.textContent = RUNTIME
    document.body.appendChild(runtime)
    return window
}

/** The next page load of the same visitor: same body, the storage carried over. */
const reload = (window, body) => load(body, { stored: window.localStorage.getItem(STORAGE_KEY) })

const click = (window, id) => window.document.getElementById(id).click()

const stored = (window) => JSON.parse(window.localStorage.getItem(STORAGE_KEY))

const choice = (categories, overrides = {}) =>
    JSON.stringify({ categories, revision: 1, timestamp: '2026-10-16T10:00:00.000Z', mode: 'banner', ...overrides })

const iframes = (window) => [...window.document.querySelectorAll('iframe')]

/** Nothing gated is live: no script ran or loaded, no iframe has a `src`. */
function expectNothingActive(window) {
    expect(window.log).toEqual([])
    const { document } = window
    for (const script of document.querySelectorAll('script[data-consent]')) {
        expect(script.getAttribute('type')).toBe('text/plain')
        expect(script.hasAttribute('src')).toBe(false)
        expect(script.hasAttribute('data-consent-state')).toBe(false)
    }
    for (const iframe of iframes(window)) {
        expect(iframe.hasAttribute('src')).toBe(false)
        expect(iframe.hidden).toBe(true)
    }
}

const PAGE = banner() + dialog + SCRIPTS + embed('https://www.youtube-nocookie.com/embed/abc')

describe('before a choice', () => {
    it('shows the banner and activates nothing', () => {
        const window = load(PAGE)
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(false)
        expectNothingActive(window)
        expect(window.neraConsent.get()).toBe(null)
        expect(window.neraConsent.has('analytics')).toBe(false)
        expect(window.neraConsent.has('necessary')).toBe(true)
    })

    it('treats a stored choice of another revision as none (revision bump asks again)', () => {
        const window = load(banner({ revision: 2 }) + SCRIPTS, { stored: choice(['analytics', 'media']) })
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(false)
        expectNothingActive(window)
        expect(window.neraConsent.get()).toBe(null)
    })

    it.each([
        ['not JSON', '{oops'],
        ['JSON null', 'null'],
        ['an array', '[]'],
        ['a string', '"analytics"'],
        ['categories not an array', choice('analytics')],
        ['a non-string category', choice([1])],
        ['the revision as a string', choice(['analytics'], { revision: '1' })],
        ['no timestamp', choice(['analytics'], { timestamp: undefined })],
        ['an unknown mode', choice(['analytics'], { mode: 'all' })],
        ['a notice choice on a banner page', choice([], { mode: 'notice' })],
    ])('treats corrupt storage (%s) as no choice', (_, value) => {
        const window = load(PAGE, { stored: value })
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(false)
        expectNothingActive(window)
    })

    it('shows the banner and activates nothing when storage is blocked', () => {
        const window = load(PAGE, { blockStorage: true })
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(false)
        expectNothingActive(window)
    })

    it('activates nothing on a page without banner or notice (mode none)', () => {
        const window = load(SCRIPTS, { stored: choice(['analytics', 'media']) })
        expectNothingActive(window)
        expect(window.neraConsent.get()).toBe(null)
    })
})

describe('Accept all', () => {
    it('activates every gated script in document order and every gated iframe', () => {
        const window = load(PAGE)
        click(window, 'accept')

        expect(window.log).toEqual(['a1', 'load:https://stats.test/a.js', 'm1', 'a2'])
        const [iframe] = iframes(window)
        expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abc')
        expect(iframe.hidden).toBe(false)
        const wrapper = window.document.querySelector('[data-consent-embed]')
        expect(wrapper.getAttribute('data-consent-state')).toBe('active')
        expect(wrapper.querySelector('.nera-consent-embed__placeholder').hidden).toBe(true)
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(true)
    })

    it('stores the documented shape and fires the change event with it', () => {
        const window = load(PAGE)
        click(window, 'accept')

        const value = stored(window)
        expect(Object.keys(value)).toEqual(['categories', 'revision', 'timestamp', 'mode'])
        expect(value).toMatchObject({ categories: ['analytics', 'media'], revision: 1, mode: 'banner' })
        expect(new Date(value.timestamp).toISOString()).toBe(value.timestamp)
        expect(window.events).toEqual([value])
        expect(window.neraConsent.get()).toEqual(value)
    })

    it('activates on the next page load without asking again', () => {
        const first = load(PAGE)
        click(first, 'accept')
        const window = reload(first, PAGE)
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(true)
        expect(window.log).toEqual(['a1', 'load:https://stats.test/a.js', 'm1', 'a2'])
        expect(window.events).toEqual([])
    })

    it('holds for the page view when storage is blocked', () => {
        const window = load(PAGE, { blockStorage: true })
        click(window, 'accept')
        expect(window.log).toEqual(['a1', 'load:https://stats.test/a.js', 'm1', 'a2'])
        expect(window.neraConsent.has('media')).toBe(true)
    })
})

describe('Reject all', () => {
    it('activates nothing, stores [] and hides the banner', () => {
        const window = load(PAGE)
        click(window, 'reject')
        expectNothingActive(window)
        expect(stored(window)).toMatchObject({ categories: [], revision: 1, mode: 'banner' })
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(true)
        expect(window.events).toHaveLength(1)
    })

    it('activates nothing after a reload either, and does not ask again', () => {
        const first = load(PAGE)
        click(first, 'reject')
        const window = reload(first, PAGE)
        expectNothingActive(window)
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(true)
    })
})

describe('settings dialog', () => {
    it('opens from [data-consent-open] with nothing pre-selected', () => {
        const window = load(PAGE)
        click(window, 'settings')
        const dialogElement = window.document.querySelector('[data-consent-dialog]')
        expect(dialogElement.open).toBe(true)
        expect(window.document.getElementById('cb-analytics').checked).toBe(false)
        expect(window.document.getElementById('cb-media').checked).toBe(false)
        expectNothingActive(window)
    })

    it('leaves a settings link alone when the page has no dialog', () => {
        const window = load('<a id="link" href="/privacy" data-consent-open>Settings</a>')
        const event = new window.MouseEvent('click', { bubbles: true, cancelable: true })
        window.document.getElementById('link').dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
    })

    it('opens from neraConsent.open() with the stored choice ticked', () => {
        const window = load(PAGE, { stored: choice(['media']) })
        window.neraConsent.open()
        expect(window.document.querySelector('[data-consent-dialog]').open).toBe(true)
        expect(window.document.getElementById('cb-analytics').checked).toBe(false)
        expect(window.document.getElementById('cb-media').checked).toBe(true)
    })

    it('Save stores exactly the ticked categories and activates only those', () => {
        const first = load(PAGE)
        click(first, 'settings')
        first.document.getElementById('cb-media').checked = true
        click(first, 'save')

        expect(stored(first).categories).toEqual(['media'])
        expect(first.log).toEqual(['m1'])
        expect(iframes(first)[0].getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abc')
        expect(first.document.querySelector('[data-consent-dialog]').open).toBe(false)

        const window = reload(first, PAGE)
        expect(window.log).toEqual(['m1'])
        expect(window.neraConsent.has('analytics')).toBe(false)
    })

    it('Accept all and Reject all in the dialog store and close it', () => {
        const window = load(PAGE)
        click(window, 'settings')
        click(window, 'dialog-reject')
        expect(stored(window).categories).toEqual([])
        expect(window.document.querySelector('[data-consent-dialog]').open).toBe(false)
        window.neraConsent.open()
        click(window, 'dialog-accept')
        expect(stored(window).categories).toEqual(['analytics', 'media'])
        expect(window.document.querySelector('[data-consent-dialog]').open).toBe(false)
    })

    it('closing without saving changes nothing and returns focus to the opener', () => {
        const window = load(banner() + dialog + '<a href="#" id="footer-link" data-consent-open>Cookies</a>', {
            stored: choice(['media']),
        })
        const link = window.document.getElementById('footer-link')
        link.focus()
        link.click()
        window.document.getElementById('cb-analytics').checked = true
        window.document.querySelector('[data-consent-dialog]').close()
        expect(stored(window).categories).toEqual(['media'])
        expect(window.events).toEqual([])
        expect(window.document.activeElement).toBe(link)
    })

    it('a withdrawal is stored at once and takes effect from the next page load', () => {
        const first = load(PAGE, { stored: choice(['analytics']) })
        expect(first.log).toEqual(['a1', 'load:https://stats.test/a.js', 'a2'])
        first.neraConsent.open()
        first.document.getElementById('cb-analytics').checked = false
        click(first, 'save')
        expect(stored(first).categories).toEqual([])
        expect(first.events.at(-1).categories).toEqual([])

        const window = reload(first, PAGE)
        expectNothingActive(window)
    })

    it('ignores stored ids the site no longer configures', () => {
        const window = load(PAGE, { stored: choice(['media', 'marketing']) })
        expect(window.neraConsent.get().categories).toEqual(['media'])
        expect(window.neraConsent.has('marketing')).toBe(false)
    })
})

describe('activation runs once', () => {
    it('never runs a script twice, however often consent is given', () => {
        const window = load(PAGE)
        click(window, 'accept')
        click(window, 'settings')
        click(window, 'dialog-accept')
        window.neraConsent.open()
        click(window, 'save')
        expect(window.log).toEqual(['a1', 'load:https://stats.test/a.js', 'm1', 'a2'])
        expect(window.document.querySelectorAll('script[data-consent][data-consent-state="active"]')).toHaveLength(4)
    })

    it('a second copy of the runtime does nothing', () => {
        const window = load(PAGE, { stored: choice(['analytics', 'media']) })
        const api = window.neraConsent
        const again = window.document.createElement('script')
        again.textContent = RUNTIME
        window.document.body.appendChild(again)
        expect(window.neraConsent).toBe(api)
        expect(window.log).toEqual(['a1', 'load:https://stats.test/a.js', 'm1', 'a2'])
        click(window, 'accept')
        expect(window.log).toHaveLength(4)
    })
})

describe('activated scripts', () => {
    const ATTRIBUTES =
        '<script type="text/plain" data-consent="analytics" data-src="https://stats.test/async.js" async integrity="sha384-x" crossorigin="anonymous" id="s1" data-site-id="7"></script>' +
        '<script type="text/plain" data-consent="analytics" data-src="https://stats.test/defer.js" defer nonce="n0nce"></script>' +
        '<script type="text/plain" data-consent="analytics" data-type="module" data-src="/js/stats.js"></script>' +
        '<script type="text/plain" data-consent="analytics" data-type="module">window.log.push("inline module")</script>'

    it('keeps async, defer, module and every other attribute', () => {
        const window = load(banner() + ATTRIBUTES, { stored: choice(['analytics']) })
        const [asyncScript, deferScript, moduleScript, inlineModule] = window.document.querySelectorAll('script[data-consent]')

        expect(asyncScript.getAttribute('src')).toBe('https://stats.test/async.js')
        expect(asyncScript.hasAttribute('async')).toBe(true)
        expect(asyncScript.getAttribute('integrity')).toBe('sha384-x')
        expect(asyncScript.getAttribute('crossorigin')).toBe('anonymous')
        expect(asyncScript.id).toBe('s1')
        expect(asyncScript.getAttribute('data-site-id')).toBe('7')
        expect(asyncScript.hasAttribute('type')).toBe(false)
        expect(asyncScript.hasAttribute('data-src')).toBe(false)

        expect(deferScript.hasAttribute('defer')).toBe(true)
        expect(deferScript.hasAttribute('async')).toBe(false)
        expect(deferScript.getAttribute('nonce')).toBe('n0nce')

        expect(moduleScript.getAttribute('type')).toBe('module')
        expect(moduleScript.getAttribute('src')).toBe('/js/stats.js')
        expect(moduleScript.hasAttribute('data-type')).toBe(false)
        expect(inlineModule.getAttribute('type')).toBe('module')
        expect(inlineModule.textContent).toBe('window.log.push("inline module")')

        for (const script of [asyncScript, deferScript, moduleScript, inlineModule]) {
            expect(script.getAttribute('data-consent')).toBe('analytics')
            expect(script.getAttribute('data-consent-state')).toBe('active')
        }
    })

    /**
     * Hold every script `load` event until released, as a real network would,
     * so the test sees what the runtime inserts while a script is in flight.
     * happy-dom shares element prototypes between windows: the patch is undone
     * after the test.
     */
    function holdLoads(window) {
        const held = []
        const released = new WeakSet()
        const prototype = window.HTMLScriptElement.prototype
        const dispatch = window.HTMLScriptElement.prototype.dispatchEvent
        restores.push(() => {
            prototype.dispatchEvent = dispatch
        })
        window.HTMLScriptElement.prototype.dispatchEvent = function (event) {
            if (event.type === 'load' && this.hasAttribute('src') && !released.has(event)) {
                held.push(() => {
                    released.add(event)
                    dispatch.call(this, event)
                })
                return true
            }
            return dispatch.call(this, event)
        }
        return () => held.shift()()
    }

    it('waits for an external script before the next one, but not for an async one', () => {
        let release
        const body =
            banner() +
            '<script type="text/plain" data-consent="analytics" data-src="https://stats.test/1.js"></script>' +
            '<script type="text/plain" data-consent="analytics">window.log.push("after 1")</script>' +
            '<script type="text/plain" data-consent="analytics" data-src="https://stats.test/2.js" async></script>' +
            '<script type="text/plain" data-consent="analytics">window.log.push("after 2")</script>'
        const window = load(body, {
            stored: choice(['analytics']),
            before: (w) => {
                release = holdLoads(w)
            },
        })

        const scripts = () => [...window.document.querySelectorAll('script[data-consent]')]
        // 1.js is in flight: everything after it is still inert.
        expect(scripts().map((script) => script.getAttribute('type'))).toEqual([null, 'text/plain', 'text/plain', 'text/plain'])
        expect(window.log).toEqual([])

        release()
        // 2.js is async: inserted without holding back the inline script after it.
        expect(window.log).toEqual(['load:https://stats.test/1.js', 'after 1', 'after 2'])
        expect(scripts().every((script) => script.getAttribute('type') !== 'text/plain')).toBe(true)

        release()
        expect(window.log.at(-1)).toBe('load:https://stats.test/2.js')
    })

    it('does not queue a script twice while an earlier one is in flight', () => {
        let release
        const window = load(banner() + SCRIPTS, {
            stored: choice(['analytics']),
            before: (w) => {
                release = holdLoads(w)
            },
        })
        // a.js is in flight; Accept all now grants media and runs a pass of its own.
        click(window, 'accept')
        click(window, 'accept')
        expect(window.log).toEqual(['a1'])
        release()
        expect(window.log).toEqual(['a1', 'load:https://stats.test/a.js', 'a2', 'm1'])
    })

    it('goes on after an external script fails to load', () => {
        const window = new Window({
            url: 'https://site.test/',
            settings: {
                enableJavaScriptEvaluation: true,
                suppressInsecureJavaScriptEnvironmentWarning: true,
                disableJavaScriptFileLoading: true,
                handleDisabledFileLoadingAsSuccess: false,
            },
        })
        windows.push(window)
        window.log = []
        window.console.error = () => {}
        window.localStorage.setItem(STORAGE_KEY, choice(['analytics']))
        window.document.body.innerHTML = banner() + SCRIPTS
        const runtime = window.document.createElement('script')
        runtime.textContent = RUNTIME
        window.document.body.appendChild(runtime)
        expect(window.log).toEqual(['a1', 'a2'])
    })
})

describe('two-click placeholder (D3)', () => {
    const TWO = banner() + embed('https://www.youtube-nocookie.com/embed/one') + embed('https://www.youtube-nocookie.com/embed/two')

    it('loads that one embed, stores nothing and keeps the banner', () => {
        const window = load(TWO)
        window.document.querySelector('[data-consent-load]').click()

        const [one, two] = iframes(window)
        expect(one.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/one')
        expect(one.hidden).toBe(false)
        expect(two.hasAttribute('src')).toBe(false)
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe(null)
        expect(window.events).toEqual([])
        expect(window.neraConsent.has('media')).toBe(false)
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(false)
    })

    it('opens the settings from the placeholder link', () => {
        const window = load(TWO + dialog)
        window.document.querySelector('.nera-consent-embed__settings').click()
        expect(window.document.querySelector('[data-consent-dialog]').open).toBe(true)
        expect(iframes(window).some((iframe) => iframe.hasAttribute('src'))).toBe(false)
    })
})

describe('notice mode', () => {
    it('shows the notice; Got it stores a notice choice and hides it', () => {
        const window = load(notice() + SCRIPTS)
        const root = window.document.querySelector('[data-consent-notice]')
        expect(root.hidden).toBe(false)
        click(window, 'dismiss')
        expect(root.hidden).toBe(true)
        expect(stored(window)).toMatchObject({ categories: [], revision: 1, mode: 'notice' })
        expectNothingActive(window)

        const next = reload(window, notice() + SCRIPTS)
        expect(next.document.querySelector('[data-consent-notice]').hidden).toBe(true)
    })

    it('a dismissed notice does not count once the site has categories', () => {
        const first = load(notice())
        click(first, 'dismiss')
        const window = reload(first, PAGE)
        expect(window.document.querySelector('[data-consent-banner]').hidden).toBe(false)
        expectNothingActive(window)
    })

    it('a banner choice of the same revision counts as seen on a notice page', () => {
        const window = load(notice(), { stored: choice(['media']) })
        expect(window.document.querySelector('[data-consent-notice]').hidden).toBe(true)
        expect(window.neraConsent.get().categories).toEqual([])
    })
})
