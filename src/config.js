import path from 'path'
import { getConfig } from '@nera-static/plugin-utils'
import { TEXT_KEYS } from './texts.js'
import { warn } from './warn.js'

// `config/consent.yaml` is optional and every key has a fallback (ROADMAP
// "Configuration"). `getConfig` returns `{}` for a missing file, which is a
// valid site: no categories → notice mode. A bad value warns and falls back
// (or the entry is dropped); it never fails the build.
//
// The legal floor shapes what is NOT read here (D6): there is no key that
// pre-selects a category, lists or switches off `necessary`, or touches the
// first layer's buttons. Such keys are unknown keys — warned about, ignored.

const FILE = 'config/consent.yaml'
export const RESERVED_CATEGORY = 'necessary'
const CATEGORY_ID = /^[a-z][a-z0-9-]*$/
// A bare host name: labels of letters, digits and hyphens, dot-separated.
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/
const SCRIPT_FLAGS = ['async', 'defer', 'module']

// Google Consent Mode v2 (ROADMAP "Google Consent Mode"). The signal names
// gtag.js knows, in Google's documented order; the first four are the ones
// Consent Mode v2 requires, so the `default` call always lists them.
export const GOOGLE_SIGNALS = [
    'ad_storage',
    'ad_user_data',
    'ad_personalization',
    'analytics_storage',
    'functionality_storage',
    'personalization_storage',
    'security_storage',
]
export const GOOGLE_REQUIRED_SIGNALS = GOOGLE_SIGNALS.slice(0, 4)
// `google_consent_mode: true` maps these categories, as far as the site
// configures them.
export const GOOGLE_DEFAULT_MAPPING = {
    analytics: ['analytics_storage'],
    marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
}

export function defaults() {
    return {
        revision: 1,
        privacy_url: null,
        notice: true,
        categories: [],
        texts: {},
        google_consent_mode: false,
    }
}

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const isText = (value) => typeof value === 'string' && value.trim() !== ''

const show = (value) => JSON.stringify(value)

function bad(key, value, fallback) {
    warn(`${FILE}: invalid ${key} ${show(value)}, using ${show(fallback)}`)
    return fallback
}

function unknown(where, key) {
    warn(`${FILE}: ignoring unknown key ${where}${show(key)}`)
}

/**
 * A localisable value is non-blank text or a non-empty map of language →
 * non-blank text. Returns the value, or `undefined` when it is not one.
 */
function readLocalisable(value) {
    if (isText(value)) return value
    if (!isPlainObject(value)) return undefined
    const entries = Object.entries(value)
    if (entries.length === 0 || !entries.every(([, text]) => isText(text))) return undefined
    return { ...value }
}

/** Optional localisable `key` of `entry`: `undefined` when absent, warned when bad. */
function optionalLocalisable(entry, key, where) {
    if (entry[key] === undefined || entry[key] === null) return undefined
    const value = readLocalisable(entry[key])
    if (value === undefined) warn(`${FILE}: ignoring invalid ${where}.${key} ${show(entry[key])}`)
    return value
}

function readKeys(entry, allowed, where) {
    for (const key of Object.keys(entry)) {
        if (!allowed.includes(key)) unknown(`${where}.`, key)
    }
}

function readCookie(raw, where) {
    if (!isPlainObject(raw) || !isText(raw.name)) {
        warn(`${FILE}: dropping ${where}, a cookie needs a name`)
        return null
    }
    readKeys(raw, ['name', 'duration', 'purpose'], where)
    return {
        name: raw.name,
        duration: optionalLocalisable(raw, 'duration', where),
        purpose: optionalLocalisable(raw, 'purpose', where),
    }
}

function readHost(raw, where) {
    const host = typeof raw === 'string' ? raw.trim().toLowerCase() : raw
    if (typeof host !== 'string' || !HOST.test(host)) {
        warn(`${FILE}: dropping ${where} ${show(raw)}, expected a bare host name like youtube.com`)
        return null
    }
    return host
}

function readScript(raw, where) {
    if (!isPlainObject(raw)) {
        warn(`${FILE}: dropping ${where}, expected a mapping with src or inline`)
        return null
    }
    const hasSrc = isText(raw.src)
    const hasInline = isText(raw.inline)
    if (hasSrc === hasInline) {
        warn(`${FILE}: dropping ${where}, it needs exactly one of src or inline`)
        return null
    }
    readKeys(raw, ['src', 'inline', ...SCRIPT_FLAGS], where)

    const script = hasSrc ? { src: raw.src.trim() } : { inline: raw.inline }
    for (const flag of SCRIPT_FLAGS) {
        const value = raw[flag]
        if (value === undefined || value === null) {
            script[flag] = false
        } else if (typeof value === 'boolean') {
            script[flag] = value
        } else {
            script[flag] = bad(`${where}.${flag}`, value, false)
        }
    }
    return script
}

