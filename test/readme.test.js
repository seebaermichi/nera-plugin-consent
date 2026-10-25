import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// The README is the public spec. These tests keep it from drifting from the
// code: the theming table must list every `--nera-consent-*` property of
// assets/consent.css with its real default.

const README = fs.readFileSync(path.resolve('README.md'), 'utf8')
const CSS = fs.readFileSync(path.resolve('assets/consent.css'), 'utf8')

/** The text under `heading` up to the next heading of the same or a higher level. */
function section(markdown, heading) {
    const level = heading.match(/^#+/)[0].length
    const lines = markdown.split('\n')
    const start = lines.indexOf(heading)
    if (start === -1) throw new Error(`heading not found: ${heading}`)
    const end = lines.findIndex(
        (line, index) => index > start && /^#+ /.test(line) && line.match(/^#+/)[0].length <= level
    )
    return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

/** `{ name: fallback }` for every `var(--nera-consent-<name>, <fallback>)`. */
function cssDefaults(css) {
    const found = {}
    for (const [, name, fallback] of css.matchAll(/var\(--nera-consent-([a-z-]+),\s*([^()]+(?:\([^()]*\))?)\)/g)) {
        found[name] = fallback.trim()
    }
    return found
}

describe('README theming table', () => {
    const theming = section(README, '## Theming')
    const rows = Object.fromEntries(
        [...theming.matchAll(/^\| `--nera-consent-([a-z-]+)` \| `([^`]+)` \|/gm)].map(([, name, value]) => [name, value])
    )
    const defaults = cssDefaults(CSS)

    it('finds the properties at all', () => {
        expect(Object.keys(defaults).length).toBeGreaterThan(10)
    })

    it.each(Object.keys(defaults))('lists --nera-consent-%s with its CSS default', (name) => {
        expect(rows[name]).toBe(defaults[name])
    })

    it('lists no property the stylesheet does not use', () => {
        expect(Object.keys(rows).sort()).toEqual(Object.keys(defaults).sort())
    })
})

describe('no compliance claim', () => {
    const CLAIM = /(dsgvo|gdpr|ttdsg|tdddg|eprivacy)[- ]?(konform|compliant)|rechtssicher|abmahnsicher|fully compliant|guarantees? compliance/i
    const shipped = ['README.md', 'CHANGELOG.md', 'config/consent.yaml', 'src/texts.js']

    it.each(shipped)('%s claims no compliance', (file) => {
        expect(fs.readFileSync(path.resolve(file), 'utf8')).not.toMatch(CLAIM)
    })

    it('README says the texts are defaults, not legal advice', () => {
        expect(README).toContain('defaults, not legal advice')
    })
})
