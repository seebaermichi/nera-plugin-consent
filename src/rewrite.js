import { load } from 'cheerio'
import { renderPlaceholder } from './placeholder.js'

// Issue decision 3 / slice 2. Every iframe in a page's rendered `content`
// whose `src` host is one of a service's `hosts` becomes the D2 placeholder.
// The rewrite splices the original string at the parser's source offsets, so
// everything that is not a matched iframe stays byte-identical — cheerio never
// re-serialises the page.
//
// This is the legal floor's "no gated iframe gets a live src": a gated iframe
// that slips through loads third-party content before consent. So matching
// errs towards gating: any subdomain matches, the host is compared the way a
// browser resolves it (case, trailing dot, protocol-relative URLs), and
// iframes inside `<noscript>` and `<template>` are found too (parsed with
// scripting off, where `<noscript>` content is markup, not text).

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

/** Cheap pre-check, so pages without an iframe skip the parse. */
export function hasIframe(content) {
    return typeof content === 'string' && /<iframe/i.test(content)
}

// `hosts` and every locale come from the same `buildAppConsent` call, so the
// matched service is always there.
function findService(locale, { category, service }) {
    return locale.categories
        .find((c) => c.id === category)
        .services.find((s) => s.name === service)
}

/**
 * Rewrite the gated iframes of one page.
 *
 * @param {string} content rendered page HTML
 * @param {object} context
 * @param {{ category: string, service: string, host: string }[]} context.hosts
 *     `app.consent.hosts`
 * @param {object} context.locale `app.consent.locales[<page lang>]`
 * @param {string} [context.basePath]
 * @returns {string} the rewritten HTML, or `content` itself when no iframe
 *     matched
 */
export function rewriteIframes(content, { hosts, locale, basePath = '' }) {
    if (!hasIframe(content) || hosts.length === 0) return content

    const $ = load(content, PARSE_OPTIONS, false)
    const edits = []
    $('iframe').each((_, element) => {
        const match = matchHost(srcHost(element.attribs.src), hosts)
        if (!match) return

        const service = findService(locale, match)
        const location = element.sourceCodeLocation
        const start = location.startOffset
        // An unclosed iframe runs to the end of the content (its rest is the
        // iframe's raw text, as in a browser); parse5 reports no end tag.
        const end = location.endTag ? location.endTag.endOffset : content.length
        const innerStart = location.startTag.endOffset
        const innerEnd = location.endTag ? location.endTag.startOffset : content.length

        edits.push({
            start,
            end,
            html: renderPlaceholder({
                category: match.category,
                src: element.attribs.src,
                service,
                texts: locale.texts,
                attributes: element.attribs,
                inner: content.slice(innerStart, innerEnd),
                basePath,
            }),
        })
    })

    if (edits.length === 0) return content
    let result = content
    // Back to front, so earlier offsets stay valid. Iframes cannot nest
    // (their content is raw text), so the ranges never overlap.
    for (const { start, end, html } of edits.sort((a, b) => b.start - a.start)) {
        result = result.slice(0, start) + html + result.slice(end)
    }
    return result
}
