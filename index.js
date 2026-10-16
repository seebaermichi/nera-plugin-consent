// @nera-static/plugin-consent — ROADMAP.md is the spec. The three hooks keep
// the shapes core expects (getAppData → plain object, getMetaData → array,
// getAssets → [{ from, to }]) and stay synchronous.

import path from 'path'
import { fileURLToPath } from 'url'
import { buildAppConsent } from './src/app-consent.js'
import { loadConfig } from './src/config.js'
import { assertCoreVersion, coreVersion } from './src/guard.js'
import { rewriteIframes } from './src/rewrite.js'

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

/**
 * Replaces every iframe whose host a service gates with the two-click
 * placeholder (D2), in the page's language. Pages without such an iframe are
 * returned as the same object. Fails the build on a core too old to call
 * `getAssets`, unless the site has no consent UI at all (mode 'none').
 *
 * @param {{ app: object, pagesData: object[] }} data
 * @returns {object[]}
 */
export function getMetaData({ app, pagesData }) {
    // Core threads getAppData's result in; the fallback serves a caller that
    // skips it.
    const consent = app.consent || buildAppConsent(loadConfig({ app }), { app, pagesData })
    if (consent.mode !== 'none') assertCoreVersion(coreVersion())

    const basePath = typeof app.basePath === 'string' ? app.basePath : ''
    return pagesData.map((page) => {
        const lang = page.meta?.lang || app.lang
        const locale = consent.locales[lang] || consent.locales.en
        const content = rewriteIframes(page.content, { hosts: consent.hosts, locale, basePath })
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
