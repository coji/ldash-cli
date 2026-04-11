import { describe, expect, it } from 'vitest'
import { CliError } from '../errors.js'
import {
  normalizeUrl,
  parseSetupArgs,
  selectSetupFlow,
  type SetupOptions,
} from './setup.js'

const baseOpts = (): SetupOptions => ({
  pat: false,
  nonInteractive: false,
})

describe('normalizeUrl', () => {
  it('turns a single word into a lightdash.cloud subdomain with https', () => {
    expect(normalizeUrl('app')).toBe('https://app.lightdash.cloud')
  })

  it('adds https:// to a bare hostname', () => {
    expect(normalizeUrl('app.lightdash.cloud')).toBe(
      'https://app.lightdash.cloud',
    )
  })

  it('preserves an explicit protocol', () => {
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeUrl('https://app.lightdash.cloud')).toBe(
      'https://app.lightdash.cloud',
    )
  })

  it('strips any path', () => {
    expect(normalizeUrl('https://app.lightdash.cloud/projects/123')).toBe(
      'https://app.lightdash.cloud',
    )
  })

  it('trims whitespace', () => {
    expect(normalizeUrl('  app  ')).toBe('https://app.lightdash.cloud')
  })

  it('wraps URL parse failures in CliError', () => {
    expect(() => normalizeUrl('https://')).toThrow(CliError)
    try {
      normalizeUrl('https://')
    } catch (err) {
      expect((err as CliError).what).toContain('Invalid URL')
    }
  })
})

describe('parseSetupArgs', () => {
  it('returns defaults for empty input', () => {
    const opts = parseSetupArgs([])
    expect(opts).toEqual({
      pat: false,
      nonInteractive: false,
    })
  })

  it('captures a positional URL', () => {
    const opts = parseSetupArgs(['https://app.lightdash.cloud'])
    expect(opts.url).toBe('https://app.lightdash.cloud')
  })

  it('captures value flags', () => {
    const opts = parseSetupArgs([
      'https://app.lightdash.cloud',
      '--api-key',
      'tok',
      '--project-uuid',
      'uuid',
      '--oauth-port',
      '8976',
      '--token-ttl',
      '720',
    ])
    expect(opts.url).toBe('https://app.lightdash.cloud')
    expect(opts.apiKey).toBe('tok')
    expect(opts.projectUuid).toBe('uuid')
    expect(opts.oauthPort).toBe(8976)
    expect(opts.tokenTtl).toBe(720)
  })

  it('captures boolean flags', () => {
    const opts = parseSetupArgs(['--pat', '--non-interactive'])
    expect(opts.pat).toBe(true)
    expect(opts.nonInteractive).toBe(true)
  })

  it('rejects an unknown flag', () => {
    expect(() => parseSetupArgs(['--foo', 'bar'])).toThrow(CliError)
    try {
      parseSetupArgs(['--foo', 'bar'])
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).what).toContain('--foo')
    }
  })

  it('rejects a value flag missing its value', () => {
    expect(() => parseSetupArgs(['--api-key'])).toThrow(CliError)
  })

  it('rejects an invalid oauth-port', () => {
    expect(() => parseSetupArgs(['--oauth-port', '0'])).toThrow(CliError)
    expect(() => parseSetupArgs(['--oauth-port', '70000'])).toThrow(CliError)
    expect(() => parseSetupArgs(['--oauth-port', 'abc'])).toThrow(CliError)
  })

  it('rejects an invalid token-ttl', () => {
    expect(() => parseSetupArgs(['--token-ttl', '0'])).toThrow(CliError)
    expect(() => parseSetupArgs(['--token-ttl', 'abc'])).toThrow(CliError)
  })
})

describe('selectSetupFlow', () => {
  it('defaults to oauth with no flags', () => {
    expect(selectSetupFlow(baseOpts())).toBe('oauth')
  })

  it('routes to oauth when only a URL is given', () => {
    expect(selectSetupFlow({ ...baseOpts(), url: 'https://x' })).toBe('oauth')
  })

  it('does NOT route to scripted when only --non-interactive is set', () => {
    // Regression test for the CodeRabbit-caught dispatcher bug where
    // `ldash setup --non-interactive` used to hit runNonInteractive and
    // die with "Nothing to save".
    expect(selectSetupFlow({ ...baseOpts(), nonInteractive: true })).toBe(
      'oauth',
    )
  })

  it('routes to scripted when --api-key is given', () => {
    expect(selectSetupFlow({ ...baseOpts(), apiKey: 'tok' })).toBe('scripted')
  })

  it('routes to scripted when --project-uuid is given', () => {
    expect(selectSetupFlow({ ...baseOpts(), projectUuid: 'uuid' })).toBe(
      'scripted',
    )
  })

  it('routes to pat when --pat is given, regardless of other flags', () => {
    expect(selectSetupFlow({ ...baseOpts(), pat: true })).toBe('pat')
    expect(selectSetupFlow({ ...baseOpts(), pat: true, apiKey: 'tok' })).toBe(
      'pat',
    )
  })
})
