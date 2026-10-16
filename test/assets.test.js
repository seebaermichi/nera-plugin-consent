import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// The default colours are the fallbacks of the `--nera-consent-*` properties
// in assets/consent.css. Each property must use one fallback everywhere, and
// every text/background pair must reach WCAG 1.4.3's 4.5:1 (1.4.11's 3:1 for
// the focus ring and borders).

const CSS = fs.readFileSync(path.resolve('assets/consent.css'), 'utf8')

/** `{ name: [fallback, …] }` for every `var(--nera-consent-<name>, <fallback>)`. */
function fallbacks(css) {
    const found = {}
    for (const [, name, fallback] of css.matchAll(/var\(--nera-consent-([a-z-]+),\s*([^()]+(?:\([^()]*\))?)\)/g)) {
        if (!found[name]) found[name] = new Set()
        found[name].add(fallback.trim())
    }
    return found
}

const DEFAULTS = Object.fromEntries(
    Object.entries(fallbacks(CSS)).map(([name, values]) => [name, [...values][0]])
)

function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16) / 255)
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (light + 0.05) / (dark + 0.05)
}

const TEXT_PAIRS = [
    ['fg', 'bg'],
    ['link', 'bg'],
    ['button-fg', 'button-bg'],
    ['placeholder-fg', 'placeholder-bg'],
    ['placeholder-link', 'placeholder-bg'],
]

const NON_TEXT_PAIRS = [
    ['focus', 'bg'],
    ['focus', 'placeholder-bg'],
    ['border', 'bg'],
    ['button-bg', 'bg'],
    ['button-bg', 'placeholder-bg'],
]

describe('assets/consent.css', () => {
    it('gives every custom property one fallback', () => {
        for (const [name, values] of Object.entries(fallbacks(CSS))) {
            expect([name, values.size]).toEqual([name, 1])
        }
    })

    it.each(TEXT_PAIRS)('text %s on %s reaches 4.5:1', (fg, bg) => {
        expect(DEFAULTS[fg]).toMatch(/^#[0-9a-f]{6}$/)
        expect(DEFAULTS[bg]).toMatch(/^#[0-9a-f]{6}$/)
        expect(contrast(DEFAULTS[fg], DEFAULTS[bg])).toBeGreaterThanOrEqual(4.5)
    })

    it.each(NON_TEXT_PAIRS)('%s against %s reaches 3:1', (fg, bg) => {
        expect(contrast(DEFAULTS[fg], DEFAULTS[bg])).toBeGreaterThanOrEqual(3)
    })

    it('styles the three first-layer buttons alike: one class, no modifier (D6)', () => {
        expect(CSS).toMatch(/\.nera-consent__button\b/)
        expect(CSS).not.toMatch(/\.nera-consent__button--/)
        expect(Object.keys(DEFAULTS).filter((name) => /accept|reject/.test(name))).toEqual([])
    })

    it('turns the reserved height into body padding and scroll padding (WCAG 2.4.11)', () => {
        expect(CSS).toMatch(/html\[data-consent-reserve\] \{\s*scroll-padding-bottom: var\(--nera-consent-banner-height, 0px\);/)
        expect(CSS).toMatch(/html\[data-consent-reserve\] body \{\s*padding-bottom: var\(--nera-consent-banner-height, 0px\);/)
    })

    it('lets the hidden attribute win over author display rules', () => {
        expect(CSS).toMatch(/\.nera-consent\[hidden\][^{]*\{\s*display: none !important;/)
    })
})

describe('assets/consent.js', () => {
    it('uses the storage key app.consent documents', async () => {
        const { STORAGE_KEY } = await import('../src/app-consent.js')
        expect(fs.readFileSync(path.resolve('assets/consent.js'), 'utf8')).toContain(`const STORAGE_KEY = '${STORAGE_KEY}'`)
    })
})
