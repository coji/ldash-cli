import { describe, expect, it } from 'vitest'
import {
  CliError,
  formatError,
  formatErrorJson,
  wrapApiError,
} from './errors.js'

describe('CliError', () => {
  it('stores what/why/hint and uses what as the message', () => {
    const err = new CliError('nope', 'because', 'try this')
    expect(err.what).toBe('nope')
    expect(err.why).toBe('because')
    expect(err.hint).toBe('try this')
    expect(err.message).toBe('nope')
    expect(err.name).toBe('CliError')
  })

  it('defaults code to UNKNOWN when omitted', () => {
    const err = new CliError('x', 'y', 'z')
    expect(err.code).toBe('UNKNOWN')
  })

  it('preserves the supplied code', () => {
    const err = new CliError('x', 'y', 'z', 'AUTH_INVALID')
    expect(err.code).toBe('AUTH_INVALID')
  })
})

describe('formatError', () => {
  it('renders a three-line human-readable block', () => {
    const err = new CliError('X', 'Y', 'Z')
    expect(formatError(err)).toBe('Error: X\nWhy: Y\nHint: Z')
  })
})

describe('formatErrorJson', () => {
  it('wraps the error in {ok:false, error:{code,what,why,hint}}', () => {
    const err = new CliError('X', 'Y', 'Z', 'EXPLORE_NOT_FOUND')
    expect(formatErrorJson(err)).toEqual({
      ok: false,
      error: { code: 'EXPLORE_NOT_FOUND', what: 'X', why: 'Y', hint: 'Z' },
    })
  })

  it('falls back to UNKNOWN when no code was set', () => {
    const err = new CliError('X', 'Y', 'Z')
    expect(formatErrorJson(err).error.code).toBe('UNKNOWN')
  })
})

describe('wrapApiError', () => {
  it('returns CliError unchanged', () => {
    const err = new CliError('a', 'b', 'c')
    expect(wrapApiError(err)).toBe(err)
  })

  it('wraps an Error into a CliError with its message as why', () => {
    const wrapped = wrapApiError(new Error('boom'))
    expect(wrapped).toBeInstanceOf(CliError)
    expect(wrapped.what).toBe('Unexpected error')
    expect(wrapped.why).toBe('boom')
    expect(wrapped.code).toBe('UNKNOWN')
  })

  it('wraps a non-Error value with a generic why', () => {
    const wrapped = wrapApiError('weird')
    expect(wrapped.why).toBe('Unknown error occurred')
  })
})
