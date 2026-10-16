import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { assertCoreVersion, coreVersion, satisfies } from '../src/guard.js'

describe('core version guard', () => {
    it('compares versions', () => {
        expect(satisfies('4.13.0')).toBe(true)
        expect(satisfies('4.16.4')).toBe(true)
        expect(satisfies('5.0.0')).toBe(true)
        expect(satisfies('4.12.9')).toBe(false)
        expect(satisfies('3.99.0')).toBe(false)
        expect(satisfies('4.13.0-beta.1')).toBe(true)
        expect(satisfies('garbage')).toBe(false)
    })

    it('throws below 4.13.0 and names the way out', () => {
        expect(() => assertCoreVersion('4.12.0')).toThrow(
            /plugin-consent: @nera-static\/core 4\.12\.0 is too old.*>= 4\.13\.0.*npm update/
        )
    })

    it('passes a new or unknown core', () => {
        expect(() => assertCoreVersion('4.13.0')).not.toThrow()
        expect(() => assertCoreVersion(null)).not.toThrow()
    })

    it('finds the installed core', () => {
        // Falls back to the plugin's own devDependency from an empty dir.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nera-consent-guard-'))
        expect(coreVersion(dir)).toMatch(/^\d+\.\d+\.\d+/)
    })
})
