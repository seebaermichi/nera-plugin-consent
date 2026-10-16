import { withBasePath } from './app-consent.js'

// D2 — the definition of the two-click placeholder markup (ROADMAP "Gated
// iframes and the placeholder"). The iframe rewrite (`getMetaData`) calls it;
// the Pug embed mixin (`views/embed.pug`) cannot import it and mirrors it
// instead, held byte-identical by `test/templates.test.js` — change both.
// The iframe is inert as rendered: no `src`, only `data-consent-src`. Gated
// `<embed>`, `<object>`, `<video>` and `<audio>` (rewrite only, ROADMAP
// "Gated media") share the wrapper and the controls; `inertStartTag` makes
// their loading attributes inert.

/**
 * The attributes through which each gated element (and a gated media
 * element's `<source>` / `<track>` children) loads something. Until consent
 * each is renamed to `data-consent-<name>`; the runtime renames it back.
 */
export const LOADING_ATTRIBUTES = {
    iframe: ['src'],
    embed: ['src'],
    object: ['data'],
    video: ['src', 'poster'],
    audio: ['src'],
    source: ['src', 'srcset'],
    track: ['src'],
}

/** The inert name of a loading attribute (`src` → `data-consent-src`). */
const inertName = (name) => `data-consent-${name}`

// Attributes the renderer sets itself; a copy from the source iframe would
// duplicate or contradict them. `srcdoc` goes too: it renders while the
// iframe is `hidden` (no consent needed for inline markup that may itself
// load third-party content) and would win over the `src` set on activation.
const OWN_ATTRIBUTES = new Set(['src', 'srcdoc', 'data-consent', 'data-consent-src', 'hidden'])

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }

/** Escape text for an HTML text node or a double-quoted attribute value. */
export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char])
}

const attribute = (name, value) =>
    value === '' ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`

/**
 * A placeholder text with `{service}` and `{provider}` filled in, escaped;
 * `wrapProvider` gets the escaped provider (`placeholder_text` sets it in
 * `<strong>`, since it is who the visitor connects to).
 */
function fillIn(template, { service, provider }, wrapProvider = (escaped) => escaped) {
    return template
        .split(/(\{service\}|\{provider\})/)
        .map((part) => {
            if (part === '{service}') return escapeHtml(service)
            if (part === '{provider}') return wrapProvider(escapeHtml(provider))
            return escapeHtml(part)
        })
        .join('')
}

/**
 * Render one gated embed.
 *
 * @param {object} embed
 * @param {string} embed.category category id that activates it
 * @param {string} embed.src the iframe URL (root-absolute gets `basePath`, D8)
 * @param {{ name: string, provider: string, privacyUrl: string|null }} embed.service
 *     the service as in `app.consent.locales[lang].categories[].services[]`
 * @param {Record<string, string>} embed.texts the page language's texts
 * @param {Record<string, string>} [embed.attributes] the source iframe's other
 *     attributes, in order (`src`, `srcdoc`, `data-consent`,
 *     `data-consent-src` and `hidden` are ignored)
 * @param {string} [embed.inner] the source iframe's raw content, kept as is
 * @param {string} [embed.basePath]
 * @returns {string}
 */
export function renderPlaceholder({
    category,
    src,
    service,
    texts,
    attributes = {},
    inner = '',
    basePath = '',
}) {
    let iframe = '<iframe'
    iframe += attribute('data-consent', category)
    iframe += attribute('data-consent-src', withBasePath(src, basePath))
    for (const [name, value] of Object.entries(attributes)) {
        if (!OWN_ATTRIBUTES.has(name.toLowerCase())) iframe += attribute(name, value)
    }
    iframe += ` hidden>${inner}</iframe>`

    return wrapperStart(category) + iframe + renderControls({ service, texts }) + '</div>'
}

/** The opening tag of the placeholder wrapper, `<div class="nera-consent-embed" …>`. */
export const wrapperStart = (category) =>
    `<div class="nera-consent-embed" data-consent-embed data-consent="${escapeHtml(category)}">`

/**
 * The placeholder's visible part, `div.nera-consent-embed__placeholder`, in
 * the element list the ROADMAP fixes.
 *
 * @param {object} placeholder
 * @param {{ name: string, provider: string, privacyUrl: string|null }} placeholder.service
 * @param {Record<string, string>} placeholder.texts
 * @returns {string}
 */
export function renderControls({ service, texts }) {
    const names = { service: service.name, provider: service.provider }
    const text = fillIn(texts.placeholder_text, names, (escaped) => `<strong>${escaped}</strong>`)
    const load = fillIn(texts.placeholder_load, names)
    const privacy = service.privacyUrl
        ? `<a class="nera-consent-embed__privacy" href="${escapeHtml(service.privacyUrl)}" rel="noopener">${escapeHtml(texts.service_privacy)}</a>`
        : ''

    return (
        '<div class="nera-consent-embed__placeholder">' +
        `<p class="nera-consent-embed__text">${text}</p>` +
        `<button class="nera-consent-embed__load" type="button" data-consent-load>${load}</button>` +
        privacy +
        `<button class="nera-consent-embed__settings" type="button" data-consent-open>${escapeHtml(texts.placeholder_settings)}</button>` +
        '</div>'
    )
}

/**
 * The inert start tag of a gated element other than an iframe, or of a gated
 * media element's `<source>` / `<track>` child: every loading attribute is
 * renamed in place, every other attribute kept in source order. With a
 * `category` (the gated element itself) it gets `data-consent` first and
 * `hidden` last, as the iframe does; a child gets neither. Attributes that
 * would contradict these (`data-consent`, `hidden`, an inert name already
 * present) are dropped.
 *
 * @param {string} tag lower-case tag name, a key of `LOADING_ATTRIBUTES`
 * @param {Record<string, string>} attributes the source element's attributes
 * @param {string} [category]
 * @returns {string}
 */
export function inertStartTag(tag, attributes, category) {
    const loading = LOADING_ATTRIBUTES[tag]
    const dropped = new Set(loading.map(inertName))
    if (category !== undefined) {
        dropped.add('data-consent')
        dropped.add('hidden')
    }

    let html = `<${tag}`
    if (category !== undefined) html += attribute('data-consent', category)
    for (const [name, value] of Object.entries(attributes)) {
        const lower = name.toLowerCase()
        if (dropped.has(lower)) continue
        html += attribute(loading.includes(lower) ? inertName(lower) : name, value)
    }
    return html + (category !== undefined ? ' hidden>' : '>')
}
