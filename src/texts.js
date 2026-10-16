import { warn } from './warn.js'

// Built-in texts (ROADMAP "Texts"). They are defaults, not legal advice: a
// site owner reviews them like any other text on the site. `{service}` and
// `{provider}` in the placeholder texts are filled in per embed.

export const FALLBACK_LANG = 'en'

export const BUILTIN_TEXTS = {
    en: {
        banner_title: 'Cookies and external content',
        banner_text:
            'This site can load content and services from third parties. They only load if you agree. You can change your choice at any time in the settings.',
        accept_all: 'Accept all',
        reject_all: 'Reject all',
        settings: 'Settings',
        dialog_title: 'Privacy settings',
        dialog_text:
            'Choose which categories you agree to. Strictly necessary storage is always active.',
        save: 'Save selection',
        close: 'Close',
        necessary_label: 'Strictly necessary',
        necessary_description:
            'Required for the site to work, for example to remember your choice in this dialog. Always active.',
        always_active: 'Always active',
        service_provider: 'Provider',
        service_purpose: 'Purpose',
        service_privacy: 'Privacy policy of the provider',
        cookies_heading: 'Cookies',
        cookie_name: 'Name',
        cookie_duration: 'Duration',
        cookie_purpose: 'Purpose',
        notice_text: 'This site uses only technically necessary cookies.',
        notice_dismiss: 'Got it',
        placeholder_text:
            'This content is provided by {service}. Loading it connects to {provider}.',
        placeholder_load: 'Load {service}',
        placeholder_settings: 'Privacy settings',
        privacy_link: 'Privacy policy',
    },
    de: {
        banner_title: 'Cookies und externe Inhalte',
        banner_text:
            'Diese Website kann Inhalte und Dienste von Drittanbietern laden. Sie werden nur geladen, wenn Sie zustimmen. Ihre Auswahl können Sie jederzeit in den Einstellungen ändern.',
        accept_all: 'Alle akzeptieren',
        reject_all: 'Alle ablehnen',
        settings: 'Einstellungen',
        dialog_title: 'Datenschutz-Einstellungen',
        dialog_text:
            'Wählen Sie, welchen Kategorien Sie zustimmen. Technisch notwendige Speicherung ist immer aktiv.',
        save: 'Auswahl speichern',
        close: 'Schließen',
        necessary_label: 'Technisch notwendig',
        necessary_description:
            'Für den Betrieb der Website erforderlich, zum Beispiel um Ihre Auswahl in diesem Dialog zu speichern. Immer aktiv.',
        always_active: 'Immer aktiv',
        service_provider: 'Anbieter',
        service_purpose: 'Zweck',
        service_privacy: 'Datenschutzerklärung des Anbieters',
        cookies_heading: 'Cookies',
        cookie_name: 'Name',
        cookie_duration: 'Speicherdauer',
        cookie_purpose: 'Zweck',
        notice_text: 'Diese Website verwendet nur technisch notwendige Cookies.',
        notice_dismiss: 'Verstanden',
        placeholder_text:
            'Dieser Inhalt wird von {service} bereitgestellt. Beim Laden wird eine Verbindung zu {provider} hergestellt.',
        placeholder_load: '{service} laden',
        placeholder_settings: 'Datenschutz-Einstellungen',
        privacy_link: 'Datenschutzerklärung',
    },
}

export const TEXT_KEYS = Object.keys(BUILTIN_TEXTS.en)

// Labels and descriptions for the category ids most sites use. Any other id
// shows the id itself unless the category sets `label`.
export const BUILTIN_CATEGORIES = {
    en: {
        analytics: {
            label: 'Statistics',
            description: 'Help us understand how the site is used.',
        },
        media: {
            label: 'External media',
            description: 'Videos, maps and other content embedded from other providers.',
        },
        marketing: {
            label: 'Marketing',
            description: 'Used to show and measure advertising.',
        },
        functional: {
            label: 'Functional',
            description: 'Extra features provided by third parties.',
        },
    },
    de: {
        analytics: {
            label: 'Statistik',
            description: 'Helfen uns zu verstehen, wie die Website genutzt wird.',
        },
        media: {
            label: 'Externe Medien',
            description: 'Videos, Karten und andere Inhalte, die von anderen Anbietern eingebunden werden.',
        },
        marketing: {
            label: 'Marketing',
            description: 'Dienen dazu, Werbung anzuzeigen und zu messen.',
        },
        functional: {
            label: 'Funktional',
            description: 'Zusätzliche Funktionen von Drittanbietern.',
        },
    },
}

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * Resolve a localisable value (a string, or `{ <lang>: string }`) for `lang`:
 * the language, then `en`, then the map's first value (ROADMAP
 * "Configuration"). Values reaching here were validated by the config reader.
 *
 * @param {string|object|undefined|null} value
 * @param {string} lang
 * @returns {string|null}
 */
export function localize(value, lang) {
    if (value === undefined || value === null) return null
    if (typeof value === 'string') return value
    if (lang in value) return value[lang]
    if (FALLBACK_LANG in value) return value[FALLBACK_LANG]
    const first = Object.values(value)[0]
    return first === undefined ? null : first
}

/**
 * Built-in label and description of a category id in `lang` (falling back to
 * `en`), or `null` for an id without built-in texts.
 *
 * @param {string} id
 * @param {string} lang
 * @returns {{ label: string, description: string }|null}
 */
export function builtinCategory(id, lang) {
    return (
        BUILTIN_CATEGORIES[lang]?.[id] ||
        BUILTIN_CATEGORIES[FALLBACK_LANG][id] ||
        null
    )
}

/**
 * Every text key for one language, first hit wins (ROADMAP "Texts"):
 * `config/consent.yaml` `texts.<lang>.<key>` → `app.translations[<lang>]
 * ['consent.<key>']` → built-in `<lang>` → built-in `en`. A blank or
 * non-string translation is warned about and skipped, so no label — Reject
 * all's included — can be blanked out. (Config `texts` arrive validated.)
 *
 * @param {string} lang
 * @param {{ texts?: object, translations?: object }} [sources]
 * @returns {Record<string, string>}
 */
export function resolveTexts(lang, { texts = {}, translations } = {}) {
    const fromConfig = texts[lang] || {}
    const fromTranslations = isPlainObject(translations?.[lang]) ? translations[lang] : {}
    const builtin = BUILTIN_TEXTS[lang] || {}

    const resolved = {}
    for (const key of TEXT_KEYS) {
        const translationKey = `consent.${key}`
        let translated = null
        if (translationKey in fromTranslations) {
            const value = fromTranslations[translationKey]
            if (isText(value)) {
                translated = value
            } else {
                warn(`ignoring empty translations.${lang}["${translationKey}"]`)
            }
        }
        resolved[key] =
            fromConfig[key] ?? translated ?? builtin[key] ?? BUILTIN_TEXTS[FALLBACK_LANG][key]
    }
    return resolved
}
