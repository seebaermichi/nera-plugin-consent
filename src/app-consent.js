import { FALLBACK_LANG, builtinCategory, localize, resolveTexts } from './texts.js'
import { warn } from './warn.js'

// Builds `app.consent` from a normalized config (ROADMAP "`app.consent`").
// Everything a view or the runtime needs is resolved here, at build time, per
// language: texts, category labels, service fields, URLs with `base_path`.

export const STORAGE_KEY = 'nera-consent'

/**
 * Prefix a root-absolute URL with `base_path` (D8). Absolute, protocol-relative
 * and relative URLs are returned as they are; a value already under
 * `basePath` is not prefixed twice (same rule as core's `shouldPrefix`).
 *
 * @param {string|null} url
 * @param {string} basePath normalized, e.g. `/sub` or `''`
 * @returns {string|null}
 */
export function withBasePath(url, basePath) {
    if (!basePath || typeof url !== 'string') return url
    if (!url.startsWith('/') || url.startsWith('//')) return url
    if (url === basePath || url.startsWith(`${basePath}/`)) return url
    return `${basePath}${url}`
}

const mode = (config) => {
    if (config.categories.length > 0) return 'banner'
    return config.notice ? 'notice' : 'none'
}

/**
 * The languages the views can ask for: `app.lang`, every page's `meta.lang`,
 * every `texts` language, and always `en`, sorted for a deterministic output.
 */
function collectLanguages(config, app, pagesData) {
    const languages = new Set([FALLBACK_LANG, ...Object.keys(config.texts)])
    if (typeof app.lang === 'string' && app.lang !== '') languages.add(app.lang)
    for (const page of pagesData || []) {
        const lang = page?.meta?.lang
        if (typeof lang === 'string' && lang !== '') languages.add(lang)
    }
    return [...languages].sort()
}

function buildLocale(config, lang, { app, basePath }) {
    const privacyUrl = localize(config.privacy_url, lang)
    return {
        privacyUrl: withBasePath(privacyUrl, basePath),
        texts: resolveTexts(lang, { texts: config.texts, translations: app.translations }),
        categories: config.categories.map((category) => {
            const builtin = builtinCategory(category.id, lang)
            return {
                id: category.id,
                label: localize(category.label, lang) ?? builtin?.label ?? category.id,
                description: localize(category.description, lang) ?? builtin?.description ?? null,
                services: category.services.map((service) => ({
                    name: service.name,
                    provider: service.provider,
                    purpose: localize(service.purpose, lang),
                    privacyUrl: withBasePath(localize(service.privacy_url, lang), basePath),
                    cookies: service.cookies.map((cookie) => ({
                        name: cookie.name,
                        duration: localize(cookie.duration, lang),
                        purpose: localize(cookie.purpose, lang),
                    })),
                })),
            }
        }),
    }
}

/**
 * @param {object} config result of `normalizeConfig`
 * @param {{ app: object, pagesData?: object[] }} data
 * @returns {object} `app.consent`
 */
export function buildAppConsent(config, { app, pagesData }) {
    const basePath = typeof app.basePath === 'string' ? app.basePath : ''
    const consentMode = mode(config)

    if (consentMode !== 'none' && config.privacy_url === null) {
        warn('config/consent.yaml: privacy_url is not set, the banner will not link a privacy policy')
    }

    const languages = collectLanguages(config, app, pagesData)
    const locales = {}
    for (const lang of languages) {
        locales[lang] = buildLocale(config, lang, { app, basePath })
    }

    const scripts = []
    const hosts = []
    for (const category of config.categories) {
        for (const service of category.services) {
            for (const script of service.scripts) {
                const entry = { category: category.id, service: service.name }
                if ('src' in script) entry.src = withBasePath(script.src, basePath)
                else entry.inline = script.inline
                scripts.push({ ...entry, async: script.async, defer: script.defer, module: script.module })
            }
            for (const host of service.hosts) {
                hosts.push({ category: category.id, service: service.name, host })
            }
        }
    }

    return {
        mode: consentMode,
        revision: config.revision,
        storageKey: STORAGE_KEY,
        languages,
        locales,
        scripts,
        hosts,
    }
}
