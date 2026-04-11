import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { URL } from 'node:url'
import * as api from '../api.js'
import {
  ENV_API_KEY,
  ENV_API_URL,
  ENV_PROJECT_UUID,
  getConfig,
  getConfigPath,
  saveConfig,
} from '../config.js'
import { CliError } from '../errors.js'
import { loginWithOAuth } from '../oauth.js'
import type { CommandGroup, Flags } from '../types.js'

// --- Flag parsing ---

export interface SetupOptions {
  url?: string
  apiKey?: string
  projectUuid?: string
  pat: boolean
  nonInteractive: boolean
  oauthPort?: number
  tokenTtl?: number
}

const BOOLEAN_FLAGS = new Set(['--pat', '--non-interactive'])

const VALUE_FLAGS = new Set([
  '--api-key',
  '--project-uuid',
  '--oauth-port',
  '--token-ttl',
])

export function parseSetupArgs(args: string[]): SetupOptions {
  const opts: SetupOptions = {
    pat: false,
    nonInteractive: false,
  }
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    if (BOOLEAN_FLAGS.has(arg)) {
      if (arg === '--pat') opts.pat = true
      else if (arg === '--non-interactive') opts.nonInteractive = true
      continue
    }
    if (!VALUE_FLAGS.has(arg)) {
      throw new CliError(
        `Unknown flag "${arg}"`,
        `The setup command does not recognize "${arg}".`,
        'Run "ldash setup --help" for available flags.',
      )
    }
    const value = args[++i]
    if (value === undefined) {
      throw new CliError(
        `Missing value for ${arg}`,
        `The flag ${arg} expects a value.`,
        `Example: ldash setup ${arg} <value>`,
      )
    }
    if (arg === '--api-key') opts.apiKey = value
    else if (arg === '--project-uuid') opts.projectUuid = value
    else if (arg === '--oauth-port') {
      const n = Number.parseInt(value, 10)
      if (Number.isNaN(n) || n < 1 || n > 65535) {
        throw new CliError(
          `Invalid --oauth-port value "${value}"`,
          'Port must be a number between 1 and 65535.',
          'Example: ldash setup --oauth-port 8976',
        )
      }
      opts.oauthPort = n
    } else if (arg === '--token-ttl') {
      const n = Number.parseInt(value, 10)
      if (Number.isNaN(n) || n < 1) {
        throw new CliError(
          `Invalid --token-ttl value "${value}"`,
          'Token TTL must be a positive number of hours.',
          'Example: ldash setup --token-ttl 720   (30 days)',
        )
      }
      opts.tokenTtl = n
    }
  }

  if (positional.length > 0) {
    opts.url = positional[0]
  }
  return opts
}

// --- Helpers ---

