import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(),
  }
})

import { readFileSync } from 'node:fs'
import {
  ENV_API_KEY,
  ENV_API_URL,
  ENV_PROJECT_UUID,
  getResolvedConfig,
} from './config.js'

const mockedReadFileSync = readFileSync as MockedFunction<typeof readFileSync>

const ENV_KEYS = [ENV_API_KEY, ENV_API_URL, ENV_PROJECT_UUID] as const

describe('getResolvedConfig', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k]
      delete process.env[k]
    }
    mockedReadFileSync.mockReset()
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  it('falls back to defaults when nothing is configured', () => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error('no such file') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    const r = getResolvedConfig()
    expect(r.apiKey).toEqual({ value: undefined, source: 'unset' })
    expect(r.apiUrl.value).toBe('https://app.lightdash.cloud')
    expect(r.apiUrl.source).toBe('default')
    expect(r.projectUuid).toEqual({ value: undefined, source: 'unset' })
  })

  it('reads values from the config file when env is unset', () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        apiKey: 'file-key',
        apiUrl: 'https://file.example.com',
        projectUuid: 'file-uuid',
      }),
    )
    const r = getResolvedConfig()
    expect(r.apiKey).toEqual({ value: 'file-key', source: 'file' })
    expect(r.apiUrl).toEqual({
      value: 'https://file.example.com',
      source: 'file',
    })
    expect(r.projectUuid).toEqual({ value: 'file-uuid', source: 'file' })
  })

  it('env var wins over file and records the envVar name', () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        apiKey: 'file-key',
        apiUrl: 'https://file.example.com',
      }),
    )
    process.env[ENV_API_KEY] = 'env-key'
    process.env[ENV_API_URL] = 'https://env.example.com'

    const r = getResolvedConfig()
    expect(r.apiKey).toEqual({
      value: 'env-key',
      source: 'env',
      envVar: ENV_API_KEY,
    })
    expect(r.apiUrl).toEqual({
      value: 'https://env.example.com',
      source: 'env',
      envVar: ENV_API_URL,
    })
  })

  it('throws when the config file exists but contains invalid JSON', () => {
    // Regression: previously any error (including SyntaxError from
    // JSON.parse) was swallowed and silently treated as "no config".
    mockedReadFileSync.mockReturnValue('{ not valid json')
    expect(() => getResolvedConfig()).toThrow(/not valid JSON/)
  })

  it('mixes sources independently per field', () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        apiKey: 'file-key',
        apiUrl: 'https://file.example.com',
        projectUuid: 'file-uuid',
      }),
    )
    process.env[ENV_PROJECT_UUID] = 'env-uuid'

    const r = getResolvedConfig()
    expect(r.apiKey.source).toBe('file')
    expect(r.apiUrl.source).toBe('file')
    expect(r.projectUuid).toEqual({
      value: 'env-uuid',
      source: 'env',
      envVar: ENV_PROJECT_UUID,
    })
  })
})