function readList(raw, where, readItem) {
    if (raw === undefined || raw === null) return []
    if (!Array.isArray(raw)) {
        warn(`${FILE}: ignoring ${where}, expected a list`)
        return []
    }
    return raw.map((item, i) => readItem(item, `${where}[${i}]`)).filter((item) => item !== null)
}

function readService(raw, where) {
    if (!isPlainObject(raw)) {
        warn(`${FILE}: dropping ${where}, expected a mapping`)
        return null
    }
    const purpose = readLocalisable(raw.purpose)
    const missing = []
    if (!isText(raw.name)) missing.push('name')
    if (!isText(raw.provider)) missing.push('provider')
    if (purpose === undefined) missing.push('purpose')
    if (missing.length > 0) {
        warn(`${FILE}: dropping ${where}, missing or invalid ${missing.join(', ')}`)
        return null
    }
    readKeys(
        raw,
        ['name', 'provider', 'purpose', 'privacy_url', 'cookies', 'hosts', 'scripts'],
        where
    )

    return {
        name: raw.name,
        provider: raw.provider,
        purpose,
        privacy_url: optionalLocalisable(raw, 'privacy_url', where),
        cookies: readList(raw.cookies, `${where}.cookies`, readCookie),
        hosts: [...new Set(readList(raw.hosts, `${where}.hosts`, readHost))],
        scripts: readList(raw.scripts, `${where}.scripts`, readScript),
    }
}

function readCategories(raw) {
    if (!Array.isArray(raw)) {
        warn(`${FILE}: ignoring categories, expected a list`)
        return []
    }

    const seen = new Set()
    const categories = []
    raw.forEach((entry, i) => {
        const where = `categories[${i}]`
        if (!isPlainObject(entry) || typeof entry.id !== 'string' || !CATEGORY_ID.test(entry.id)) {
            warn(`${FILE}: dropping ${where}, it needs an id like "media" ([a-z][a-z0-9-]*)`)
            return
        }
        const { id } = entry
        if (id === RESERVED_CATEGORY) {
            warn(
                `${FILE}: dropping category "${RESERVED_CATEGORY}", it is implicit and always on`
            )
            return
        }
        if (seen.has(id)) {
            warn(`${FILE}: dropping ${where}, duplicate category id "${id}"`)
            return
        }
        // Keys like `default`, `enabled` or `checked` land here: nothing is
        // ever pre-selected (legal floor).
        readKeys(entry, ['id', 'label', 'description', 'services'], where)

        const services = readList(entry.services, `${where}.services`, readService)
        if (services.length === 0) {
            warn(`${FILE}: dropping category "${id}", it has no valid services`)
            return
        }
        seen.add(id)
        categories.push({
            id,
            label: optionalLocalisable(entry, 'label', where),
            description: optionalLocalisable(entry, 'description', where),
            services,
        })
    })
    return categories
}

function readTexts(raw, fallback) {
    if (!isPlainObject(raw)) return bad('texts', raw, fallback)

    const texts = {}
    for (const [lang, set] of Object.entries(raw)) {
        if (!isPlainObject(set)) {
            warn(`${FILE}: ignoring texts.${lang}, expected a mapping`)
            continue
        }
        texts[lang] = {}
        for (const [key, text] of Object.entries(set)) {
            if (!TEXT_KEYS.includes(key)) {
                unknown(`texts.${lang}.`, key)
            } else if (!isText(text)) {
                warn(`${FILE}: ignoring empty texts.${lang}.${key}`)
            } else {
                texts[lang][key] = text
            }
        }
    }
    return texts
}

/**
 * First pass over `google_consent_mode`: the shape only. Categories are
 * checked once every key is read (`resolveGoogle`), since YAML key order is
 * the author's. Returns `false` (off), `true` (default mapping) or the raw
 * `signals` map.
 */
