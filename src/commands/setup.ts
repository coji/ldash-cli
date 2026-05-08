import { statSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { URL } from 'node:url'
import * as api from '../api.js'
import { parseArgs } from '../args.js'
import {
  ENV_API_KEY,
  ENV_API_URL,
  ENV_PROJECT_UUID,
  getConfig,
  getConfigPath,
  saveConfig,
} from '../config.js'
import { CliError } from '../errors.js'
import { loginWithOAuth, openBrowser } from '../oauth.js'
import { maskSecret, renderable } from '../output.js'
import type { CommandGroup, Flags } from '../types.js'

export interface SetupOptions {
  url?: string
  apiKey?: string
  projectUuid?: string
  pat: boolean
  nonInteractive: boolean
  check: boolean
  oauthPort?: number
  tokenTtl?: number
}

const DEFAULT_URL = 'https://app.lightdash.cloud'

export function parseSetupArgs(args: string[]): SetupOptions {
  const parsed = parseArgs(args, {
    positionalMax: 1,
    positionals: ['url'],
    boolean: ['pat', 'non-interactive', 'check'],
    string: ['api-key', 'project-uuid'],
    // `--token-ttl` is capped at 1 year — generous for CLI use, and keeps
    // `Date.now() + ttl * 3_600_000` well away from Date overflow.
    int: {
      'oauth-port': { min: 1, max: 65535 },
      'token-ttl': { min: 1, max: 8760 },
    },
  })

  const opts: SetupOptions = {
    pat: parsed.boolean.pat,
    nonInteractive: parsed.boolean['non-interactive'],
    check: parsed.boolean.check,
  }
  if (parsed.positional.length === 1) opts.url = parsed.positional[0]
  if (parsed.string['api-key'] !== undefined)
    opts.apiKey = parsed.string['api-key']
  if (parsed.string['project-uuid'] !== undefined)
    opts.projectUuid = parsed.string['project-uuid']
  if (parsed.int['oauth-port'] !== undefined)
    opts.oauthPort = parsed.int['oauth-port']
  if (parsed.int['token-ttl'] !== undefined)
    opts.tokenTtl = parsed.int['token-ttl']
  return opts
}

export function normalizeUrl(input: string): string {
  let url = input.trim()
  if (!url.includes('/') && !url.includes('.') && !url.includes(':')) {
    url = `${url}.lightdash.cloud`
  }
  if (!/^https?:\/\//.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    throw new CliError(
      `Invalid URL "${input}"`,
      'Could not parse the provided URL.',
      'Expected something like: https://app.lightdash.cloud',
      'INVALID_INPUT',
    )
  }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function requireInteractive(action: string): void {
  if (isInteractive()) return
  // No code matches "needs a TTY" cleanly; INVALID_INPUT is the closest fit
  // (the user-supplied execution context is wrong) and lets agents branch on
  // it the same way they branch on missing args.
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
    'INVALID_INPUT',
  )
}

async function promptForUrl(banner?: string): Promise<string> {
  if (banner) console.error(banner)
  const defaultUrl = getConfig().apiUrl || DEFAULT_URL
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`Lightdash URL [${defaultUrl}]: `)
    return normalizeUrl(answer.trim() || defaultUrl)
  } finally {
    rl.close()
  }
}

function resolveUrl(opts: SetupOptions, banner?: string): Promise<string> {
  if (opts.url) return Promise.resolve(normalizeUrl(opts.url))
  return promptForUrl(banner)
}

/**
 * Read a line of input without echoing it back to the terminal — used for
 * the PAT paste prompt so the token never lands in the user's scrollback.
 * Falls back to plain readline if stdin is not a TTY (no echo control there).
 *
 * The terminal restoration is wrapped in a try/finally so the user is never
 * left in raw-mode if the surrounding flow throws between the await points.
 */
