import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CliError } from './errors.js'
import { resolvePort } from './oauth.js'

describe('resolvePort', () => {
  const saved = process.env.LIGHTDASH_OAUTH_PORT

  beforeEach(() => {
    delete process.env.LIGHTDASH_OAUTH_PORT
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.LIGHTDASH_OAUTH_PORT
    else process.env.LIGHTDASH_OAUTH_PORT = saved
  })

  it('prefers an explicit requested port over the env var', () => {
    process.env.LIGHTDASH_OAUTH_PORT = '9999'
    expect(resolvePort(8080)).toBe(8080)
  })

  it('returns 0 (random) when neither is set', () => {
    expect(resolvePort(undefined)).toBe(0)
  })

  it('reads a valid LIGHTDASH_OAUTH_PORT', () => {
    process.env.LIGHTDASH_OAUTH_PORT = '8976'
    expect(resolvePort(undefined)).toBe(8976)
  })

  it('rejects partial-numeric env values', () => {
    // Regression: Number.parseInt('8080abc', 10) === 8080 used to slip through.
    process.env.LIGHTDASH_OAUTH_PORT = '8080abc'
    expect(() => resolvePort(undefined)).toThrow(CliError)
  })

  it('rejects non-numeric env values', () => {
    process.env.LIGHTDASH_OAUTH_PORT = 'abc'
    expect(() => resolvePort(undefined)).toThrow(CliError)
  })

  it('rejects out-of-range env values', () => {
    process.env.LIGHTDASH_OAUTH_PORT = '0'
    expect(() => resolvePort(undefined)).toThrow(CliError)
    process.env.LIGHTDASH_OAUTH_PORT = '70000'
    expect(() => resolvePort(undefined)).toThrow(CliError)
  })
})
