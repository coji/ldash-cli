import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import * as api from '../api.js'
import { getConfig, getConfigPath, saveConfig } from '../config.js'
import { parseFlags } from '../output.js'
import type { CommandGroup } from '../types.js'

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open'
  execFile(cmd, [url])
}

async function fetchProjects(): Promise<
  { projectUuid: string; name: string }[]
> {
  const { client } = api.createBaseClient()
  const projects = await api.listProjects(client)
  return projects as { projectUuid: string; name: string }[]
}

function formatProjectList(
  projects: { projectUuid: string; name: string }[],
): string[] {
  const lines: string[] = []
  if (projects.length === 0) {
    lines.push('\nNo projects found in your organization.')
  } else {
    lines.push('\nAvailable projects:')
    for (const p of projects) {
      lines.push(`  ${p.name}  ${p.projectUuid}`)
    }
    lines.push('\nNext: ldash setup --project-uuid <uuid>')
  }
  return lines
}

// --- Non-interactive: flag-based steps ---

function setupUrl(url: string): Promise<string> {
  saveConfig({ apiUrl: url })
  const patUrl = `${url}/generalSettings/personalAccessTokens`
  openBrowser(patUrl)
  return Promise.resolve(
    `URL saved: ${url}\nOpened browser: ${patUrl}\n\nNext: ldash setup --api-key <token>`,
  )
}

async function setupApiKey(apiKey: string): Promise<string> {
  saveConfig({ apiKey })

  const lines = [`API key saved to ${getConfigPath()}`]

  try {
    const projects = await fetchProjects()
    lines.push(...formatProjectList(projects))
  } catch (e) {
    lines.push(
      `\nCould not fetch projects: ${e instanceof Error ? e.message : String(e)}`,
      'You can set it manually: ldash setup --project-uuid <uuid>',
    )
  }

  return lines.join('\n')
}

function setupProjectUuid(projectUuid: string): Promise<string> {
  saveConfig({ projectUuid })
  const config = getConfig()
  return Promise.resolve(
    `Setup complete!\n  URL:     ${config.apiUrl}\n  API Key: ***${config.apiKey?.slice(-4) ?? '????'}\n  Project: ${projectUuid}\n\nTry: ldash explore list`,
  )
}

// --- Interactive setup ---

async function runInteractive(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const existing = getConfig()

    // 1. URL
    const defaultUrl = existing.apiUrl || 'https://app.lightdash.cloud'
    const urlInput = await rl.question(`Lightdash URL [${defaultUrl}]: `)
    const apiUrl = urlInput.trim() || defaultUrl
    saveConfig({ apiUrl })

    // 2. Open browser for PAT
    const patUrl = `${apiUrl}/generalSettings/personalAccessTokens`
    console.log('\nOpening browser to create a Personal Access Token...')
    console.log(`  ${patUrl}\n`)
    openBrowser(patUrl)

    const apiKey = await rl.question('Paste your Personal Access Token: ')
    if (!apiKey.trim()) {
      return 'Setup cancelled: no API key provided.'
    }
    saveConfig({ apiKey: apiKey.trim() })

    // 3. Fetch projects
    console.log('\nFetching projects...')
    let projects: { projectUuid: string; name: string }[]
    try {
      projects = await fetchProjects()
    } catch (e) {
      return `Config saved (URL + API key).\nCould not fetch projects: ${e instanceof Error ? e.message : String(e)}\nRun "ldash setup --project-uuid <uuid>" to set it manually.`
    }

    if (projects.length === 0) {
      return 'Config saved (URL + API key). No projects found.'
    }

    // 4. Pick project
    let projectUuid: string
    if (projects.length === 1) {
      projectUuid = projects[0].projectUuid
      console.log(`Found 1 project: ${projects[0].name}`)
    } else {
      console.log('Available projects:')
      for (let i = 0; i < projects.length; i++) {
        console.log(
          `  ${i + 1}) ${projects[i].name} (${projects[i].projectUuid})`,
        )
      }
      const choice = await rl.question(
        `Select project [1-${projects.length}]: `,
      )
      const idx = Number.parseInt(choice, 10) - 1
      if (idx < 0 || idx >= projects.length || Number.isNaN(idx)) {
        return 'Config saved (URL + API key). Invalid selection.\nRun "ldash setup --project-uuid <uuid>" to set it manually.'
      }
      projectUuid = projects[idx].projectUuid
    }

    saveConfig({ projectUuid })
    const name = projects.find((p) => p.projectUuid === projectUuid)?.name
    return `\nSetup complete!\n  URL:     ${apiUrl}\n  API Key: ***${apiKey.trim().slice(-4)}\n  Project: ${name} (${projectUuid})\n\nTry: ldash explore list`
  } finally {
    rl.close()
  }
}

// --- Command group ---

export const setupGroup: CommandGroup = {
  description: 'Setup wizard (interactive or step-by-step with flags)',
  workflow: [
    'ldash setup                                 # interactive setup',
    'ldash setup <url>                           # save URL + open browser for PAT',
    'ldash setup --api-key <token>               # save API key + list projects',
    'ldash setup --project-uuid <uuid>           # save project UUID',
  ],
  defaultRun: (args) => {
    const flags = parseFlags(args)

    if (flags['api-key']) return setupApiKey(flags['api-key'])
    if (flags['project-uuid']) return setupProjectUuid(flags['project-uuid'])

    const url = args.find((a) => !a.startsWith('--'))
    if (url) return setupUrl(url)

    return runInteractive()
  },
  commands: {},
}
