import { describe, it, expect, vi } from 'vitest'
import * as plugin from '../index.js'

describe('plugin exports', () => {
    it('exports the three hooks as functions', () => {
        expect(typeof plugin.getAppData).toBe('function')
        expect(typeof plugin.getMetaData).toBe('function')
        expect(typeof plugin.getAssets).toBe('function')
    })

    it('returns the shapes core expects', () => {
        // Runs against this repo's own config/consent.yaml, which has no
        // privacy_url; the warning about it is expected and silenced.
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const app = { lang: 'en', title: 'Site' }
        const pagesData = [{ content: '<p>Hi</p>', meta: {} }]

        const appResult = plugin.getAppData({ app, pagesData })
        expect(appResult).toMatchObject(app)
        expect(appResult).not.toBe(app)
        expect(appResult.consent.mode).toBe('notice')
        expect(plugin.getMetaData({ app, pagesData })).toBe(pagesData)
        expect(plugin.getAssets({ app, pagesData })).toEqual([])
        vi.restoreAllMocks()
    })
})