async function askHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    try {
      return await rl.question(prompt)
    } finally {
      rl.close()
    }
  }
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  try {
    let buffer = ''
    return await new Promise<string>((resolve) => {
      const onData = (chunk: string) => {
        for (const ch of chunk) {
          const code = ch.charCodeAt(0)
          if (code === 0x0d || code === 0x0a) {
            process.stdin.removeListener('data', onData)
            resolve(buffer)
            return
          }
          if (code === 0x03) {
            process.stdin.removeListener('data', onData)
            // Node restores cooked mode on exit; no further cleanup needed.
            process.exit(130)
          }
          if (code === 0x7f || code === 0x08) {
            buffer = buffer.slice(0, -1)
            continue
          }
          if (code < 0x20) continue
          buffer += ch
        }
      }
      process.stdin.on('data', onData)
    })
  } finally {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.pause()
    process.stdout.write('\n')
  }
}

// Project shape comes straight from the OpenAPI spec via api.listProjects so
// any drift in the upstream type fails the build instead of slipping past
// an `as` cast.
type Project = Awaited<ReturnType<typeof api.listProjects>>[number]

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

async function chooseProjectInteractive(
  projects: Project[],
): Promise<Project | undefined> {
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
    const answer = (await rl.question(`Choose [1-${projects.length}]: `)).trim()
    // Strict digit-only check — Number.parseInt('1abc', 10) would return 1
    // and silently pick project 1 even though the user typed garbage.
    const valid = /^\d+$/.test(answer)
    const idx = valid ? Number(answer) - 1 : -1
    if (!valid || idx < 0 || idx >= projects.length) {
      throw new CliError(
        `Invalid project selection "${answer}"`,
        `Expected a number between 1 and ${projects.length}.`,
        'Run "ldash setup" again, or: ldash config set --project-uuid <uuid>',
        'INVALID_INPUT',
      )
    }
    return projects[idx]
  } finally {
    rl.close()
  }
}

