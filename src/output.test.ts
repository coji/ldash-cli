import { describe, expect, it } from 'vitest'
import { maskSecret } from './output.js'

describe('maskSecret', () => {
  it('returns (not set) for undefined and empty values', () => {
    expect(maskSecret(undefined)).toBe('(not set)')
    expect(maskSecret('')).toBe('(not set)')
  })

  it('fully masks short values so no suffix leaks', () => {
    // Regression: previous impl did `***${key.slice(-4)}`, which exposed
    // the entire key for keys of length <= 4.
    expect(maskSecret('a')).toBe('****')
    expect(maskSecret('abcd')).toBe('****')
    expect(maskSecret('abcdefgh')).toBe('****')
  })

  it('shows only the last 4 chars for longer values', () => {
    expect(maskSecret('abcdefghi')).toBe('***fghi')
    expect(maskSecret('very-long-token-abcd')).toBe('***abcd')
  })
})
