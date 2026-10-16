import { load } from 'cheerio'
import {
    LOADING_ATTRIBUTES,
    inertStartTag,
    renderControls,
    renderPlaceholder,
    wrapperStart,
} from './placeholder.js'

// Issue decision 3 / slice 2, widened to media in step 8. Every iframe,
// `<embed>`, `<object>`, `<video>` and `<audio>` in a page's rendered
// `content` that loads from one of a service's `hosts` becomes the D2
// placeholder, its loading attributes inert (ROADMAP "Gated media"). The
// rewrite splices the original string at the parser's source offsets, so
// everything that is not a matched element stays byte-identical — cheerio
// never re-serialises the page.
//
// This is the legal floor's "nothing gated loads before consent": a gated
// element that slips through loads third-party content before consent. So
// matching errs towards gating: any subdomain matches, the host is compared
// the way a browser resolves it (case, trailing dot, protocol-relative URLs),
// and elements inside `<noscript>` and `<template>` are found too (parsed with
// scripting off, where `<noscript>` content is markup, not text). Where the
// parser still diverges from a browser (`<select><iframe …>`: parse5 drops
// the tag, a browser with customizable `<select>` keeps it), the raw-text
// scan `findLiveGatedEmbeds` catches what the rewrite missed, and
// `getMetaData` warns.

const PARSE_OPTIONS = { sourceCodeLocationInfo: true, scriptingEnabled: false }
const DUMMY_HOST = 'nera-consent.invalid'
const DUMMY_BASES = [`https://${DUMMY_HOST}/`, `http://${DUMMY_HOST}/`]

/**
 * The host a browser would request for `src`, lower-cased and without a
 * trailing dot, or `null` for a URL that cannot reach another host (relative,
 * root-absolute, `data:`, `about:` …). Resolved against a dummy origin so
 * protocol-relative `//host/…` URLs count.
 *
 * @param {string} src
 * @returns {string|null}
 */
