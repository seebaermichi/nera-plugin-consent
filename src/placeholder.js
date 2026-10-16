import { withBasePath } from './app-consent.js'

// D2 — the definition of the two-click placeholder markup (ROADMAP "Gated
// iframes and the placeholder"). The iframe rewrite (`getMetaData`) calls it;
// the Pug embed mixin (`views/embed.pug`) cannot import it and mirrors it
// instead, held byte-identical by `test/templates.test.js` — change both.
// The iframe is inert as rendered: no `src`, only `data-consent-src`.

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

    const names = { service: service.name, provider: service.provider }
    const text = fillIn(texts.placeholder_text, names, (escaped) => `<strong>${escaped}</strong>`)
    const load = fillIn(texts.placeholder_load, names)
    const privacy = service.privacyUrl
        ? `<a class="nera-consent-embed__privacy" href="${escapeHtml(service.privacyUrl)}" rel="noopener">${escapeHtml(texts.service_privacy)}</a>`
        : ''

    return (
        `<div class="nera-consent-embed" data-consent-embed data-consent="${escapeHtml(category)}">` +
        iframe +
        '<div class="nera-consent-embed__placeholder">' +
        `<p class="nera-consent-embed__text">${text}</p>` +
        `<button class="nera-consent-embed__load" type="button" data-consent-load>${load}</button>` +
        privacy +
        `<button class="nera-consent-embed__settings" type="button" data-consent-open>${escapeHtml(texts.placeholder_settings)}</button>` +
        '</div>' +
        '</div>'
    )
}