export function normalizeUrl(input: string): string {
  let url = input.trim()
  if (!url.includes('/') && !url.includes('.') && !url.includes(':')) {
    url = `${url}.lightdash.cloud`
  }
  if (!/^https?:\/\//.test(url)) url = `https://${url}`
  const parsed = new URL(url)
  return `${parsed.protocol}//${parsed.host}`
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function requireInteractive(action: string): void {
  if (isInteractive()) return
  throw new CliError(
    `${action} requires an interactive terminal`,
    'This session is not connected to a terminal (non-TTY detected).',
    [
      'Option 1 — Ask the user to run setup in their own terminal:',
      '    "Please open your terminal and run:  ldash setup"',
      '',
      'Option 2 — Use environment variables (recommended for coding agents):',
      `    export ${ENV_API_URL}=https://app.lightdash.cloud`,
      `    export ${ENV_API_KEY}=<personal-access-token>`,
      `    export ${ENV_PROJECT_UUID}=<project-uuid>`,
      '    ldash config show              # verify',
      '    ldash explore list             # first query',
      '',
      '  Create a Personal Access Token at:',
      '    https://app.lightdash.cloud/generalSettings/personalAccessTokens',
      '',
      'Option 3 — One-shot non-interactive setup:',
      '    ldash setup https://app.lightdash.cloud \\',
      '      --api-key <token> \\',
      '      --project-uuid <uuid>',
    ].join('\n      '),
  )
}

function openManageTokensPage(url: string): void {
  const pageUrl = `${url}/generalSettings/personalAccessTokens`
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open'
  try {
    execFile(cmd, [pageUrl])
  } catch {
    // ignore; URL is printed to stderr separately
  }
}

async function fetchProjects(): Promise<
  { projectUuid: string; name: string }[]
> {
  const { client } = api.createBaseClient()
  const projects = await api.listProjects(client)
  return projects as { projectUuid: string; name: string }[]
}

// --- Result shape for --json ---

interface SetupResult {
  ok: true
  serverUrl: string
  user?: {
    uuid: string
    email: string
    organizationUuid: string
  }
  project?: {
    uuid: string
    name?: string
  }
  expiresAt?: string
  configFile: string
  message: string
}

function renderResult(result: SetupResult, flags: Flags): unknown {
  if (flags.json) return result
  return result.message
}

// --- Interactive project selection ---

async function chooseProjectInteractive(
  projects: { projectUuid: string; name: string }[],
): Promise<{ projectUuid: string; name: string } | undefined> {
  if (projects.length === 0) return undefined
  if (projects.length === 1) {
    console.error(`  ✓ Using the only project: ${projects[0].name}`)
    return projects[0]
  }

  console.error('\nWhich project would you like to use?')
  const maxNameLen = Math.max(...projects.map((p) => p.name.length))
  projects.forEach((p, i) => {
    console.error(`  ${i + 1}) ${p.name.padEnd(maxNameLen)}  ${p.projectUuid}`)
  })

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`Choose [1-${projects.length}]: `)
    const idx = Number.parseInt(answer.trim(), 10) - 1
    if (idx < 0 || idx >= projects.length || Number.isNaN(idx)) {
      throw new CliError(
        `Invalid project selection "${answer.trim()}"`,
        `Expected a number between 1 and ${projects.length}.`,
        'Run "ldash setup" again, or: ldash config set --project-uuid <uuid>',
      )
    }
    return projects[idx]
  } finally {
    rl.close()
  }
}

// --- Flow: project selection (post-auth) ---

async function selectAndSaveProject(
  opts: SetupOptions,
): Promise<{ projectUuid: string; name?: string } | undefined> {
  if (opts.projectUuid) {
    saveConfig({ projectUuid: opts.projectUuid })
    return { projectUuid: opts.projectUuid }
  }

  let projects: { projectUuid: string; name: string }[]
  try {
    projects = await fetchProjects()
  } catch (err) {
    throw new CliError(
      'Could not fetch project list',
      err instanceof Error ? err.message : String(err),
      'Your token was saved. Set the project manually: ldash setup --project-uuid <uuid>',
    )
  }

  if (projects.length === 0) {
    console.error(
      '\n  ⚠  No projects found in your organization.',
      '\n     Create one in Lightdash, then run: ldash setup --project-uuid <uuid>',
    )
    return undefined
  }

  // Non-interactive or --non-interactive: pick the first
  if (opts.nonInteractive || !isInteractive()) {
    const first = projects[0]
    saveConfig({ projectUuid: first.projectUuid })
    if (projects.length > 1) {
      console.error(
        `  ℹ  Auto-selected first project: ${first.name}`,
        '\n     To switch: ldash config set --project-uuid <uuid>',
      )
    }
    return { projectUuid: first.projectUuid, name: first.name }
  }

  const chosen = await chooseProjectInteractive(projects)
  if (!chosen) return undefined
  saveConfig({ projectUuid: chosen.projectUuid })
  return { projectUuid: chosen.projectUuid, name: chosen.name }
}

// --- Flow: OAuth login ---

