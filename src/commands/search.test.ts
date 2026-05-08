import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../errors.js'
import type { Flags } from '../types.js'

// Mock the api module: createClient + the 4 list functions search depends on.
// Hoisted via vi.mock so the search module sees these stubs at import time.
vi.mock('../api.js', () => {
  return {
    createClient: vi.fn(() => ({
      client: {} as unknown,
      baseUrl: 'http://test',
      apiKey: 'k',
      projectUuid: 'p-uuid',
    })),
    getCatalog: vi.fn(),
    listCharts: vi.fn(),
    listDashboards: vi.fn(),
    listSpaces: vi.fn(),
  }
})

const api = await import('../api.js')
const { searchGroup } = await import('./search.js')

const NO_FLAGS: Flags = {}

beforeEach(() => {
  vi.mocked(api.getCatalog).mockResolvedValue([])
  vi.mocked(api.listCharts).mockResolvedValue([])
  vi.mocked(api.listDashboards).mockResolvedValue([])
  vi.mocked(api.listSpaces).mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

function chart(name: string, uuid: string, description?: string) {
  return {
    uuid,
    name,
    description,
    spaceUuid: 's',
    spaceName: 'Default',
    projectUuid: 'p-uuid',
    organizationUuid: 'o',
    pinnedListUuid: null,
    dashboardUuid: null,
    dashboardName: null,
    slug: name,
  } as Awaited<ReturnType<typeof api.listCharts>>[number]
}

function dashboard(name: string, uuid: string, description?: string) {
  return {
    uuid,
    name,
    description,
    spaceUuid: 's',
    projectUuid: 'p-uuid',
    organizationUuid: 'o',
    updatedAt: '2025-01-01',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    verification: null,
  } as Awaited<ReturnType<typeof api.listDashboards>>[number]
}

function space(name: string, uuid: string) {
  return {
    uuid,
    name,
    slug: name,
    projectUuid: 'p-uuid',
    organizationUuid: 'o',
    inheritParentPermissions: true,
    projectMemberAccessRole: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    parentSpaceUuid: null,
    path: '/',
    access: [],
    inheritsFromOrgOrProject: false,
  } as Awaited<ReturnType<typeof api.listSpaces>>[number]
}

function table(name: string, description?: string) {
  return {
    type: 'table' as const,
    name,
    label: name,
    description,
    catalogSearchUuid: 'cs',
    joinedTables: null,
    aiHints: null,
    icon: null,
    categories: [],
  } as Awaited<ReturnType<typeof api.getCatalog>>[number]
}

function field(
  name: string,
  tableName: string,
  fieldType: 'metric' | 'dimension',
) {
  return {
    type: 'field' as const,
    fieldType,
    name,
    label: name,
    tableLabel: tableName,
    tableName,
    basicType: 'string' as const,
    fieldValueType: 'string' as never,
    catalogSearchUuid: 'cs',
    owner: null,
    aiHints: null,
    icon: null,
    categories: [],
  } as Awaited<ReturnType<typeof api.getCatalog>>[number]
}

function runSearch(...args: string[]): Promise<unknown> {
  const fn = searchGroup.defaultRun
  if (!fn) throw new Error('searchGroup must have defaultRun')
  return fn(args, NO_FLAGS)
}

describe('search command — input validation', () => {
  it('rejects an empty query before hitting the API', async () => {
    await expect(runSearch('')).rejects.toMatchObject({
      name: 'CliError',
      code: 'INVALID_INPUT',
    })
    expect(api.getCatalog).not.toHaveBeenCalled()
    expect(api.listCharts).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only query', async () => {
    await expect(runSearch('   \t  ')).rejects.toBeInstanceOf(CliError)
    expect(api.getCatalog).not.toHaveBeenCalled()
  })

  it('rejects an unknown --kind value', async () => {
    await expect(runSearch('orders', '--kind', 'bogus')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
  })
})

describe('search command — kind routing', () => {
  it('with no --kind, calls all four collectors', async () => {
    await runSearch('orders')
    expect(api.getCatalog).toHaveBeenCalledOnce()
    expect(api.listCharts).toHaveBeenCalledOnce()
    expect(api.listDashboards).toHaveBeenCalledOnce()
    expect(api.listSpaces).toHaveBeenCalledOnce()
  })

  it('with --kind chart, skips catalog/dashboard/space', async () => {
    await runSearch('orders', '--kind', 'chart')
    expect(api.getCatalog).not.toHaveBeenCalled()
    expect(api.listCharts).toHaveBeenCalledOnce()
    expect(api.listDashboards).not.toHaveBeenCalled()
    expect(api.listSpaces).not.toHaveBeenCalled()
  })

  it('passes server-side filter=metrics when only --kind metric', async () => {
    await runSearch('rev', '--kind', 'metric')
    expect(api.getCatalog).toHaveBeenCalledWith(
      expect.anything(),
      'p-uuid',
      expect.objectContaining({ search: 'rev', filter: 'metrics' }),
    )
  })

  it('drops server-side filter when kinds mix table+metric', async () => {
    await runSearch('rev', '--kind', 'table,metric')
    const call = vi.mocked(api.getCatalog).mock.calls[0]
    expect(call?.[2]).toEqual({ search: 'rev' })
    expect(call?.[2]).not.toHaveProperty('filter')
  })
})

describe('search command — hit shaping & quota', () => {
  it('includes a nextCommand drill-down on every hit', async () => {
    vi.mocked(api.listCharts).mockResolvedValue([chart('Orders', 'c1')])
    const result = (await runSearch('orders', '--kind', 'chart')) as Array<{
      nextCommand: string
    }>
    expect(result).toHaveLength(1)
    expect(result[0].nextCommand).toBe('ldash chart get c1')
  })

  it('matches charts by description, not just name', async () => {
    vi.mocked(api.listCharts).mockResolvedValue([
      chart('Sales', 'c1', 'orders dashboard helper'),
    ])
    const result = (await runSearch('orders', '--kind', 'chart')) as unknown[]
    expect(result).toHaveLength(1)
  })

  it('routes catalog field hits to the parent table via nextCommand', async () => {
    vi.mocked(api.getCatalog).mockResolvedValue([
      field('total_revenue', 'orders', 'metric'),
    ])
    const result = (await runSearch('rev', '--kind', 'metric')) as Array<{
      kind: string
      parent: string
      nextCommand: string
    }>
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      kind: 'metric',
      parent: 'orders',
      nextCommand: 'ldash explore get orders',
    })
  })

  it('allocates the global limit fairly across kinds', async () => {
    // 3 hits per kind × 4 kinds = 12 candidates; limit=4 → perKind = 1.
    vi.mocked(api.getCatalog).mockResolvedValue([
      table('orders'),
      table('orders_dim'),
      table('orders_lines'),
    ])
    vi.mocked(api.listCharts).mockResolvedValue([
      chart('orders', 'c1'),
      chart('orders b', 'c2'),
      chart('orders c', 'c3'),
    ])
    vi.mocked(api.listDashboards).mockResolvedValue([
      dashboard('orders', 'd1'),
      dashboard('orders b', 'd2'),
      dashboard('orders c', 'd3'),
    ])
    vi.mocked(api.listSpaces).mockResolvedValue([
      space('orders', 's1'),
      space('orders b', 's2'),
      space('orders c', 's3'),
    ])
    const result = (await runSearch('orders', '--limit', '4')) as Array<{
      kind: string
    }>
    expect(result).toHaveLength(4)
    // One sample per kind — the whole point of the per-kind quota.
    const kinds = new Set(result.map((h) => h.kind))
    expect(kinds.size).toBe(4)
  })

  it('returns [] when nothing matches', async () => {
    expect(await runSearch('zzz')).toEqual([])
  })
})
