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
})

describe('formatError', () => {
  it('renders a three-line human-readable block', () => {
    const err = new CliError('X', 'Y', 'Z')
    expect(formatError(err)).toBe('Error: X\nWhy: Y\nHint: Z')
  })
})

describe('formatErrorJson', () => {
  it('wraps the error in {ok:false, error:{what,why,hint}}', () => {
    const err = new CliError('X', 'Y', 'Z')
    expect(formatErrorJson(err)).toEqual({
      ok: false,
      error: { what: 'X', why: 'Y', hint: 'Z' },
    })
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
  })

  it('wraps a non-Error value with a generic why', () => {
    const wrapped = wrapApiError('weird')
    expect(wrapped.why).toBe('Unknown error occurred')
  })
})