async function runOAuthFlow(opts: SetupOptions): Promise<SetupResult> {
  requireInteractive('Browser login')

  // Resolve URL: flag > existing config > prompt
  let apiUrl: string | undefined
  if (opts.url) {
    apiUrl = normalizeUrl(opts.url)
  } else {
    const existing = getConfig().apiUrl
    const defaultUrl = existing || 'https://app.lightdash.cloud'
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    try {
      console.error(
        "\nWelcome to ldash! Let's get you connected to Lightdash.\n",
      )
      const answer = await rl.question(`Lightdash URL [${defaultUrl}]: `)
      apiUrl = normalizeUrl(answer.trim() || defaultUrl)
    } finally {
      rl.close()
    }
  }

  // Save URL early so subsequent commands have it even if login fails.
  saveConfig({ apiUrl })

  console.error('\nOpening your browser to sign in...')
  const login = await loginWithOAuth({
    url: apiUrl,
    oauthPort: opts.oauthPort,
    tokenTtlHours: opts.tokenTtl,
    onAuthUrlReady: (authUrl) => {
      console.error(
        "  If your browser doesn't open automatically, visit this URL:",
      )
      console.error(`    ${authUrl}`)
    },
    onServerReady: () => {
      console.error(
        '  Waiting for you to finish signing in... (up to 2 minutes)',
      )
    },
  })

  saveConfig({ apiKey: login.token })

  const project = await selectAndSaveProject(opts)

  const greeting = `${login.user.firstName} ${login.user.lastName}`.trim()
  const lines = [
    '',
    `✓ Signed in as ${greeting || login.user.email} (${login.user.email})`,
    `✓ Access saved (expires ${formatDate(login.expiresAt)})`,
  ]
  if (project?.name) {
    lines.push(`✓ Project: ${project.name}`)
  } else if (project?.projectUuid) {
    lines.push(`✓ Project: ${project.projectUuid}`)
  }
  if (project) {
    lines.push(
      '',
      "🎉 You're all set! Try these commands:",
      '',
      '  ldash explore list              # see available data tables',
      '  ldash dashboard list            # see your dashboards',
      '  ldash --help                    # see everything',
    )
  } else {
    lines.push(
      '',
      'Almost done — finish by selecting a project:',
      '  ldash setup --project-uuid <uuid>',
    )
  }

  return {
    ok: true,
    serverUrl: apiUrl,
    user: {
      uuid: login.user.userUuid,
      email: login.user.email,
      organizationUuid: login.user.organizationUuid,
    },
    project: project && {
      uuid: project.projectUuid,
      name: project.name,
    },
    expiresAt: login.expiresAt.toISOString(),
    configFile: getConfigPath(),
    message: lines.join('\n'),
  }
}

// --- Flow: PAT paste (interactive, legacy) ---

async function runPatFlow(opts: SetupOptions): Promise<SetupResult> {
  requireInteractive('Interactive PAT setup')

  const existing = getConfig()
  let apiUrl: string
  if (opts.url) {
    apiUrl = normalizeUrl(opts.url)
  } else {
    const defaultUrl = existing.apiUrl || 'https://app.lightdash.cloud'
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    try {
      const answer = await rl.question(`Lightdash URL [${defaultUrl}]: `)
      apiUrl = normalizeUrl(answer.trim() || defaultUrl)
    } finally {
      rl.close()
    }
  }
  saveConfig({ apiUrl })

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const patPageUrl = `${apiUrl}/generalSettings/personalAccessTokens`
    console.error('\nOpening your browser to create a Personal Access Token...')
    console.error(`  ${patPageUrl}\n`)
    openManageTokensPage(apiUrl)

    const token = (
      await rl.question('Paste your Personal Access Token: ')
    ).trim()
    if (!token) {
      throw new CliError(
        'No token provided',
        'Setup cancelled: an empty token was entered.',
        'Run "ldash setup --pat" again and paste the token from the browser.',
      )
    }
    saveConfig({ apiKey: token })
  } finally {
    rl.close()
  }

  const project = await selectAndSaveProject(opts)

  const lines = ['', `✓ Token saved to ${getConfigPath()}`]
  if (project?.name) lines.push(`✓ Project: ${project.name}`)
  lines.push('', 'Try: ldash explore list')

  return {
    ok: true,
    serverUrl: apiUrl,
    project: project && { uuid: project.projectUuid, name: project.name },
    configFile: getConfigPath(),
    message: lines.join('\n'),
  }
}

