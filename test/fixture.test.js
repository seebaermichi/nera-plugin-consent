import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { load } from 'cheerio'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import run from '@nera-static/core'
import { validateOutput } from '@nera-static/validate'

// The fixture site (test/fixture/) uses every view (ROADMAP slice 4, D5): a
// copy in a temp dir gets the views through the real `publish-template` bin,
// builds through core's `run()`, and passes `validateOutput` — the check
// behind `nera build --check` — with no `a11y-*` finding. The one
// `privacy-third-party` finding is the map the fixture leaves ungated on
// purpose. A second build of the same site without categories covers the
// info notice.

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(here, 'fixture')
const pluginEntry = path.resolve(here, '../index.js')
const publishTemplate = path.resolve(here, '../bin/publish-template.js')

const write = (file, content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
}

/**
 * Copy the fixture into a temp dir, apply `overrides` (path → content, or
 * `null` to delete), publish the views and build it.
 */
async function buildFixture(overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nera-consent-fixture-'))
    fs.cpSync(FIXTURE, root, { recursive: true })
    for (const [rel, content] of Object.entries(overrides)) {
        if (content === null) fs.rmSync(path.join(root, rel))
        else write(path.join(root, rel), content)
    }
    write(path.join(root, 'plugins', 'consent', 'index.js'), `export * from '${pathToFileURL(pluginEntry).href}'\n`)
    execFileSync(process.execPath, [publishTemplate], { cwd: root, encoding: 'utf-8' })

    const prev = process.cwd()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.chdir(root)
    try {
        await run({
            folders: {
                config: path.join(root, 'config'),
                pages: path.join(root, 'pages'),
                views: path.join(root, 'views'),
                assets: path.join(root, 'assets'),
                dist: path.join(root, 'public'),
                plugins: path.join(root, 'plugins'),
            },
        })
        return { root, warnings: warn.mock.calls.map((call) => call.join(' ')) }
    } finally {
        process.chdir(prev)
        log.mockRestore()
        warn.mockRestore()
    }
}

const read = (root, rel) => fs.readFileSync(path.join(root, 'public', rel), 'utf-8')

const findings = (root, prefix) =>
    validateOutput({ cwd: root }).filter((finding) => finding.rule.startsWith(prefix))

describe('the fixture site in banner mode', () => {
    let root
    let warnings

    beforeAll(async () => {
        ;({ root, warnings } = await buildFixture())
    }, 60_000)

    afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

    it('builds without warnings', () => {
        expect(warnings).toEqual([])
    })

    it('publishes every view to views/vendor/plugin-consent/', () => {
        expect(fs.readdirSync(path.join(root, 'views', 'vendor', 'plugin-consent')).sort()).toEqual([
            'banner.pug',
            'embed.pug',
            'head.pug',
            'notice.pug',
            'settings.pug',
        ])
    })

    it('has no a11y-* finding', () => {
        expect(findings(root, 'a11y-')).toEqual([])
    })

    it('reports privacy-third-party only for the deliberately ungated map', () => {
        const hits = findings(root, 'privacy-third-party')
        expect(hits.map((hit) => hit.file)).toEqual(['public/index.html'])
        expect(hits[0].message).toContain('maps.example.org')
        expect(JSON.stringify(hits)).not.toMatch(/youtube|stats\.example\.com/)
    })

    it('renders every page with nothing gated live', () => {
        for (const page of ['index.html', 'hand-placed.html', 'privacy.html', 'de/index.html']) {
            const $ = load(read(root, page))
            expect($('script[data-consent]').length).toBe(2)
            $('script[data-consent]').each((_, el) => expect($(el).attr('type')).toBe('text/plain'))
            expect($('script[data-consent][src]')).toHaveLength(0)
            expect($('iframe[data-consent][src]')).toHaveLength(0)
            expect($('[data-consent-banner]').attr('hidden')).toBeDefined()
            expect($('[data-consent-notice]')).toHaveLength(0)
        }
    })

    it('keeps the inline gated script intact through the build', () => {
        const $ = load(read(root, 'index.html'))
        const inline = $('script[data-consent]:not([data-src])')
        expect(inline.text()).toContain(
            'concat(\'<\\/script> & <\\!-- stays inside\')'
        )
    })

    it('renders the hand-placed mixin embed like a rewritten one', () => {
        const $ = load(read(root, 'hand-placed.html'))
        const iframe = $('[data-consent-embed] iframe')
        expect(iframe.attr('data-consent-src')).toBe('https://www.youtube-nocookie.com/embed/hand')
        expect(iframe.attr('title')).toBe('A hand-placed video')
        expect($('[data-consent-embed] [data-consent-load]').text()).toBe('Load YouTube')
    })

    it('renders the views in the page language', () => {
        const $ = load(read(root, 'de/index.html'))
        expect($('[data-consent-banner] [data-consent-reject-all]').text()).toBe('Alle ablehnen')
        expect($('[data-consent-banner] a').attr('href')).toBe('/de/datenschutz.html')
        expect($('[data-consent-dialog] [data-consent-save]').text()).toBe('Auswahl speichern')
    })
})

describe('the fixture site without categories (notice mode)', () => {
    let root

    beforeAll(async () => {
        ;({ root } = await buildFixture({
            'config/consent.yaml': 'privacy_url: /privacy.html\n',
            'pages/index.md': '---\ntitle: Consent fixture\nlayout: layout.pug\n---\nNo embeds.\n',
            'pages/de/index.md': '---\ntitle: Consent-Fixture\nlayout: layout.pug\nlang: de\n---\nKeine Einbettungen.\n',
            'pages/hand-placed.md': null,
        }))
    }, 60_000)

    afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

    it('renders the notice and neither the banner nor the dialog', () => {
        const $ = load(read(root, 'index.html'))
        expect($('[data-consent-notice]')).toHaveLength(1)
        expect($('[data-consent-notice]').attr('hidden')).toBeDefined()
        expect($('[data-consent-banner]')).toHaveLength(0)
        expect($('[data-consent-dialog]')).toHaveLength(0)
        expect($('script[data-consent]')).toHaveLength(0)
    })

    it('has no a11y-* and no privacy-third-party finding', () => {
        expect(findings(root, 'a11y-')).toEqual([])
        expect(findings(root, 'privacy-third-party')).toEqual([])
    })
})
