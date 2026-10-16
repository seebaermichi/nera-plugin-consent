// @nera-static/plugin-consent — ROADMAP.md is the spec. Slice 0 only
// scaffolds the package: the three hooks exist with the shapes core expects
// (getAppData → plain object, getMetaData → array, getAssets → [{ from, to }])
// and change nothing yet. Slices 1–2 fill them in.

/**
 * Adds `app.consent` (slice 1). For now returns `app` unchanged.
 *
 * @param {{ app: object }} data
 * @returns {object}
 */
export function getAppData({ app }) {
    return { ...app }
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
