/*! @nera-static/plugin-consent runtime — https://github.com/seebaermichi/nera-plugin-consent */
// The visitor-side half of the plugin (ROADMAP "Runtime behaviour"). It reads
// the stored choice, shows the banner or the notice when there is none, and
// activates gated scripts and embeds (iframes and media) whose category is
// granted. Everything it acts on is found through a `data-consent*`
// attribute, never a class (D7).
// Linked with `defer`, so it runs once the document is parsed.
(() => {
    'use strict'

    // Linked twice (layout and page): the first copy owns the page.
    if (window.neraConsent) return

    const STORAGE_KEY = 'nera-consent'
    const CHANGE_EVENT = 'nera-consent:change'
    const NECESSARY = 'necessary'
    const ACTIVE = 'active'

    const banner = document.querySelector('[data-consent-banner]')
    const notice = banner ? null : document.querySelector('[data-consent-notice]')
    const root = banner || notice
    const pageMode = banner ? 'banner' : 'notice'
    const revision = root ? Number(root.getAttribute('data-consent-revision')) : NaN
    const configured = banner
        ? (banner.getAttribute('data-consent-categories') || '').split(/\s+/).filter(Boolean)
        : []
    const dialog = document.querySelector('[data-consent-dialog]')

    // ---- reserved space ----------------------------------------------------

    // While the banner or notice shows, the page keeps room for it below its
    // content (`consent.css`), so the fixed root never hides the last content
    // or a focused element for good (WCAG 2.4.11).
    const RESERVE_ATTRIBUTE = 'data-consent-reserve'
    const RESERVE_PROPERTY = '--nera-consent-banner-height'

    /** Reserve the space from the shown root's top edge to the viewport's bottom, or none. */
    function reserveSpace() {
        const html = document.documentElement
        if (!root || root.hidden) {
            html.removeAttribute(RESERVE_ATTRIBUTE)
            html.style.removeProperty(RESERVE_PROPERTY)
            return
        }
        const height = Math.max(0, Math.ceil(window.innerHeight - root.getBoundingClientRect().top))
        html.style.setProperty(RESERVE_PROPERTY, `${height}px`)
        html.setAttribute(RESERVE_ATTRIBUTE, '')
    }

    // ---- storage -----------------------------------------------------------

    const onlyConfigured = (ids) => configured.filter((id) => ids.includes(id))

    /** The stored choice if it is valid for this page (ROADMAP "Storage format"), else null. */
    function readChoice() {
        if (!root) return null
        let choice
        try {
            // The getter itself throws where storage is blocked.
            choice = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
        } catch {
            return null
        }
        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return null
        const { categories, timestamp, mode } = choice
        if (!Array.isArray(categories) || !categories.every((id) => typeof id === 'string')) return null
        if (choice.revision !== revision || typeof timestamp !== 'string') return null
        if (mode !== 'banner' && mode !== 'notice') return null
        // A dismissed notice is never a Reject all once the site has categories.
        if (pageMode === 'banner' && mode !== 'banner') return null
        return { categories: onlyConfigured(categories), revision, timestamp, mode }
    }

    let current = readChoice()

    const copy = (choice) => (choice ? { ...choice, categories: [...choice.categories] } : null)

    const has = (id) => id === NECESSARY || (current !== null && current.categories.includes(id))

    /** Store a choice; when writing throws, it holds for this page view only. */
    function store(categories) {
        if (!root) return
        current = {
            categories: onlyConfigured(categories),
            revision,
            timestamp: new Date().toISOString(),
            mode: pageMode,
        }
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
        } catch {
            // Storage blocked (private window): the choice stays in memory.
        }
        root.hidden = true
        reserveSpace()
        // Grants more → activates now; grants less → from the next page load (O5).
        activateGranted()
        document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: copy(current) }))
    }

    // ---- activation --------------------------------------------------------

    const pending = (selector, scope = document) =>
        [...scope.querySelectorAll(selector)].filter((element) => !element.hasAttribute('data-consent-state'))

    const gatedScripts = () => pending('script[type="text/plain"][data-consent]')
    const gatedEmbeds = (scope) =>
        pending('iframe[data-consent], embed[data-consent], object[data-consent], video[data-consent], audio[data-consent]', scope)

    // The build renames these to `data-consent-<name>` (ROADMAP "Gated media").
    const LOADING = ['src', 'data', 'poster', 'srcset']
    const MEDIA = new Set(['VIDEO', 'AUDIO'])
    const MEDIA_CHILDREN = new Set(['SOURCE', 'TRACK'])

    // Scripts activate one after the other in document order: an external
    // script without `async` holds the queue until it has loaded (or failed),
    // as a parser-inserted one would. Inline and `async` scripts never wait.
    const queue = []
    let waiting = false

    function buildScript(inert) {
        const script = document.createElement('script')
        for (const { name, value } of inert.attributes) {
            if (name !== 'type' && name !== 'data-src' && name !== 'data-type') script.setAttribute(name, value)
        }
        if (inert.getAttribute('data-type') === 'module') script.type = 'module'
        const src = inert.getAttribute('data-src')
        if (src === null) {
            script.text = inert.text
        } else {
            // A script element created by JS is async unless told otherwise.
            if (!script.hasAttribute('async')) script.async = false
            script.src = src
        }
        return script
    }

    function drain() {
        while (queue.length > 0) {
            const inert = queue.shift()
            const script = buildScript(inert)
            if (!script.hasAttribute('src') || script.hasAttribute('async')) {
                inert.replaceWith(script)
                continue
            }
            let settled = false
            const resume = () => {
                if (settled) return
                settled = true
                if (waiting) {
                    waiting = false
                    drain()
                }
            }
            script.addEventListener('load', resume)
            script.addEventListener('error', resume)
            inert.replaceWith(script)
            // Some environments fire `load` during insertion; then go on at once.
            if (!settled) {
                waiting = true
                return
            }
        }
    }

    function activateScripts(scripts) {
        for (const inert of scripts) {
            // Claimed at once, so a later pass can never queue it again.
            inert.setAttribute('data-consent-state', ACTIVE)
            queue.push(inert)
        }
        if (!waiting) drain()
    }

    /** Give every inert loading attribute its live name back. */
    function restore(element) {
        for (const name of LOADING) {
            const value = element.getAttribute(`data-consent-${name}`)
            if (value !== null) element.setAttribute(name, value)
        }
    }

    function activateEmbed(element) {
        element.setAttribute('data-consent-state', ACTIVE)
        element.hidden = false
        if (MEDIA.has(element.tagName)) {
            // Sources first, so the element's own `src` (which wins) and
            // `load()` see them.
            for (const child of element.children) {
                if (MEDIA_CHILDREN.has(child.tagName)) restore(child)
            }
            restore(element)
            if (typeof element.load === 'function') element.load()
        } else {
            restore(element)
        }
        const wrapper = element.closest('[data-consent-embed]')
        if (!wrapper) return
        wrapper.setAttribute('data-consent-state', ACTIVE)
        for (const child of wrapper.children) {
            if (!child.contains(element)) child.hidden = true
        }
    }

    function activateGranted() {
        activateScripts(gatedScripts().filter((script) => has(script.getAttribute('data-consent'))))
        for (const element of gatedEmbeds()) {
            if (has(element.getAttribute('data-consent'))) activateEmbed(element)
        }
    }

    // ---- settings dialog ---------------------------------------------------

    let opener = null

    const checkboxes = () => (dialog ? [...dialog.querySelectorAll('[data-consent-category]')] : [])

    /** Open the settings with the current choice ticked; nothing is pre-selected. */
    function open() {
        if (!dialog) return
        for (const checkbox of checkboxes()) {
            checkbox.checked = has(checkbox.getAttribute('data-consent-category'))
        }
        if (dialog.open) return
        opener = document.activeElement
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
    }

    function closeDialog() {
        if (!dialog || !dialog.open) return
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
    }

    const isVisible = (element) =>
        !element.closest('[hidden]') &&
        (typeof element.checkVisibility !== 'function' || element.checkVisibility())

    /**
     * After a choice hid the banner or notice, focus the site's own settings
     * link — the first visible `[data-consent-open]` outside root, dialog and
     * embed placeholders —
     * so keyboard focus does not fall back to the top of the page. With none,
     * focus is left alone.
     */
    function focusSettingsLink() {
        const link = [...document.querySelectorAll('[data-consent-open]')].find((element) =>
            !root?.contains(element) && !dialog?.contains(element) &&
            !element.closest('[data-consent-embed]') && isVisible(element))
        link?.focus()
    }

    // Escape, the native Close button and every action land here.
    dialog?.addEventListener('close', () => {
        const target = opener
        opener = null
        if (!target?.isConnected || typeof target.focus !== 'function') return
        // The banner's Settings button is gone once a choice hid the banner.
        if (root?.contains(target) && root.hidden) {
            focusSettingsLink()
            return
        }
        if (target.closest('[hidden]')) return
        target.focus()
    })

    const ticked = () =>
        checkboxes()
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => checkbox.getAttribute('data-consent-category'))

    // ---- controls ----------------------------------------------------------

    /**
     * Store a choice and close the dialog. A choice made on the banner or
     * notice itself hides the focused button with it, so focus moves on; a
     * choice made in the dialog is handled by its `close` listener.
     */
    function choose(categories, control) {
        const onRoot = root?.contains(control) ?? false
        store(categories)
        closeDialog()
        if (onRoot) focusSettingsLink()
    }

    const ACTIONS = [
        ['[data-consent-open]', () => open()],
        ['[data-consent-accept-all]', (control) => choose(configured, control)],
        ['[data-consent-reject-all]', (control) => choose([], control)],
        ['[data-consent-save]', (control) => choose(ticked(), control)],
        ['[data-consent-dismiss]', (control) => choose([], control)],
        ['[data-consent-load]', (control) => {
            // D3: this one embed, for this page view; nothing is stored.
            const wrapper = control.closest('[data-consent-embed]')
            if (wrapper) gatedEmbeds(wrapper).filter((element) => element.parentElement === wrapper).forEach(activateEmbed)
        }],
    ]

    document.addEventListener('click', (event) => {
        if (typeof event.target?.closest !== 'function') return
        for (const [selector, action] of ACTIONS) {
            const control = event.target.closest(selector)
            if (control) {
                // No dialog to open: a settings link keeps its own `href`.
                if (selector === '[data-consent-open]' && !dialog) return
                event.preventDefault()
                action(control)
                return
            }
        }
    })

    window.neraConsent = Object.freeze({
        open,
        get: () => copy(current),
        has,
    })

    if (root) root.hidden = current !== null
    reserveSpace()
    if (root && !root.hidden) {
        // The root's height follows its text wrapping; its top, the viewport.
        if (typeof ResizeObserver === 'function') new ResizeObserver(reserveSpace).observe(root)
        window.addEventListener('resize', reserveSpace)
    }
    activateGranted()
})()
