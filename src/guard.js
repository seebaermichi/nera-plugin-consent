import { createRequire } from 'module'
import path from 'path'

// Issue decision 4. The runtime (`consent.js`, `consent.css`) reaches
// `public/_nera/` only through `getAssets`, which core calls from 4.13.0 on.
// On an older core the hook is never called: the layout's `<link>` and
// `<script>` point at missing files, no banner ever appears, gated content
// stays inert for good, and the build would still exit 0. So the plugin
// checks core's version and fails loudly instead (copied from
// plugin-code-blocks, its D7). `peerDependencies` reports the same at install
// time; this catches an install that ignored it.

export const REQUIRED_CORE = '4.13.0'

const parse = (version) => {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim())
    return match ? match.slice(1, 4).map(Number) : null
}

/**
 * True when `version` is at least `required` (major.minor.patch; a
 * prerelease suffix is ignored). False for anything unparseable.
 */
export function satisfies(version, required = REQUIRED_CORE) {
    const have = parse(version)
    const need = parse(required)
    if (!have || !need) return false
    for (let i = 0; i < 3; i++) {
        if (have[i] !== need[i]) return have[i] > need[i]
    }
    return true
}

/**
 * The version of `@nera-static/core` this build most likely runs on, or
 * `null` when it cannot be found. Resolved from the site root first, then from
 * the plugin's own location (a symlinked plugin resolves from its real path,
 * where its devDependency core would answer for the site's).
 *
 * @param {string} [cwd]
 */
export function coreVersion(cwd = process.cwd()) {
    const bases = [path.join(cwd, 'package.json'), import.meta.url]
    for (const base of bases) {
        try {
            return createRequire(base)('@nera-static/core/package.json').version
        } catch {
            // Try the next base.
        }
    }
    return null
}

/**
 * Throw when core is known to be older than `REQUIRED_CORE`. An unknown
 * version passes: some core is calling the plugin, and refusing on a guess
 * would block a working setup.
 *
 * @param {string|null} version
 */
export function assertCoreVersion(version) {
    if (version === null || satisfies(version)) return
    throw new Error(
        `plugin-consent: @nera-static/core ${version} is too old; the consent ` +
            `runtime needs >= ${REQUIRED_CORE} (the getAssets hook). ` +
            'Update with `npm update @nera-static/nera` (or `@nera-static/core`).'
    )
}