async function selectAndSaveProject(
  opts: SetupOptions,
): Promise<{ projectUuid: string; name?: string } | undefined> {
  if (opts.projectUuid) {
    saveConfig({ projectUuid: opts.projectUuid })
    return { projectUuid: opts.projectUuid }
  }

  let projects: Project[]
  try {
    const { client } = api.createBaseClient()
    projects = await api.listProjects(client)
  } catch (err) {
    throw new CliError(
      'Could not fetch project list',
      err instanceof Error ? err.message : String(err),
      'Your token was saved. Set the project manually: ldash setup --project-uuid <uuid>',
      'UPSTREAM',
    )
  }

  if (projects.length === 0) {
    console.error(
      '\n  ⚠  No projects found in your organization.',
      '\n     Create one in Lightdash, then run: ldash setup --project-uuid <uuid>',
    )
    return undefined
  }

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

async function runOAuthFlow(opts: SetupOptions): Promise<SetupResult> {
  requireInteractive('Browser login')

  const apiUrl = await resolveUrl(
    opts,
    "\nWelcome to ldash! Let's get you connected to Lightdash.\n",
  )

  // Save URL before login so subsequent commands have it even if OAuth fails.
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

async function runPatFlow(opts: SetupOptions): Promise<SetupResult> {
  requireInteractive('Interactive PAT setup')

  const apiUrl = await resolveUrl(opts)
  saveConfig({ apiUrl })

  const patPageUrl = `${apiUrl}/generalSettings/personalAccessTokens`
  console.error('\nOpening your browser to create a Personal Access Token...')
  console.error(`  ${patPageUrl}\n`)
  await openBrowser(patPageUrl)

  // Use a hidden prompt so the pasted token doesn't land in scrollback.
  const token = (await askHidden('Paste your Personal Access Token: ')).trim()
  if (!token) {
    throw new CliError(
      'No token provided',
      'Setup cancelled: an empty token was entered.',
      'Run "ldash setup --pat" again and paste the token from the browser.',
      'INVALID_INPUT',
    )
  }

  // Verify the token against the Lightdash API before persisting it, so a
  // typo or expired PAT doesn't leave a broken credential on disk.
  try {
    await api.listProjects(api.createApiClient(apiUrl, token))
  } catch (err) {
    throw new CliError(
      'Token verification failed',
      err instanceof Error ? err.message : String(err),
      'Double-check that you copied the full Personal Access Token, then run "ldash setup --pat" again.',
      'AUTH_INVALID',
    )
  }
  saveConfig({ apiKey: token })

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
      'MISSING_ARGUMENT',
    )
  }

  // Optimistically verify the new key (and, if requested, pick a default
  // project) against a throwaway client before writing anything to disk —
  // so the common case is a single config file write.
  let verified = false
  if (updates.apiKey) {
    const effectiveUrl = updates.apiUrl ?? getConfig().apiUrl
    try {
      const projects = await api.listProjects(
        api.createApiClient(effectiveUrl, updates.apiKey),
      )
      verified = true
      if (!updates.projectUuid && projects.length > 0 && opts.nonInteractive) {
        updates.projectUuid = projects[0].projectUuid
      }
    } catch {
      // Verification is best-effort; we still persist the key below.
    }
  }

  saveConfig(updates)

  const cfg = getConfig()
  const lines = [
    `✓ Config saved to ${getConfigPath()}`,
    `    URL:     ${cfg.apiUrl}`,
    `    API Key: ${maskSecret(cfg.apiKey)}`,
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

export type SetupFlow = 'check' | 'pat' | 'scripted' | 'oauth'

/**
 * Pick which setup flow to run for a given set of options.
 *
 * `--check` is a non-interactive readiness probe and takes precedence over
 * everything else so an agent can call `setup --check` even with stray flags
 * inherited from prior invocations.
 *
 * `--non-interactive` on its own is a prompt-suppressor (honored by the
 * OAuth and PAT flows via selectAndSaveProject), not a flow selector — we
 * only route to the scripted writer when the user actually supplied
 * something for it to write.
 */
export function selectSetupFlow(opts: SetupOptions): SetupFlow {
  if (opts.check) return 'check'
  if (opts.pat) return 'pat'
  if (opts.apiKey !== undefined || opts.projectUuid !== undefined)
    return 'scripted'
  return 'oauth'
}

interface SetupCheckResult {
  ok: boolean
  /** Can OAuth/PAT prompts run here? Requires both stdin and stdout to be a TTY. */
  interactive: boolean
  /** Stable presence flags so agents can branch without parsing the message. */
  envVars: {
    LIGHTDASH_API_URL: boolean
    LIGHTDASH_API_KEY: boolean
    LIGHTDASH_PROJECT_UUID: boolean
  }
  config: {
    /** True if a config file lives at `getConfigPath()`. */
    exists: boolean
    /** True if either env var or config file resolved a usable API key. */
    apiKeyResolved: boolean
    /** True if either env var or config file resolved a project UUID. */
    projectResolved: boolean
  }
  /** Human-readable next step for the current state. */
  recommendation: string
  configFile: string
}

function runSetupCheck(): SetupCheckResult {
  const interactive = isInteractive()
  const cfg = getConfig()
  const apiKeyResolved = Boolean(cfg.apiKey)
  const projectResolved = Boolean(cfg.projectUuid)
  const ready = apiKeyResolved && projectResolved

  let recommendation: string
  if (ready) {
    recommendation =
      'Ready. Try: ldash explore list   (or run "ldash doctor" to verify)'
  } else if (!interactive && !apiKeyResolved) {
    recommendation =
      'Non-interactive shell: set LIGHTDASH_API_URL, LIGHTDASH_API_KEY, LIGHTDASH_PROJECT_UUID. PAT page: <instance>/generalSettings/personalAccessTokens'
  } else if (!interactive && apiKeyResolved && !projectResolved) {
    recommendation =
      'Set LIGHTDASH_PROJECT_UUID, or run: ldash setup --api-key <token> --project-uuid <uuid>'
  } else if (interactive && !apiKeyResolved) {
    recommendation = 'Run: ldash setup'
  } else {
    recommendation = 'Run: ldash setup --project-uuid <uuid>'
  }

  return {
    ok: ready,
    interactive,
    envVars: {
      LIGHTDASH_API_URL: process.env[ENV_API_URL] !== undefined,
      LIGHTDASH_API_KEY: process.env[ENV_API_KEY] !== undefined,
      LIGHTDASH_PROJECT_UUID: process.env[ENV_PROJECT_UUID] !== undefined,
    },
    config: {
      exists: configFileExists(),
      apiKeyResolved,
      projectResolved,
    },
    recommendation,
    configFile: getConfigPath(),
  }
}

function configFileExists(): boolean {
  try {
    return statSync(getConfigPath()).isFile()
  } catch {
    return false
  }
}

function formatSetupCheck(r: SetupCheckResult): string {
  const lines = [
    `Environment readiness: ${r.ok ? '✓ ready' : '✗ not ready'}`,
    `  Interactive (TTY):   ${r.interactive ? 'yes' : 'no'}`,
    `  LIGHTDASH_API_URL:   ${r.envVars.LIGHTDASH_API_URL ? 'set' : 'unset'}`,
    `  LIGHTDASH_API_KEY:   ${r.envVars.LIGHTDASH_API_KEY ? 'set' : 'unset'}`,
    `  LIGHTDASH_PROJECT_UUID: ${r.envVars.LIGHTDASH_PROJECT_UUID ? 'set' : 'unset'}`,
    `  Config file:         ${r.config.exists ? r.configFile : '(none)'}`,
    `  API key resolved:    ${r.config.apiKeyResolved ? 'yes' : 'no'}`,
    `  Project resolved:    ${r.config.projectResolved ? 'yes' : 'no'}`,
    '',
    `Recommendation: ${r.recommendation}`,
  ]
  return lines.join('\n')
}

async function runSetup(args: string[], flags: Flags): Promise<unknown> {
  const opts = parseSetupArgs(args)
  const flow = selectSetupFlow(opts)
  if (flow === 'check') {
    const result = runSetupCheck()
    return renderable(result, formatSetupCheck(result), flags)
  }
  let result: SetupResult
  switch (flow) {
    case 'pat':
      result = await runPatFlow(opts)
      break
    case 'scripted':
      result = await runNonInteractive(opts)
      break
    case 'oauth':
      result = await runOAuthFlow(opts)
      break
  }
  return renderable(result, result.message, flags)
}

export const setupGroup: CommandGroup = {
  description: 'Sign in to Lightdash and choose a project',
  workflow: [
    'ldash setup                                       # sign in with browser (OAuth)',
    'ldash setup https://your-instance.com             # sign in to a specific instance',
    'ldash setup --pat                                 # paste a Personal Access Token',
    'ldash setup --check                               # report whether this env can run setup',
    'ldash setup --api-key <token> --project-uuid <u>  # non-interactive (agents/CI)',
    '',
    'Flags:',
    '  --check            only report environment readiness; do not run any flow',
    '  --oauth-port <n>   pin the local OAuth callback port (firewall allowlist)',
    '  --token-ttl <h>    Personal Access Token TTL in hours (default 720 = 30 days, max 8760 = 1 year)',
    '  --non-interactive  skip the project picker (auto-pick the first project)',
    '  --json             machine-readable output',
    '',
    'Agents/CI — prefer env vars over running setup:',
    '  export LIGHTDASH_API_URL=https://app.lightdash.cloud',
    '  export LIGHTDASH_API_KEY=<personal-access-token>',
    '  export LIGHTDASH_PROJECT_UUID=<project-uuid>',
    '  ldash config show --json | jq .ready             # true once all three resolve',
    '  ldash doctor                                     # verifies token + project access',
  ],
  defaultRun: runSetup,
  handlesEmptyArgs: true,
  commands: {},
}
