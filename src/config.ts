import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface ConfigFile {
  apiKey?: string
  apiUrl?: string
  projectUuid?: string
}

const CONFIG_DIR = join(homedir(), '.config', 'ldash')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')
const DEFAULT_API_URL = 'https://app.lightdash.cloud'

export const ENV_API_KEY = 'LIGHTDASH_API_KEY'
export const ENV_API_URL = 'LIGHTDASH_API_URL'
export const ENV_PROJECT_UUID = 'LIGHTDASH_PROJECT_UUID'

export type ConfigSource = 'env' | 'file' | 'default' | 'unset'

export interface ResolvedField<T> {
  value: T
  source: ConfigSource
  envVar?: string
}

export interface ResolvedConfig {
  apiKey: ResolvedField<string | undefined>
  apiUrl: ResolvedField<string>
  projectUuid: ResolvedField<string | undefined>
  configFile: string
}

function loadConfigFile(): ConfigFile {
  let raw: string
  try {
    raw = readFileSync(CONFIG_PATH, 'utf-8')
  } catch (err) {
    // Missing file is the expected "no config yet" state; anything else
    // (permission denied, etc.) should surface to the user.
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {}
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Config file at ${CONFIG_PATH} is not valid JSON: ${msg}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Config file at ${CONFIG_PATH} must contain a JSON object at the top level`,
    )
  }
  const record = parsed as Record<string, unknown>
  for (const key of ['apiKey', 'apiUrl', 'projectUuid'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
      throw new Error(
        `Config file at ${CONFIG_PATH}: "${key}" must be a string when present`,
      )
    }
  }
  return record as ConfigFile
}

/**
 * Resolve each config field to its effective value, tracking whether it came
 * from an environment variable, the config file, a built-in default, or is
 * unset. Used by `ldash config show` and by error messages so the user knows
 * which setting to update.
 */
export function getResolvedConfig(): ResolvedConfig {
  const file = loadConfigFile()

  const apiKeyEnv = process.env[ENV_API_KEY]
  const apiKey: ResolvedField<string | undefined> =
    apiKeyEnv !== undefined
      ? { value: apiKeyEnv, source: 'env', envVar: ENV_API_KEY }
      : file.apiKey !== undefined
        ? { value: file.apiKey, source: 'file' }
        : { value: undefined, source: 'unset' }

  const apiUrlEnv = process.env[ENV_API_URL]
  const apiUrl: ResolvedField<string> =
    apiUrlEnv !== undefined
      ? { value: apiUrlEnv, source: 'env', envVar: ENV_API_URL }
      : file.apiUrl !== undefined
        ? { value: file.apiUrl, source: 'file' }
        : { value: DEFAULT_API_URL, source: 'default' }

  const projectUuidEnv = process.env[ENV_PROJECT_UUID]
  const projectUuid: ResolvedField<string | undefined> =
    projectUuidEnv !== undefined
      ? { value: projectUuidEnv, source: 'env', envVar: ENV_PROJECT_UUID }
      : file.projectUuid !== undefined
        ? { value: file.projectUuid, source: 'file' }
        : { value: undefined, source: 'unset' }

  return { apiKey, apiUrl, projectUuid, configFile: CONFIG_PATH }
}

export function getConfig(): {
  apiKey: string | undefined
  apiUrl: string
  projectUuid: string | undefined
} {
  const r = getResolvedConfig()
  return {
    apiKey: r.apiKey.value,
    apiUrl: r.apiUrl.value,
    projectUuid: r.projectUuid.value,
  }
}

/**
 * Write values to the config file on disk. Never touches environment variables.
 *
 * The file holds a Personal Access Token after `ldash setup`, so it MUST be
 * created with restrictive permissions:
 *  - parent directory `~/.config/ldash/` → 0o700 (only the owner can list it)
 *  - the file itself → 0o600 (only the owner can read or write it)
 *
 * On a shared host with the default umask (022), the historical write would
 * have produced a world-readable token file. Even though most ldash users are
 * on single-user machines, the recommended onboarding now writes a 30-day PAT
 * to this file automatically, so we treat the write as security-sensitive.
 *
 * The write also goes through a same-directory temp file + rename so a process
 * killed mid-write doesn't truncate the existing config — the temp file is
 * either fully written and atomically renamed into place, or it gets cleaned
 * up and the previous file is left intact.
 */
export function saveConfig(values: Partial<ConfigFile>): void {
  const existing = loadConfigFile()
  const merged = { ...existing, ...values }
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  const contents = `${JSON.stringify(merged, null, 2)}\n`
  const tmpPath = `${CONFIG_PATH}.${process.pid}.tmp`
  writeFileSync(tmpPath, contents, { mode: 0o600 })
  try {
    renameSync(tmpPath, CONFIG_PATH)
  } catch (err) {
    try {
      unlinkSync(tmpPath)
    } catch {
      // best-effort cleanup; surface the original rename error
    }
    throw err
  }
}

export function getConfigPath(): string {
  return CONFIG_PATH
}
