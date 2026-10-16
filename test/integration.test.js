import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { load } from 'cheerio'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import run from '@nera-static/core'

// End to end through core's real pipeline (ROADMAP slice 2): a throwaway site
// in a temp dir loads this repo's index.js as a local plugin, and `run()`
// builds it with core's own markdown-it (`html: true`, so pasted iframes
// survive), its base_path pass and the `getAssets` copy into public/.

const pluginEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.js')

const write = (file, content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
}

const CONSENT_YAML = `privacy_url: /privacy.html
categories:
    - id: media
      services:
          - name: YouTube
            provider: Google Ireland Limited, Dublin
            purpose: Shows embedded videos.
            privacy_url: https://policies.google.com/privacy
            hosts: [youtube.com, youtube-nocookie.com]
`

const VIDEO = [
    '---',
    'title: Video',
    'layout: layout.pug',
    'lang: de',
    '---',
    'Before the **video**.',
    '',
    '<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/abc" title="Demo" allowfullscreen></iframe>',
    '',
    '<iframe src="//www.youtube.com/embed/def"></iframe>',
    '',
    '<iframe src="https://example.org/map"></iframe>',
    '',
    'After the video.',
    '',
].join('\n')

function makeSite(root, { appYaml = 'name: Demo\nlang: en\n' } = {}) {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'demo', private: true, type: 'module' }))
    write(path.join(root, 'config', 'app.yaml'), appYaml)
    write(path.join(root, 'config', 'consent.yaml'), CONSENT_YAML)
    write(path.join(root, 'views', 'layout.pug'), 'doctype html\nhtml\n  body\n    main!= content')
    write(
        path.join(root, 'plugins', 'consent', 'index.js'),
        `export * from '${pathToFileURL(pluginEntry).href}'\n`
    )
    write(path.join(root, 'pages', 'video.md'), VIDEO)
    write(path.join(root, 'pages', 'plain.md'), '---\ntitle: Plain\nlayout: layout.pug\n---\nNo embeds.\n')
}

const folders = (root) => ({
    config: path.join(root, 'config'),
    pages: path.join(root, 'pages'),
    views: path.join(root, 'views'),
    assets: path.join(root, 'assets'),
    dist: path.join(root, 'public'),
    plugins: path.join(root, 'plugins'),
})

async function build(root) {
    const prev = process.cwd()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.chdir(root)
    try {
        await run({ folders: folders(root) })
        return warn.mock.calls.map((c) => c.join(' '))
    } finally {
        process.chdir(prev)
        log.mockRestore()
        warn.mockRestore()
    }
}

const read = (root, rel) => fs.readFileSync(path.join(root, 'public', rel), 'utf-8')

describe.each([
    ['a root-served site', ''],
    ['a site with base_path', '/sub'],
])('%s with a gated embed', (_, basePath) => {
    let root
    let warnings

    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'nera-consent-int-'))
        makeSite(root, { appYaml: `name: Demo\nlang: en\n${basePath ? `base_path: ${basePath}\n` : ''}` })
        warnings = await build(root)
    }, 60_000)

    afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

    it('builds without warnings', () => {
        expect(warnings).toEqual([])
    })

    it('leaves no live src on a gated iframe in the built HTML', () => {
        const html = read(root, 'video.html')
        expect(html).not.toMatch(/\ssrc="[^"]*youtube/)
        const $ = load(html)
        expect($('[data-consent-embed]')).toHaveLength(2)
        expect($('iframe[data-consent]').map((_, el) => $(el).attr('data-consent-src')).get()).toEqual([
            'https://www.youtube-nocookie.com/embed/abc',
            '//www.youtube.com/embed/def',
        ])
        expect($('iframe[data-consent]').first().attr('title')).toBe('Demo')
    })

    it('renders the placeholder in the page language', () => {
        const $ = load(read(root, 'video.html'))
        expect($('[data-consent-load]').first().text()).toBe('YouTube laden')
    })

    it('keeps ungated iframes and the surrounding content', () => {
        const $ = load(read(root, 'video.html'))
        expect($('iframe[src="https://example.org/map"]')).toHaveLength(1)
        expect($('main > p').first().html()).toBe('Before the <strong>video</strong>.')
        expect($('main > p').last().text()).toBe('After the video.')
        expect(read(root, 'plain.html')).not.toContain('nera-consent')
    })

    it('copies the runtime to public/_nera/', () => {
        const dir = path.join(root, 'public', '_nera')
        expect(fs.readdirSync(dir).sort()).toEqual(['consent.css', 'consent.js'])
    })
})
