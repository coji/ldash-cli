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
  check: false,
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
      check: false,
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

  it('rejects partial numeric values for --oauth-port', () => {
    // Regression: Number.parseInt('12h', 10) === 12 used to slip through.
    expect(() => parseSetupArgs(['--oauth-port', '12h'])).toThrow(CliError)
    expect(() => parseSetupArgs(['--oauth-port', '1.5'])).toThrow(CliError)
  })

  it('rejects partial numeric values for --token-ttl', () => {
    expect(() => parseSetupArgs(['--token-ttl', '720x'])).toThrow(CliError)
    expect(() => parseSetupArgs(['--token-ttl', '1.5'])).toThrow(CliError)
  })

  it('rejects --token-ttl values above the 1-year ceiling', () => {
    // Regression: without a cap, huge values overflow
    // `Date.now() + ttl * 3_600_000` and produce Invalid Date.
    expect(() => parseSetupArgs(['--token-ttl', '100000'])).toThrow(CliError)
    expect(() => parseSetupArgs(['--token-ttl', '1000000000000'])).toThrow(
      CliError,
    )
  })

  it('accepts --token-ttl at the 1-year ceiling', () => {
    expect(parseSetupArgs(['--token-ttl', '8760']).tokenTtl).toBe(8760)
  })

  it('rejects a value flag whose next token is another flag', () => {
    // Regression: parser used to greedily consume the next token as a
    // value, so `--api-key --project-uuid xxx` would set apiKey to
    // "--project-uuid" and silently drop the real project.
    expect(() =>
      parseSetupArgs(['--api-key', '--project-uuid', 'uuid']),
    ).toThrow(CliError)
  })

  it('rejects multiple positional arguments', () => {
    expect(() =>
      parseSetupArgs(['https://a.example.com', 'https://b.example.com']),
    ).toThrow(CliError)
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

  it('routes to check whenever --check is set, even with other flags', () => {
    // --check is a non-destructive readiness probe and should win over PAT,
    // scripted, and OAuth so an agent can always ask "is this env ready?"
    // without first cleaning up environment-driven flags.
    expect(selectSetupFlow({ ...baseOpts(), check: true })).toBe('check')
    expect(selectSetupFlow({ ...baseOpts(), check: true, pat: true })).toBe(
      'check',
    )
    expect(selectSetupFlow({ ...baseOpts(), check: true, apiKey: 'tok' })).toBe(
      'check',
    )
  })
})
