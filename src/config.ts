import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface Config {
  apiKey?: string
  apiUrl?: string
  projectUuid?: string
}

const CONFIG_DIR = join(homedir(), '.config', 'ldash')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

function loadConfigFile(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Config
  } catch {
    return {}
  }
}

export function getConfig(): {
  apiKey: string | undefined
  apiUrl: string
  projectUuid: string | undefined
} {
  const file = loadConfigFile()
  return {
    apiKey: process.env.LIGHTDASH_API_KEY || file.apiKey,
    apiUrl:
      process.env.LIGHTDASH_API_URL ||
      file.apiUrl ||
      'https://app.lightdash.cloud',
    projectUuid: process.env.LIGHTDASH_PROJECT_UUID || file.projectUuid,
  }
}

export function saveConfig(values: Partial<Config>): void {
  const existing = loadConfigFile()
  const merged = { ...existing, ...values }
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`)
}

export function getConfigPath(): string {
  return CONFIG_PATH
}
