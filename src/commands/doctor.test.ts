import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../errors.js'
import type { Flags } from '../types.js'

// Mock both modules doctor depends on so the tests don't touch disk or net.
vi.mock('../api.js', () => ({
  createApiClient: vi.fn(() => ({}) as unknown),
  listProjects: vi.fn(),
  getProject: vi.fn(),
  mapApiError: vi.fn(
    (err: unknown) =>
      new CliError(
        'wrapped',
        err instanceof Error ? err.message : String(err),
        '',
        'UNKNOWN',
      ),
  ),
}))

vi.mock('../config.js', () => ({
  getResolvedConfig: vi.fn(),
}))

const api = await import('../api.js')
const config = await import('../config.js')
const { doctorGroup } = await import('./doctor.js')

const NO_FLAGS: Flags = { json: true } // structured output simplifies assertions

interface Resolved {
  apiKey: { value: string | undefined; source: 'env' | 'file' | 'unset' }
  apiUrl: { value: string; source: 'env' | 'file' | 'default' }
  projectUuid: { value: string | undefined; source: 'env' | 'file' | 'unset' }
}

function setConfig(r: Partial<Resolved> = {}): void {
  vi.mocked(config.getResolvedConfig).mockReturnValue({
    apiKey: r.apiKey ?? { value: 'key-xxx', source: 'file' },
    apiUrl: r.apiUrl ?? {
      value: 'https://app.lightdash.cloud',
      source: 'file',
    },
    projectUuid: r.projectUuid ?? { value: 'p-uuid', source: 'file' },
    configFile: '/tmp/test-config.json',
  } as ReturnType<typeof config.getResolvedConfig>)
}

interface DoctorResult {
  ok: boolean
  firstFailure: string | null
  checks: Array<{
    name: string
    status: 'ok' | 'fail'
    code?: string
    detail: string
  }>
  configFile: string
}

async function runDoctor(): Promise<DoctorResult> {
  const fn = doctorGroup.defaultRun
  if (!fn) throw new Error('doctorGroup must have defaultRun')
  return (await fn([], NO_FLAGS)) as DoctorResult
}

beforeEach(() => {
  setConfig()
  vi.mocked(api.listProjects).mockResolvedValue([
    { projectUuid: 'p-uuid', name: 'Test Project', type: 'DEFAULT' } as Awaited<
      ReturnType<typeof api.listProjects>
    >[number],
  ])
  vi.mocked(api.getProject).mockResolvedValue({
    projectUuid: 'p-uuid',
    name: 'Test Project',
  } as Awaited<ReturnType<typeof api.getProject>>)
  // Reset the global exit code between tests so a previous failure
  // doesn't bleed into the next.
  process.exitCode = undefined
})

afterEach(() => {
  vi.clearAllMocks()
  process.exitCode = undefined
})

describe('doctor command — short-circuit logic', () => {
  it('fails at apiKey when no API key is configured, skips downstream probes', async () => {
    setConfig({ apiKey: { value: undefined, source: 'unset' } })
    const r = await runDoctor()
    expect(r.ok).toBe(false)
    expect(r.firstFailure).toBe('apiKey')
    expect(r.checks.find((c) => c.name === 'apiKey')?.code).toBe('AUTH_MISSING')
    expect(api.listProjects).not.toHaveBeenCalled()
    expect(api.getProject).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('fails at auth when listProjects rejects, skips project probe', async () => {
    vi.mocked(api.listProjects).mockRejectedValue(
      new CliError('401', 'invalid', 'reauth', 'AUTH_INVALID'),
    )
    const r = await runDoctor()
    expect(r.ok).toBe(false)
    expect(r.firstFailure).toBe('auth')
    expect(r.checks.find((c) => c.name === 'auth')?.code).toBe('AUTH_INVALID')
    expect(api.getProject).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('fails at project with PROJECT_MISSING when no project UUID is configured', async () => {
    setConfig({ projectUuid: { value: undefined, source: 'unset' } })
    const r = await runDoctor()
    expect(r.ok).toBe(false)
    expect(r.firstFailure).toBe('project')
    expect(r.checks.find((c) => c.name === 'project')?.code).toBe(
      'PROJECT_MISSING',
    )
    expect(api.getProject).not.toHaveBeenCalled()
  })

  it('fails at project with PROJECT_NOT_FOUND when UUID is not in the org', async () => {
    setConfig({ projectUuid: { value: 'other-uuid', source: 'env' } })
    const r = await runDoctor()
    expect(r.ok).toBe(false)
    expect(r.firstFailure).toBe('project')
    expect(r.checks.find((c) => c.name === 'project')?.code).toBe(
      'PROJECT_NOT_FOUND',
    )
    // No need to call getProject if the UUID isn't even in the org list.
    expect(api.getProject).not.toHaveBeenCalled()
  })

  it('returns ok=true when every check passes', async () => {
    const r = await runDoctor()
    expect(r.ok).toBe(true)
    expect(r.firstFailure).toBe(null)
    expect(r.checks.map((c) => c.name)).toEqual([
      'apiUrl',
      'apiKey',
      'auth',
      'project',
    ])
    expect(r.checks.every((c) => c.status === 'ok')).toBe(true)
    // Crucial: doctor must NOT flip the exit code on success.
    expect(process.exitCode).toBeUndefined()
  })
})
