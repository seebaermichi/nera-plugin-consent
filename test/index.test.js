import { describe, it, expect } from 'vitest'
import * as plugin from '../index.js'

describe('plugin exports', () => {
    it('exports the three hooks as functions', () => {
        expect(typeof plugin.getAppData).toBe('function')
        expect(typeof plugin.getMetaData).toBe('function')
        expect(typeof plugin.getAssets).toBe('function')
    })

    it('returns the shapes core expects', () => {
        const app = { lang: 'en', title: 'Site' }
        const pagesData = [{ content: '<p>Hi</p>', meta: {} }]

        const appResult = plugin.getAppData({ app, pagesData })
        expect(appResult).toEqual(app)
        expect(appResult).not.toBe(app)
        expect(plugin.getMetaData({ app, pagesData })).toBe(pagesData)
        expect(plugin.getAssets({ app, pagesData })).toEqual([])
    })
})
