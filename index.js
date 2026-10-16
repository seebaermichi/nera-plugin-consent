// @nera-static/plugin-consent — ROADMAP.md is the spec. The three hooks keep
// the shapes core expects (getAppData → plain object, getMetaData → array,
// getAssets → [{ from, to }]) and stay synchronous.

import path from 'path'
import { fileURLToPath } from 'url'
import { buildAppConsent } from './src/app-consent.js'
import { loadConfig } from './src/config.js'
import { assertCoreVersion, coreVersion } from './src/guard.js'
import { findLiveGatedEmbeds, rewriteEmbeds } from './src/rewrite.js'
import { warn } from './src/warn.js'

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets')

export const ASSET_FILES = [
    { file: 'consent.js', to: '_nera/consent.js' },
    { file: 'consent.css', to: '_nera/consent.css' },
]

/**
 * Adds `app.consent` from the site's `config/consent.yaml`, keeping every
 * other `app` key.
 *
 * @param {{ app: object, pagesData?: object[] }} data
 * @returns {object}
 */
export function getAppData({ app, pagesData }) {
    const config = loadConfig({ app })
    return { ...app, consent: buildAppConsent(config, { app, pagesData }) }
}

// How a warning names a page: core's `meta.href`, its output path.
const pageName = (page) => page.meta?.href || 'a page'

/**
 * Replaces every iframe, `<embed>`, `<object>`, `<video>` and `<audio>` that
 * loads from a host a service gates with the two-click placeholder (D2), in
 * the page's language, and warns about any gated element the rewrite could
 * not reach. Pages without such an element are returned as the same object.
 * Fails the build on a core too old to call `getAssets`, unless the site has
 * no consent UI at all (mode 'none').
 *
 * @param {{ app: object, pagesData: object[] }} data
 * @returns {object[]}
 */
export function getMetaData({ app, pagesData }) {
    // Core threads getAppData's result in; the fallback serves a caller that
    // skips it.
    const consent = app.consent || buildAppConsent(loadConfig({ app }), { app, pagesData })
    if (consent.mode !== 'none') assertCoreVersion(coreVersion())

    return pagesData.map((page) => {
        const lang = page.meta?.lang || app.lang
        const locale = consent.locales[lang] || consent.locales.en
        const onWarning = (message) => warn(`${pageName(page)}: ${message}`)
        let content
        try {
            content = rewriteEmbeds(page.content, { hosts: consent.hosts, locale })
        } catch (error) {
            throw new Error(`plugin-consent: ${pageName(page)}: ${error.message}`, { cause: error })
        }
        for (const { tag, host } of findLiveGatedEmbeds(content, consent.hosts)) {
            const mixin = tag === 'iframe' ? ', or place it with the +consent-embed mixin' : ''
            onWarning(`an <${tag}> from ${host} escaped the rewrite and may load before consent (inside <select>, or other markup the HTML parser reads differently) — move it out${mixin}`)
        }
        return content === page.content ? page : { ...page, content }
    })
}

/**
 * Ships the runtime: `consent.js` and `consent.css` to `public/_nera/`
 * (ROADMAP "Assets"), always, so the layout's links never point at missing
 * files.
 *
 * @returns {{ from: string, to: string }[]}
 */
export function getAssets() {
    return ASSET_FILES.map(({ file, to }) => ({ from: path.join(ASSETS, file), to }))
}