function readGoogle(value, fallback) {
    if (typeof value === 'boolean') return value
    if (!isPlainObject(value)) return bad('google_consent_mode', value, fallback)
    readKeys(value, ['signals'], 'google_consent_mode')
    if (value.signals === undefined || value.signals === null) return true
    if (!isPlainObject(value.signals)) {
        return bad('google_consent_mode.signals', value.signals, fallback)
    }
    return { ...value.signals }
}

function readGoogleSignals(raw, where) {
    const list = Array.isArray(raw) ? raw : [raw]
    const signals = []
    for (const signal of list) {
        if (!GOOGLE_SIGNALS.includes(signal)) {
            warn(
                `${FILE}: ignoring unknown Consent Mode signal ${show(signal)} in ${where},` +
                    ` expected one of ${GOOGLE_SIGNALS.join(', ')}`
            )
        } else if (!signals.includes(signal)) {
            signals.push(signal)
        }
    }
    return signals
}

/**
 * Second pass: map each configured category to its signals, in category
 * order. A reserved or unconfigured category and an unknown signal warn and
 * are dropped; a signal already mapped by an earlier category too, so each
 * signal has exactly one category. Nothing left → off, with a warning.
 *
 * @returns {false|{ signals: Object<string, string[]> }}
 */
function resolveGoogle(value, categories) {
    if (value === false) return false
    const where = 'google_consent_mode.signals'
    const requested = value === true ? GOOGLE_DEFAULT_MAPPING : value
    const configured = new Set(categories.map((category) => category.id))

    if (value !== true) {
        for (const id of Object.keys(requested)) {
            if (id === RESERVED_CATEGORY) {
                warn(`${FILE}: ignoring ${where}.${id}, "${RESERVED_CATEGORY}" grants nothing to Google`)
            } else if (!configured.has(id)) {
                warn(`${FILE}: ignoring ${where}.${id}, there is no category "${id}"`)
            }
        }
    }

    const taken = new Set()
    const signals = {}
    for (const { id } of categories) {
        if (!Object.hasOwn(requested, id)) continue
        const own = readGoogleSignals(requested[id], `${where}.${id}`).filter((signal) => {
            if (!taken.has(signal)) return true
            warn(`${FILE}: ignoring ${signal} in ${where}.${id}, an earlier category maps it`)
            return false
        })
        own.forEach((signal) => taken.add(signal))
        if (own.length > 0) signals[id] = own
    }

    if (Object.keys(signals).length === 0) {
        warn(`${FILE}: google_consent_mode is off, no configured category maps to a Consent Mode signal`)
        return false
    }
    return { signals }
}

const readers = {
    revision: (value, fallback) =>
        Number.isInteger(value) && value >= 1 ? value : bad('revision', value, fallback),
    privacy_url: (value, fallback) => readLocalisable(value) ?? bad('privacy_url', value, fallback),
    notice: (value, fallback) => (typeof value === 'boolean' ? value : bad('notice', value, fallback)),
    categories: readCategories,
    texts: readTexts,
    google_consent_mode: readGoogle,
}

/**
 * Merge a raw config object over the defaults, key by key, with validation.
 * Pure apart from warnings; `normalizeConfig({})` is the full default config.
 *
 * @param {object} raw parsed `config/consent.yaml`
 * @returns {object} complete, validated config
 */
export function normalizeConfig(raw) {
    const config = defaults()
    if (raw === null || raw === undefined) return config
    if (!isPlainObject(raw)) {
        warn(`${FILE}: expected a mapping at the top level, using defaults`)
        return config
    }

    for (const [key, value] of Object.entries(raw)) {
        const read = readers[key]
        if (!read) {
            unknown('', key)
            continue
        }
        // A key present but empty reads as null; treat it like an absent key.
        if (value === null) continue
        config[key] = read(value, config[key])
    }

    if (config.notice === false && config.categories.length > 0) {
        warn(`${FILE}: ignoring notice: false, the site has categories and shows the banner`)
        config.notice = true
    }
    config.google_consent_mode = resolveGoogle(config.google_consent_mode, config.categories)
    return config
}

/**
 * Read and normalize the site's `config/consent.yaml`. Called inside the hook,
 * not at module scope, so each build (and each test) sees the current file.
 *
 * @param {{ cwd?: string, app?: object }} [options] `app.folders.config` is
 *     honoured when set, like the rest of the pipeline
 */
export function loadConfig({ cwd = process.cwd(), app } = {}) {
    const folder = app?.folders?.config || 'config'
    return normalizeConfig(getConfig(path.resolve(cwd, folder, 'consent.yaml')))
}
