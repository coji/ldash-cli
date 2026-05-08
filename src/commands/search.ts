import * as api from '../api.js'
import { parseArgs } from '../args.js'
import { CliError } from '../errors.js'
import type { CommandGroup } from '../types.js'

const ALL_KINDS = [
  'table',
  'field',
  'dimension',
  'metric',
  'chart',
  'dashboard',
  'space',
] as const

type Kind = (typeof ALL_KINDS)[number]

interface SearchHit {
  kind: Kind
  name: string
  uuid?: string
  description?: string
  /** For fields: the parent table. For charts/dashboards: the parent space. */
  parent?: string
  /** Concrete next command an agent can run on this hit. */
  nextCommand: string
}

function parseKinds(raw: string | undefined): Set<Kind> {
  if (!raw) return new Set(ALL_KINDS)
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return new Set(ALL_KINDS)
  const allowed = new Set<string>(ALL_KINDS)
  const out = new Set<Kind>()
  for (const t of tokens) {
    if (!allowed.has(t)) {
      throw new CliError(
        `Unknown --kind value "${t}"`,
        `Valid kinds: ${ALL_KINDS.join(', ')}`,
        'Pass one or more comma-separated kinds, e.g. --kind chart,dashboard',
        'INVALID_INPUT',
      )
    }
    out.add(t as Kind)
  }
  return out
}

function caseInsensitiveIncludes(
  haystack: string | undefined,
  needle: string,
): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

export const searchGroup: CommandGroup = {
  description:
    'Search across explores, fields, metrics, charts, dashboards, and spaces',
  workflow: [
    'ldash search "<query>"                       # search everything',
    'ldash search "<query>" --kind chart          # narrow by kind',
    'ldash search "<query>" --kind chart,dashboard --limit 20',
    '',
    'Kinds: table, field, dimension, metric, chart, dashboard, space',
    'Each hit includes a "nextCommand" you can run to drill in.',
  ],
  commands: {},
  compactFields: [
    'kind',
    'name',
    'uuid',
    'description',
    'parent',
    'nextCommand',
  ],
  defaultRun: async (args) => {
    const parsed = parseArgs(args, {
      positionalMin: 1,
      positionalMax: 1,
      positionals: ['query'],
      string: ['kind'],
      int: { limit: { min: 1, max: 1000 } },
    })
    const query = parsed.positional[0]
    if (query.trim() === '') {
      throw new CliError(
        'Empty search query',
        'A whitespace-only query would match every catalog row and every chart/dashboard/space — almost certainly not what you wanted.',
        'Pass a real query: ldash search "<keyword>"',
        'INVALID_INPUT',
      )
    }
    const kinds = parseKinds(parsed.string.kind)
    const limit = parsed.int.limit ?? 50

    const { client, projectUuid } = api.createClient()
    const wantsCatalog =
      kinds.has('table') ||
      kinds.has('field') ||
      kinds.has('dimension') ||
      kinds.has('metric')

    // Server-side `filter` narrows the catalog response — but only when the
    // user wants exactly one field-shape. With a mix, we fetch everything
    // matching `search` and partition locally. (charts/dashboards/spaces
    // have no server-side text search; they're listed in full and filtered
    // client-side. There's no Lightdash endpoint to help here today.)
    const fieldShapeKinds: Array<'table' | 'dimension' | 'metric'> = []
    if (kinds.has('table')) fieldShapeKinds.push('table')
    if (kinds.has('dimension')) fieldShapeKinds.push('dimension')
    if (kinds.has('metric')) fieldShapeKinds.push('metric')
    const catalogFilter: 'tables' | 'dimensions' | 'metrics' | undefined =
      !kinds.has('field') && fieldShapeKinds.length === 1
        ? (
            {
              table: 'tables',
              dimension: 'dimensions',
              metric: 'metrics',
            } as const
          )[fieldShapeKinds[0]]
        : undefined

    // Run all four list calls in parallel. Each contributes its own slice
    // of hits; we concat at the end so the per-kind ordering stays stable.
    const [catalogHits, chartHits, dashboardHits, spaceHits] =
      await Promise.all([
        wantsCatalog
          ? collectCatalogHits(client, projectUuid, query, kinds, catalogFilter)
          : Promise.resolve<SearchHit[]>([]),
        kinds.has('chart')
          ? collectChartHits(client, projectUuid, query)
          : Promise.resolve<SearchHit[]>([]),
        kinds.has('dashboard')
          ? collectDashboardHits(client, projectUuid, query)
          : Promise.resolve<SearchHit[]>([]),
        kinds.has('space')
          ? collectSpaceHits(client, projectUuid, query)
          : Promise.resolve<SearchHit[]>([]),
      ])

    // Take a per-kind slice before concatenating so a noisy catalog
    // result set doesn't crowd out chart/dashboard/space hits — agents
    // rely on a sample of each kind to choose where to drill in. When
    // `limit` is smaller than the active-kind count the final slice
    // falls back to first-come-first-served (catalog → chart → ...) — a
    // corner case the default limit of 50 keeps unreachable in practice.
    const groups = [catalogHits, chartHits, dashboardHits, spaceHits].filter(
      (g) => g.length > 0,
    )
    if (groups.length === 0) return []
    const perKind = Math.max(1, Math.ceil(limit / groups.length))
    return groups.flatMap((g) => g.slice(0, perKind)).slice(0, limit)
  },
}