// --- Flow: non-interactive (flags only) ---

async function runNonInteractive(opts: SetupOptions): Promise<SetupResult> {
  const updates: {
    apiUrl?: string
    apiKey?: string
    projectUuid?: string
  } = {}

  if (opts.url) updates.apiUrl = normalizeUrl(opts.url)
  if (opts.apiKey) updates.apiKey = opts.apiKey
  if (opts.projectUuid) updates.projectUuid = opts.projectUuid

  if (Object.keys(updates).length === 0) {
    throw new CliError(
      'Nothing to save',
      'Non-interactive setup requires at least one of: <url>, --api-key, --project-uuid.',
      [
        'Examples:',
        '  ldash setup https://app.lightdash.cloud --api-key <token> --project-uuid <uuid>',
        '  ldash setup --api-key <token>',
        '  ldash setup --project-uuid <uuid>',
      ].join('\n      '),
    )
  }

  saveConfig(updates)

  // If an API key was just saved, optionally verify and list projects.
  let verified = false
  if (updates.apiKey) {
    try {
      const projects = await fetchProjects()
      verified = true
      if (!updates.projectUuid && projects.length > 0 && opts.nonInteractive) {
        const first = projects[0]
        saveConfig({ projectUuid: first.projectUuid })
        updates.projectUuid = first.projectUuid
      }
    } catch {
      // Non-fatal — we still saved the key.
    }
  }

  const cfg = getConfig()
  const lines = [
    `✓ Config saved to ${getConfigPath()}`,
    `    URL:     ${cfg.apiUrl}`,
    `    API Key: ${cfg.apiKey ? `***${cfg.apiKey.slice(-4)}` : '(not set)'}`,
    `    Project: ${cfg.projectUuid ?? '(not set)'}`,
  ]
  if (updates.apiKey && !verified) {
    lines.push(
      '',
      '  ⚠  Could not verify the token against Lightdash. Run:',
      '     ldash explore list',
    )
  }
  if (!cfg.projectUuid) {
    lines.push('', 'Next: ldash setup --project-uuid <uuid>')
  } else {
    lines.push('', 'Try: ldash explore list')
  }

  return {
    ok: true,
    serverUrl: cfg.apiUrl,
    project: cfg.projectUuid ? { uuid: cfg.projectUuid } : undefined,
    configFile: getConfigPath(),
    message: lines.join('\n'),
  }
}

// --- Entry ---

async function runSetup(args: string[], flags: Flags): Promise<unknown> {
  const opts = parseSetupArgs(args)

  // Explicit non-interactive flags take a non-interactive path regardless of TTY.
  const nonInteractiveByFlag =
    opts.apiKey !== undefined ||
    opts.projectUuid !== undefined ||
    opts.nonInteractive

  if (opts.pat) {
    return renderResult(await runPatFlow(opts), flags)
  }

  if (nonInteractiveByFlag) {
    return renderResult(await runNonInteractive(opts), flags)
  }

  // Default: OAuth browser login.
  return renderResult(await runOAuthFlow(opts), flags)
}

export const setupGroup: CommandGroup = {
  description: 'Sign in to Lightdash and choose a project',
  workflow: [
    'ldash setup                                       # sign in with browser (OAuth)',
    'ldash setup https://your-instance.com             # sign in to a specific instance',
    'ldash setup --pat                                 # paste a Personal Access Token',
    'ldash setup --api-key <token> --project-uuid <u>  # non-interactive (agents/CI)',
    '',
    'Flags:',
    '  --oauth-port <n>   pin the local OAuth callback port (firewall allowlist)',
    '  --token-ttl <h>    Personal Access Token TTL in hours (default 720 = 30 days)',
    '  --non-interactive  never prompt; auto-pick first project if needed',
    '  --json             machine-readable output',
  ],
  defaultRun: runSetup,
  handlesEmptyArgs: true,
  commands: {},
}
