// @nera-static/plugin-consent — ROADMAP.md is the spec. The three hooks keep
// the shapes core expects (getAppData → plain object, getMetaData → array,
// getAssets → [{ from, to }]) and stay synchronous.

import { buildAppConsent } from './src/app-consent.js'
import { loadConfig } from './src/config.js'

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
 * Rewrites gated iframes in `content` (slice 2). For now returns the pages
 * unchanged.
 *
 * @param {{ pagesData: object[] }} data
 * @returns {object[]}
 */
export function getMetaData({ pagesData }) {
    return pagesData
}

/**
 * Ships `consent.{js,css}` to `public/_nera/` (slice 2). For now ships
 * nothing.
 *
 * @returns {{ from: string, to: string }[]}
 */
export function getAssets() {
    return []
}
