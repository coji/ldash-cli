import { describe, expect, it } from 'vitest'
import { CliError } from '../errors.js'
import { normalizeUrl, parseSetupArgs } from './setup.js'

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
