/*! @nera-static/plugin-consent runtime — https://github.com/seebaermichi/nera-plugin-consent */
// The visitor-side half of the plugin (ROADMAP "Runtime behaviour"). It reads
// the stored choice, shows the banner or the notice when there is none, and
// activates gated scripts and iframes whose category is granted. Everything it
// acts on is found through a `data-consent*` attribute, never a class (D7).
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
        // Grants more → activates now; grants less → from the next page load (O5).
        activateGranted()
        document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: copy(current) }))
    }

    // ---- activation --------------------------------------------------------

    const pending = (selector, scope = document) =>
        [...scope.querySelectorAll(selector)].filter((element) => !element.hasAttribute('data-consent-state'))

    const gatedScripts = () => pending('script[type="text/plain"][data-consent]')
    const gatedIframes = (scope) => pending('iframe[data-consent][data-consent-src]', scope)

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

    function activateIframe(iframe) {
        iframe.setAttribute('data-consent-state', ACTIVE)
        iframe.hidden = false
        iframe.src = iframe.getAttribute('data-consent-src')
        const wrapper = iframe.closest('[data-consent-embed]')
        if (!wrapper) return
        wrapper.setAttribute('data-consent-state', ACTIVE)
        for (const child of wrapper.children) {
            if (!child.contains(iframe)) child.hidden = true
        }
    }

    function activateGranted() {
        activateScripts(gatedScripts().filter((script) => has(script.getAttribute('data-consent'))))
        for (const iframe of gatedIframes()) {
            if (has(iframe.getAttribute('data-consent'))) activateIframe(iframe)
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

    // Escape, the native Close button and every action land here.
    dialog?.addEventListener('close', () => {
        const target = opener
        opener = null
        if (!target?.isConnected || typeof target.focus !== 'function') return
        // The banner's Settings button is gone once a choice hid the banner.
        if (target.closest('[hidden]')) return
        target.focus()
    })

    const ticked = () =>
        checkboxes()
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => checkbox.getAttribute('data-consent-category'))

    // ---- controls ----------------------------------------------------------

    const ACTIONS = [
        ['[data-consent-open]', () => open()],
        ['[data-consent-accept-all]', () => { store(configured); closeDialog() }],
        ['[data-consent-reject-all]', () => { store([]); closeDialog() }],
        ['[data-consent-save]', () => { store(ticked()); closeDialog() }],
        ['[data-consent-dismiss]', () => store([])],
        ['[data-consent-load]', (control) => {
            // D3: this one embed, for this page view; nothing is stored.
            const wrapper = control.closest('[data-consent-embed]')
            if (wrapper) gatedIframes(wrapper).forEach(activateIframe)
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
    activateGranted()
})()
