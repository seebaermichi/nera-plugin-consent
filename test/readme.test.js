import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// The README documents usage; ROADMAP.md stays the spec. These tests keep the
// two from drifting where the README repeats the spec: the theming table must
// list every `--nera-consent-*` property of assets/consent.css with its real
// default, and the markup contract, JS API and storage format must be copied
// from the ROADMAP verbatim.

const README = fs.readFileSync(path.resolve('README.md'), 'utf8')
const ROADMAP = fs.readFileSync(path.resolve('ROADMAP.md'), 'utf8')
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

/** Every fenced code block in `markdown`, fences included. */
function codeBlocks(markdown) {
    return [...markdown.matchAll(/^```[a-z]*\n[\s\S]*?^```$/gm)].map(([block]) => block)
}

/** Every Markdown table in `markdown`, as one string per table. */
function tables(markdown) {
    return [...markdown.matchAll(/(?:^\|.*\|$\n?)+/gm)].map(([table]) => table.trimEnd())
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

describe('README markup contract matches the ROADMAP', () => {
    const contract = section(ROADMAP, '## Markup contract')
    const readmeContract = section(README, '## Markup contract')

    it('copies the gated script examples and their rules', () => {
        const gated = section(contract, '### Gated scripts')
        const [example] = codeBlocks(gated)
        const rules = gated.match(/^- [\s\S]*?(?=\n\n)/m)[0]
        expect(readmeContract).toContain(example)
        expect(readmeContract).toContain(rules)
    })

    it('copies the placeholder markup', () => {
        const [placeholder] = codeBlocks(section(contract, '### Gated iframes and the placeholder (D2)'))
        expect(readmeContract).toContain(placeholder)
    })

    it('copies the runtime hooks table', () => {
        const [hooks] = tables(section(contract, '### Runtime hooks (D7)'))
        expect(hooks.split('\n').length).toBeGreaterThan(10)
        expect(readmeContract).toContain(hooks)
    })

    it('copies the public JS API table and the storage format', () => {
        const [api] = tables(section(ROADMAP, '## Public JS API — `window.neraConsent`'))
        const [storage] = codeBlocks(section(ROADMAP, '## Storage format'))
        expect(README).toContain(api)
        expect(README).toContain(storage)
    })
})

describe('no compliance claim', () => {
    const CLAIM = /(dsgvo|gdpr|ttdsg|tdddg|eprivacy)[- ]?(konform|compliant)|rechtssicher|abmahnsicher|fully compliant|guarantees? compliance/i
    const shipped = ['README.md', 'ROADMAP.md', 'CHANGELOG.md', 'config/consent.yaml', 'src/texts.js']

    it.each(shipped)('%s claims no compliance', (file) => {
        expect(fs.readFileSync(path.resolve(file), 'utf8')).not.toMatch(CLAIM)
    })

    it('README says the texts are defaults, not legal advice', () => {
        expect(README).toContain('defaults, not legal advice')
    })
})