export function srcHost(src) {
    if (typeof src !== 'string') return null
    // Both schemes: `https:host/x` is relative on an https page but reaches
    // `host` on an http one (and the other way round).
    for (const base of DUMMY_BASES) {
        let url
        try {
            url = new URL(src, base)
        } catch {
            return null
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        const host = url.hostname.replace(/\.$/, '')
        if (host !== DUMMY_HOST) return host
    }
    return null
}

/**
 * The `app.consent.hosts` entry gating `host`: an exact or subdomain match,
 * the most specific configured host first (`maps.google.com` beats
 * `google.com`), ties to the one configured first.
 *
 * @param {string|null} host
 * @param {{ category: string, service: string, host: string }[]} hosts
 */
export function matchHost(host, hosts) {
    if (!host) return null
    let best = null
    for (const entry of hosts) {
        if (host !== entry.host && !host.endsWith(`.${entry.host}`)) continue
        if (!best || entry.host.length > best.host.length) best = entry
    }
    return best
}

/** The elements the rewrite gates; `<source>` and `<track>` go with their media. */
const GATED_TAGS = ['iframe', 'embed', 'object', 'video', 'audio']
const MEDIA_TAGS = new Set(['video', 'audio'])
const MEDIA_CHILDREN = new Set(['source', 'track'])
const GATED_OPEN = new RegExp(`<(?:${GATED_TAGS.join('|')})`, 'i')

/** Cheap pre-check, so pages without a gateable element skip the parse. */
export function hasEmbed(content) {
    return typeof content === 'string' && GATED_OPEN.test(content)
}

// `hosts` and every locale come from the same `buildAppConsent` call, so the
// matched service is always there.
function findService(locale, { category, service }) {
    return locale.categories
        .find((c) => c.id === category)
        .services.find((s) => s.name === service)
}

/** The URLs of a `srcset`: the first token of every comma-separated candidate. */
const srcsetUrls = (value) =>
    value
        .split(',')
        .map((candidate) => candidate.trim().split(/\s+/)[0])
        .filter(Boolean)

/** Every URL `element` itself loads through a loading attribute, in attribute order. */
function loadingUrls(element) {
    const urls = []
    for (const name of LOADING_ATTRIBUTES[element.name]) {
        const value = element.attribs[name]
        if (value === undefined) continue
        if (name === 'srcset') urls.push(...srcsetUrls(value))
        else urls.push(value)
    }
    return urls
}

/** A media element's `<source>` and `<track>` children; none for other tags. */
const mediaChildren = (element) =>
    MEDIA_TAGS.has(element.name)
        ? element.children.filter((child) => child.type === 'tag' && MEDIA_CHILDREN.has(child.name))
        : []

/** The `hosts` entries `element` (with its media children) loads from, in source order. */
function gatedMatches(element, hosts) {
    return [element, ...mediaChildren(element)]
        .flatMap(loadingUrls)
        .map((url) => matchHost(srcHost(url), hosts))
        .filter(Boolean)
}

const depthOf = (element) => {
    let depth = 0
    for (let node = element.parent; node; node = node.parent) depth++
    return depth
}

/**
 * The splices that gate one matched element. An iframe is replaced whole
 * (its content is raw text, so nothing inside it is an element). Every other
 * element keeps its content: its start tag (and a media element's
 * `<source>` / `<track>` start tags) become inert, the wrapper opens before
 * it and the controls and the wrapper's end follow its end tag, so a gated
 * element in its fallback content gets splices of its own that never
 * overlap these.
 */
function gateElement(element, content, { category, service, texts }) {
    const location = element.sourceCodeLocation
    const { startOffset: start, startTag } = location

    if (element.name === 'iframe') {
        // An unclosed iframe runs to the end of the content (its rest is the
        // iframe's raw text, as in a browser); parse5 reports no end tag.
        const end = location.endTag ? location.endTag.endOffset : content.length
        const innerEnd = location.endTag ? location.endTag.startOffset : content.length
        return [{
            start,
            end,
            html: renderPlaceholder({
                category,
                src: element.attribs.src,
                service,
                texts,
                attributes: element.attribs,
                inner: content.slice(startTag.endOffset, innerEnd),
            }),
        }]
    }

    const opening = wrapperStart(category) + inertStartTag(element.name, element.attribs, category)
    const closing = renderControls({ service, texts }) + '</div>'
    if (element.name === 'embed') {
        // A void element: its start tag is all of it.
        return [{ start, end: startTag.endOffset, html: opening + closing }]
    }

    const splices = [{ start, end: startTag.endOffset, html: opening }]
    for (const child of mediaChildren(element)) {
        const tag = child.sourceCodeLocation.startTag
        splices.push({ start: tag.startOffset, end: tag.endOffset, html: inertStartTag(child.name, child.attribs) })
    }
    const endTag = `</${element.name}>`
    if (location.endTag) {
        splices.push({ start: location.endTag.startOffset, end: location.endTag.endOffset, html: endTag + closing })
    } else {
        // Unclosed: the end tag is inserted where the element ends. Nested
        // unclosed elements end at the same offset; the deepest closes first.
        const at = location.endOffset ?? content.length
        splices.push({ start: at, end: at, html: endTag + closing, order: -depthOf(element) })
    }
    return splices
}

/**
 * Rewrite the gated elements of one page. A gated URL is third-party by
 * definition, so it never gets `base_path`: a value like `/\host/x` reaches
 * `host` in a browser, and a prefix would break it (D8 serves hand-written
 * root-absolute sources in the Pug mixin only).
 *
 * An element loading from services of more than one category (a `<video>`
 * whose poster and source sit on differently categorised hosts) throws: one
 * `data-consent` cannot hold back the other category's host, and the legal
 * floor is not relaxed for a warning.
 *
 * @param {string} content rendered page HTML
 * @param {object} context
 * @param {{ category: string, service: string, host: string }[]} context.hosts
 *     `app.consent.hosts`
 * @param {object} context.locale `app.consent.locales[<page lang>]`
 * @returns {string} the rewritten HTML, or `content` itself when nothing
 *     matched
 * @throws {Error} on an element loading from more than one category
 */
export function rewriteEmbeds(content, { hosts, locale }) {
    if (!hasEmbed(content) || hosts.length === 0) return content

    const $ = load(content, PARSE_OPTIONS, false)
    const splices = []
    $(GATED_TAGS.join(', ')).each((_, element) => {
        const [match, ...others] = gatedMatches(element, hosts)
        if (!match) return

        const mixed = [...new Set(others.map((entry) => entry.category))].filter((id) => id !== match.category)
        if (mixed.length > 0) {
            throw new Error(`a <${element.name}> loads from services of the categories ${[match.category, ...mixed].join(', ')}; one consent category cannot gate it — split it into one element per category`)
        }
        splices.push(...gateElement(element, content, {
            category: match.category,
            service: findService(locale, match),
            texts: locale.texts,
        }))
    })

    if (splices.length === 0) return content
    // Front to back; splices never overlap (see `gateElement`), and only
    // the zero-length end of nested unclosed elements share an offset.
    splices.sort((a, b) => a.start - b.start || (a.order ?? 0) - (b.order ?? 0))
    let result = ''
    let position = 0
    for (const { start, end, html } of splices) {
        result += content.slice(position, start) + html
        position = end
    }
    return result + content.slice(position)
}

// A gateable start tag in raw text: quoted values may hold `>`. A quote
// opens a value only right after `=`, as in a browser; elsewhere (`title=a"b`)
// it is a literal and must not swallow the tags that follow.
const GATED_START_TAG = new RegExp(`<(${GATED_TAGS.join('|')})(?=[\\s/>])(?:=\\s*(?:"[^"]*"|'[^']*')|[^>])*>?`, 'gi')

/**
 * Every `<iframe`, `<embed`, `<object`, `<video` or `<audio` start tag in
 * `content`'s raw text that still loads from a gated host through one of its
 * own loading attributes — what a browser would load before consent. Run on
 * the rewritten page, so the rewrite's own inert elements never count. Each
 * tag is parsed on its own, so attributes read as a browser reads them
 * (entities decoded, the first of a duplicate wins). A raw scan also sees
 * tags in comments, scripts and an iframe's fallback text: it only feeds a
 * warning, never a rewrite. `<source>` and `<track>` are not scanned: outside
 * a gated media element (in a `<picture>`) they are not the rewrite's to gate.
 *
 * @param {string} content rendered (and rewritten) page HTML
 * @param {{ category: string, service: string, host: string }[]} hosts
 * @returns {{ tag: string, host: string }[]} one entry per tag, in source order
 */
export function findLiveGatedEmbeds(content, hosts) {
    if (!hasEmbed(content) || hosts.length === 0) return []
    const found = []
    for (const [raw, name] of content.matchAll(GATED_START_TAG)) {
        const tag = name.toLowerCase()
        const element = load(raw, PARSE_OPTIONS, false)(tag).get(0)
        if (!element) continue
        // One entry per tag: the first gated URL is enough to name it.
        const host = loadingUrls(element).map(srcHost).find((candidate) => matchHost(candidate, hosts))
        if (host) found.push({ tag, host })
    }
    return found
}