async function collectCatalogHits(
  client: api.LightdashClient,
  projectUuid: string,
  query: string,
  kinds: Set<Kind>,
  filter: 'tables' | 'dimensions' | 'metrics' | undefined,
): Promise<SearchHit[]> {
  const items = await api.getCatalog(client, projectUuid, {
    search: query,
    ...(filter ? { filter } : {}),
  })
  const hits: SearchHit[] = []
  const wantsField = kinds.has('field')
  for (const item of items) {
    if (item.type === 'table') {
      if (!kinds.has('table')) continue
      hits.push({
        kind: 'table',
        name: item.name,
        description: item.description,
        nextCommand: `ldash explore get ${item.name}`,
      })
      continue
    }
    const fieldKind: Kind = item.fieldType === 'metric' ? 'metric' : 'dimension'
    if (!kinds.has(fieldKind) && !wantsField) continue
    hits.push({
      kind: fieldKind,
      name: item.name,
      description: item.description,
      parent: item.tableName,
      nextCommand: `ldash explore get ${item.tableName}`,
    })
  }
  return hits
}

async function collectChartHits(
  client: api.LightdashClient,
  projectUuid: string,
  query: string,
): Promise<SearchHit[]> {
  const charts = await api.listCharts(client, projectUuid)
  const hits: SearchHit[] = []
  for (const c of charts) {
    if (
      caseInsensitiveIncludes(c.name, query) ||
      caseInsensitiveIncludes(c.description, query)
    ) {
      hits.push({
        kind: 'chart',
        uuid: c.uuid,
        name: c.name,
        description: c.description,
        parent: c.spaceName,
        nextCommand: `ldash chart get ${c.uuid}`,
      })
    }
  }
  return hits
}

async function collectDashboardHits(
  client: api.LightdashClient,
  projectUuid: string,
  query: string,
): Promise<SearchHit[]> {
  const dashboards = await api.listDashboards(client, projectUuid)
  const hits: SearchHit[] = []
  for (const d of dashboards) {
    if (
      caseInsensitiveIncludes(d.name, query) ||
      caseInsensitiveIncludes(d.description, query)
    ) {
      hits.push({
        kind: 'dashboard',
        uuid: d.uuid,
        name: d.name,
        description: d.description,
        // DashboardBasicDetails carries spaceUuid but no spaceName — surface
        // the UUID so the agent at least knows which space the hit is in.
        parent: d.spaceUuid,
        nextCommand: `ldash dashboard get ${d.uuid}`,
      })
    }
  }
  return hits
}

async function collectSpaceHits(
  client: api.LightdashClient,
  projectUuid: string,
  query: string,
): Promise<SearchHit[]> {
  const spaces = await api.listSpaces(client, projectUuid)
  const hits: SearchHit[] = []
  for (const s of spaces) {
    if (caseInsensitiveIncludes(s.name, query)) {
      hits.push({
        kind: 'space',
        uuid: s.uuid,
        name: s.name,
        nextCommand: `ldash space get ${s.uuid}`,
      })
    }
  }
  return hits
}
