import { withBasePath } from './app-consent.js'

// D2 — the one renderer of the two-click placeholder. The iframe rewrite
// (`getMetaData`) and the Pug embed mixin (slice 4) both call it, so the
// public-contract markup (ROADMAP "Gated iframes and the placeholder") exists
// once. The iframe is inert as rendered: no `src`, only `data-consent-src`.

// Attributes the renderer sets itself; a copy from the source iframe would
// duplicate or contradict them.
const OWN_ATTRIBUTES = new Set(['src', 'data-consent', 'data-consent-src', 'hidden'])

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }

/** Escape text for an HTML text node or a double-quoted attribute value. */
export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char])
}

const attribute = (name, value) =>
    value === '' ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`

/**
 * `placeholder_text` with `{service}` and `{provider}` filled in, escaped;
 * the provider is set in `<strong>`, since it is who the visitor connects to.
 */
function placeholderText(template, { service, provider }) {
    return template
        .split(/(\{service\}|\{provider\})/)
        .map((part) => {
            if (part === '{service}') return escapeHtml(service)
            if (part === '{provider}') return `<strong>${escapeHtml(provider)}</strong>`
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
 *     attributes, in order (`src`, `data-consent`, `data-consent-src` and
 *     `hidden` are ignored)
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

    const text = placeholderText(texts.placeholder_text, {
        service: service.name,
        provider: service.provider,
    })
    const privacy = service.privacyUrl
        ? `<a class="nera-consent-embed__privacy" href="${escapeHtml(service.privacyUrl)}" rel="noopener">${escapeHtml(texts.service_privacy)}</a>`
        : ''

    return (
        `<div class="nera-consent-embed" data-consent-embed data-consent="${escapeHtml(category)}">` +
        iframe +
        '<div class="nera-consent-embed__placeholder">' +
        `<p class="nera-consent-embed__text">${text}</p>` +
        `<button class="nera-consent-embed__load" type="button" data-consent-load>${escapeHtml(texts.placeholder_load)}</button>` +
        privacy +
        `<button class="nera-consent-embed__settings" type="button" data-consent-open>${escapeHtml(texts.placeholder_settings)}</button>` +
        '</div>' +
        '</div>'
    )
}
