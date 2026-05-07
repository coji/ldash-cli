import * as api from '../api.js'
import { getResolvedConfig } from '../config.js'
import { CliError, type CliErrorCode } from '../errors.js'
import { renderable } from '../output.js'
import type { CommandGroup } from '../types.js'

interface CheckResult {
  name: string
  status: 'ok' | 'fail'
  detail: string
  /** Stable error code on failure so agents can branch programmatically. */
  code?: CliErrorCode
}

interface DoctorResult {
  ok: boolean
  /** Convenience: first non-ok status, or null if everything passed. */
  firstFailure: string | null
  checks: CheckResult[]
  configFile: string
}

/** Convert a thrown error into a CheckResult with the most informative
 *  fields we can salvage. CliError carries `code` directly; everything else
 *  is mapped through `mapApiError` first to pick up status-code-aware codes. */
function failed(name: string, err: unknown): CheckResult {
  const cli = err instanceof CliError ? err : api.mapApiError(err)
  return {
    name,
    status: 'fail',
    detail: `${cli.what} — ${cli.why}`,
    code: cli.code,
  }
}

async function runDoctor(): Promise<DoctorResult> {
  const checks: CheckResult[] = []
  const resolved = getResolvedConfig()

  // 1. API URL is set (or defaulted). Always passes since we have a default,
  // but report the source so agents see where the URL came from.
  checks.push({
    name: 'apiUrl',
    status: 'ok',
    detail: `${resolved.apiUrl.value} (source: ${resolved.apiUrl.source})`,
  })

  // 2. API key resolved. If not, every downstream check is skipped — we
  // cannot probe the API without authentication.
  if (!resolved.apiKey.value) {
    checks.push({
      name: 'apiKey',
      status: 'fail',
      detail:
        'No API key. Run "ldash setup" or set LIGHTDASH_API_KEY in the environment.',
      code: 'AUTH_MISSING',
    })
    return finalize(checks, resolved.configFile)
  }
  checks.push({
    name: 'apiKey',
    status: 'ok',
    detail: `present (source: ${resolved.apiKey.source}${resolved.apiKey.envVar ? `, env: ${resolved.apiKey.envVar}` : ''})`,
  })

  // 3. The token is actually valid: probe /api/v1/user. We use a fresh
  // client (not createBaseClient) because we want to surface authentication
  // failures here, not bubble them up as "API key is not set" from the
  // factory.
  const client = api.createApiClient(
    resolved.apiUrl.value,
    resolved.apiKey.value,
  )
  let projects: Awaited<ReturnType<typeof api.listProjects>> | null = null
  try {
    projects = await api.listProjects(client)
    checks.push({
      name: 'auth',
      status: 'ok',
      detail: `token accepted by ${resolved.apiUrl.value} — ${projects.length} project${projects.length === 1 ? '' : 's'} visible`,
    })
  } catch (err) {
    checks.push(failed('auth', err))
    return finalize(checks, resolved.configFile)
  }

  // 4. Project UUID resolved.
  if (!resolved.projectUuid.value) {
    checks.push({
      name: 'project',
      status: 'fail',
      detail:
        'No project UUID configured. Run "ldash setup --project-uuid <uuid>" or set LIGHTDASH_PROJECT_UUID.',
      code: 'PROJECT_MISSING',
    })
    return finalize(checks, resolved.configFile)
  }

  // 5. The configured project actually exists and the user can read it.
  const projectUuid = resolved.projectUuid.value
  const knownInOrg = projects.some((p) => p.projectUuid === projectUuid)
  if (!knownInOrg) {
    checks.push({
      name: 'project',
      status: 'fail',
      detail: `Project UUID "${projectUuid}" is not in the organization visible to this token. Pick one from: ldash project list`,
      code: 'PROJECT_NOT_FOUND',
    })
    return finalize(checks, resolved.configFile)
  }

  try {
    const project = await api.getProject(client, projectUuid)
    checks.push({
      name: 'project',
      status: 'ok',
      detail: `${project.name} (${projectUuid}) — accessible`,
    })
  } catch (err) {
    checks.push(failed('project', err))
  }

  return finalize(checks, resolved.configFile)
}

function finalize(checks: CheckResult[], configFile: string): DoctorResult {
  const firstFailure = checks.find((c) => c.status === 'fail')?.name ?? null
  return {
    ok: firstFailure === null,
    firstFailure,
    checks,
    configFile,
  }
}

function formatDoctor(r: DoctorResult): string {
  const symbol = (s: CheckResult['status']) => (s === 'ok' ? '✓' : '✗')
  const lines = [
    `Doctor: ${r.ok ? '✓ all checks passed' : `✗ failed at "${r.firstFailure}"`}`,
    '',
  ]
  for (const c of r.checks) {
    lines.push(`  ${symbol(c.status)} ${c.name.padEnd(8)} ${c.detail}`)
    if (c.status === 'fail' && c.code) {
      lines.push(`    code: ${c.code}`)
    }
  }
  if (!r.ok) {
    lines.push('')
    lines.push(`  Config file: ${r.configFile}`)
    lines.push('  Re-run "ldash doctor" after fixing the failing check.')
  }
  return lines.join('\n')
}

export const doctorGroup: CommandGroup = {
  description: 'Probe the configured Lightdash instance end-to-end',
  workflow: [
    'ldash doctor                          # human-readable check report',
    'ldash doctor --json                   # machine-readable, with stable codes',
    '',
    'Checks (top to bottom; first failure short-circuits the rest):',
    '  apiUrl    — report the resolved URL and where it came from',
    '  apiKey    — verify a token is configured',
    '  auth     — probe /api/v1/org/projects with the token',
    '  project   — verify the configured project UUID is reachable',
  ],
  commands: {},
  defaultRun: async (_args, flags) => {
    const result = await runDoctor()
    return renderable(result, formatDoctor(result), flags)
  },
  handlesEmptyArgs: true,
}
