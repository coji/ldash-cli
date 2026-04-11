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
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import {
  ENV_API_KEY,
  ENV_API_URL,
  ENV_PROJECT_UUID,
  getResolvedConfig,
  saveConfig,
} from './config.js'

const mockedReadFileSync = readFileSync as MockedFunction<typeof readFileSync>
const mockedWriteFileSync = writeFileSync as MockedFunction<
  typeof writeFileSync
>
const mockedMkdirSync = mkdirSync as MockedFunction<typeof mkdirSync>
const mockedRenameSync = renameSync as MockedFunction<typeof renameSync>
const mockedUnlinkSync = unlinkSync as MockedFunction<typeof unlinkSync>

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

  it('throws when the config file is a JSON value other than an object', () => {
    mockedReadFileSync.mockReturnValue('null')
    expect(() => getResolvedConfig()).toThrow(/JSON object/)
    mockedReadFileSync.mockReturnValue('[]')
    expect(() => getResolvedConfig()).toThrow(/JSON object/)
    mockedReadFileSync.mockReturnValue('"hello"')
    expect(() => getResolvedConfig()).toThrow(/JSON object/)
  })

  it('throws when a known field has the wrong type', () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({ apiUrl: 123 }))
    expect(() => getResolvedConfig()).toThrow(/"apiUrl" must be a string/)
  })

  it('ignores unknown fields without throwing', () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ apiUrl: 'https://x', extra: { nested: 1 } }),
    )
    expect(() => getResolvedConfig()).not.toThrow()
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

describe('saveConfig', () => {
  beforeEach(() => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error('no such file') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    mockedWriteFileSync.mockReset()
    mockedMkdirSync.mockReset()
    mockedRenameSync.mockReset()
    mockedUnlinkSync.mockReset()
  })

  it('creates the parent directory with mode 0o700', () => {
    saveConfig({ apiKey: 'tok' })
    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('/.config/ldash'),
      expect.objectContaining({ recursive: true, mode: 0o700 }),
    )
  })

  it('writes to a temp file with mode 0o600 then renames atomically', () => {
    saveConfig({ apiKey: 'tok' })

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1)
    const [tmpPath, contents, opts] = mockedWriteFileSync.mock.calls[0]
    expect(String(tmpPath)).toMatch(/config\.json\.\d+\.tmp$/)
    expect(opts).toEqual(expect.objectContaining({ mode: 0o600 }))
    expect(JSON.parse(String(contents))).toEqual({ apiKey: 'tok' })

    expect(mockedRenameSync).toHaveBeenCalledTimes(1)
    const [renameFrom, renameTo] = mockedRenameSync.mock.calls[0]
    expect(renameFrom).toBe(tmpPath)
    expect(String(renameTo)).toMatch(/config\.json$/)
  })

  it('cleans up the temp file when the rename fails', () => {
    mockedRenameSync.mockImplementation(() => {
      throw new Error('rename failed')
    })
    expect(() => saveConfig({ apiKey: 'tok' })).toThrow(/rename failed/)
    expect(mockedUnlinkSync).toHaveBeenCalledTimes(1)
    const [tmpPath] = mockedUnlinkSync.mock.calls[0]
    expect(String(tmpPath)).toMatch(/config\.json\.\d+\.tmp$/)
  })

  it('merges new values with the existing file', () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ apiUrl: 'https://existing.example.com' }),
    )
    saveConfig({ apiKey: 'new-key' })
    const [, contents] = mockedWriteFileSync.mock.calls[0]
    expect(JSON.parse(String(contents))).toEqual({
      apiUrl: 'https://existing.example.com',
      apiKey: 'new-key',
    })
  })
})
