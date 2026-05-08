import { describe, expect, it } from 'vitest'
import { CliError } from './errors.js'
import {
  maskSecret,
  parseGlobalFlags,
  projectFields,
  resolveProjection,
} from './output.js'

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

describe('projectFields', () => {
  it('picks keys from a single object', () => {
    expect(
      projectFields({ name: 'a', uuid: 'u', extra: 1 }, ['name', 'uuid']),
    ).toEqual({ name: 'a', uuid: 'u' })
  })

  it('drops keys that are not present without erroring', () => {
    expect(projectFields({ name: 'a' }, ['name', 'description'])).toEqual({
      name: 'a',
    })
  })

  it('maps over arrays of objects', () => {
    const data = [
      { name: 'a', uuid: '1', extra: 'x' },
      { name: 'b', uuid: '2', extra: 'y' },
    ]
    expect(projectFields(data, ['name', 'uuid'])).toEqual([
      { name: 'a', uuid: '1' },
      { name: 'b', uuid: '2' },
    ])
  })

  it('passes primitives through unchanged', () => {
    expect(projectFields('hello', ['x'])).toBe('hello')
    expect(projectFields(42, ['x'])).toBe(42)
    expect(projectFields(null, ['x'])).toBe(null)
  })

  it('passes through array elements that are not objects', () => {
    expect(projectFields([1, 'two', null], ['x'])).toEqual([1, 'two', null])
  })

  it('returns the data unchanged when fields is empty', () => {
    const data = { name: 'a' }
    expect(projectFields(data, [])).toBe(data)
  })
})

describe('resolveProjection', () => {
  it('prefers --fields over --compact', () => {
    expect(
      resolveProjection({ fields: ['x', 'y'], compact: true }, ['name']),
    ).toEqual(['x', 'y'])
  })

  it('uses command compactFields under --compact', () => {
    expect(resolveProjection({ compact: true }, ['name', 'uuid'])).toEqual([
      'name',
      'uuid',
    ])
  })

  it('falls back to a universal default under --compact', () => {
    expect(resolveProjection({ compact: true }, undefined)).toEqual([
      'uuid',
      'name',
      'description',
    ])
  })

  it('returns null when neither flag is set', () => {
    expect(resolveProjection({}, ['x'])).toBeNull()
  })
})

describe('parseGlobalFlags', () => {
  it('captures --json', () => {
    const { args, flags } = parseGlobalFlags(['--json', 'list'])
    expect(flags.json).toBe(true)
    expect(args).toEqual(['list'])
  })

  it('captures --compact', () => {
    const { flags } = parseGlobalFlags(['--compact'])
    expect(flags.compact).toBe(true)
  })

  it('parses --fields into a key array', () => {
    const { args, flags } = parseGlobalFlags([
      'chart',
      'list',
      '--fields',
      'uuid, name , description',
    ])
    expect(flags.fields).toEqual(['uuid', 'name', 'description'])
    expect(args).toEqual(['chart', 'list'])
  })

  it('rejects --fields with no value', () => {
    expect(() => parseGlobalFlags(['--fields'])).toThrow(CliError)
    expect(() => parseGlobalFlags(['--fields', '--json'])).toThrow(CliError)
  })

  it('rejects --fields whose value parses to an empty list', () => {
    expect(() => parseGlobalFlags(['--fields', ' , , '])).toThrow(CliError)
  })
})
