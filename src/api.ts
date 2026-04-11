import createOpenApiFetchClient from 'openapi-fetch'
import { getConfig, getConfigPath } from './config.js'
import { CliError } from './errors.js'
import type { components, operations, paths } from './generated/api.js'

export type LightdashClient = ReturnType<typeof createOpenApiFetchClient<paths>>

export function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `ApiKey ${apiKey}` }
}

export function createBaseClient(): {
  client: LightdashClient
  baseUrl: string
  apiKey: string
} {
  const config = getConfig()
  if (!config.apiKey) {
    throw new CliError(
      'API key is not set',
      'Authentication is required to access the Lightdash API.',
      `Set it via environment variable or run: ldash setup --api-key <token>\nConfig file: ${getConfigPath()}`,
    )
  }
  const client = createOpenApiFetchClient<paths>({
    baseUrl: config.apiUrl,
    headers: authHeaders(config.apiKey),
  })
  return { client, baseUrl: config.apiUrl, apiKey: config.apiKey }
}

export function createClient(): {
  client: LightdashClient
  baseUrl: string
  apiKey: string
  projectUuid: string
} {
  const base = createBaseClient()
  const { projectUuid } = getConfig()
  if (!projectUuid) {
    throw new CliError(
      'Project UUID is not set',
      'Most commands require a project context.',
      `Run "ldash project list" to find your project UUID,\nthen: ldash setup --project-uuid <uuid>\nConfig file: ${getConfigPath()}`,
    )
  }
  return { ...base, projectUuid }
}

function extractApiError(
  error: unknown,
): { name?: string; message?: string } | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const inner = (error as Record<string, unknown>).error
  if (typeof inner !== 'object' || inner === null) return undefined
  return inner as { name?: string; message?: string }
}

function throwOnError(error: unknown): never {
  const apiError = extractApiError(error)
  const name = apiError?.name
  const message = apiError?.message ?? 'no message'

  if (name === 'NotFoundError') {
    throw new CliError(
      'Resource not found',
      message,
      'Check the identifier. Use the "list" command to see valid options.',
    )
  }
  if (name === 'AuthorizationError') {
    throw new CliError(
      'Unauthorized',
      'Your API key is invalid or expired.',
      'Check LIGHTDASH_API_KEY. Generate a new token in Lightdash settings.',
    )
  }
  if (name === 'ForbiddenError') {
    throw new CliError(
      'Forbidden',
      message,
      'You may not have permission to access this resource.',
    )
  }
  throw new CliError(
    'Lightdash API error',
    name ? `${name}: ${message}` : message,
    'Run with --help for usage details.',
  )
}

export async function listProjects(client: LightdashClient) {
  const { data, error } = await client.GET('/api/v1/org/projects', {})
  if (error) throwOnError(error)
  return data.results
}

export async function getUserAttributes(client: LightdashClient) {
  const { data, error } = await client.GET('/api/v1/org/attributes', {})
  if (error) throwOnError(error)
  return data.results
}

export async function getProject(client: LightdashClient, projectUuid: string) {
  const { data, error } = await client.GET('/api/v1/projects/{projectUuid}', {
    params: { path: { projectUuid } },
  })
  if (error) throwOnError(error)
  return data.results
}

export async function listSpaces(client: LightdashClient, projectUuid: string) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/spaces',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getSpaceDetail(
  client: LightdashClient,
  projectUuid: string,
  spaceUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/spaces/{spaceUuid}',
    { params: { path: { projectUuid, spaceUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function listCharts(client: LightdashClient, projectUuid: string) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/charts',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function listDashboards(
  client: LightdashClient,
  projectUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/dashboards',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getCustomMetrics(
  client: LightdashClient,
  projectUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/custom-metrics',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function validateProject(
  client: LightdashClient,
  projectUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/validate',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getCatalog(client: LightdashClient, projectUuid: string) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/dataCatalog',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getMetricsCatalog(
  client: LightdashClient,
  projectUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/dataCatalog/metrics',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getMetadata(
  client: LightdashClient,
  projectUuid: string,
  table: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/dataCatalog/{table}/metadata',
    { params: { path: { projectUuid, table } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getAnalytics(
  client: LightdashClient,
  projectUuid: string,
  table: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/dataCatalog/{table}/analytics',
    { params: { path: { projectUuid, table } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getChartsAsCode(
  client: LightdashClient,
  projectUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/charts/code',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getDashboardsAsCode(
  client: LightdashClient,
  projectUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/dashboards/code',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function listExplores(
  client: LightdashClient,
  projectUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/explores',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getExplore(
  client: LightdashClient,
  projectUuid: string,
  exploreId: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/explores/{exploreId}',
    { params: { path: { projectUuid, exploreId } } },
  )
  if (error) throwOnError(error)
  return data.results
}

type Filters = components['schemas']['MetricQueryRequest']['filters']
type SortField = components['schemas']['SortField']

export async function runQuery(
  client: LightdashClient,
  projectUuid: string,
  exploreId: string,
  body: {
    dimensions: string[]
    metrics: string[]
    filters?: Filters
    sorts?: SortField[]
    limit?: number
    tableCalculations?: components['schemas']['TableCalculation'][]
    additionalMetrics?: components['schemas']['AdditionalMetric'][]
  },
) {
  const { data, error } = await client.POST(
    '/api/v1/projects/{projectUuid}/explores/{exploreId}/runQuery',
    {
      params: { path: { projectUuid, exploreId } },
      body: {
        exploreName: exploreId,
        dimensions: body.dimensions,
        metrics: body.metrics,
        filters: body.filters ?? {},
        sorts: body.sorts ?? [],
        limit: body.limit ?? 500,
        tableCalculations: body.tableCalculations ?? [],
        additionalMetrics: body.additionalMetrics ?? [],
      },
    },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function runSqlQuery(
  client: LightdashClient,
  projectUuid: string,
  sql: string,
  limit?: number,
) {
  const { data, error } = await client.POST(
    '/api/v1/projects/{projectUuid}/sqlQuery',
    {
      params: { path: { projectUuid } },
      body: { sql, limit },
    },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function calculateTotal(
  client: LightdashClient,
  projectUuid: string,
  body: {
    exploreName: string
    dimensions: string[]
    metrics: string[]
    filters?: Filters
    tableCalculations?: components['schemas']['TableCalculation'][]
  },
) {
  const metricQuery: components['schemas']['MetricQueryRequest'] = {
    exploreName: body.exploreName,
    dimensions: body.dimensions,
    metrics: body.metrics,
    filters: body.filters ?? {},
    tableCalculations: body.tableCalculations ?? [],
    sorts: [],
    limit: 500,
  }
  const { data, error } = await client.POST(
    '/api/v1/projects/{projectUuid}/calculate-total',
    {
      params: { path: { projectUuid } },
      body: { explore: body.exploreName, metricQuery },
    },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getChartResults(
  client: LightdashClient,
  chartUuid: string,
) {
  const { data, error } = await client.POST(
    '/api/v1/saved/{chartUuid}/results',
    {
      params: { path: { chartUuid } },
      body: { invalidateCache: false },
    },
  )
  if (error) throwOnError(error)
  return data.results
}

// chart-and-results uses the deprecated PostDashboardTile operation whose
// required body fields (dashboardUuid, dashboardSorts, dashboardFilters)
// are not available in a standalone chart context. Lightdash accepts an
// empty body for backward compatibility, so we cast here intentionally.
export async function getChartAndResults(
  client: LightdashClient,
  chartUuid: string,
) {
  const { data, error } = await client.POST(
    '/api/v1/saved/{chartUuid}/chart-and-results',
    {
      params: { path: { chartUuid } },
      body: {} as never,
    },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getChartHistory(
  client: LightdashClient,
  chartUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/saved/{chartUuid}/history',
    { params: { path: { chartUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getChartVersion(
  client: LightdashClient,
  chartUuid: string,
  versionUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v1/saved/{chartUuid}/version/{versionUuid}',
    { params: { path: { chartUuid, versionUuid } } },
  )
  if (error) throwOnError(error)
  return data.results
}

export async function getDashboardDetail(
  client: LightdashClient,
  projectUuid: string,
  dashboardUuid: string,
) {
  const { data, error } = await client.GET(
    '/api/v2/projects/{projectUuid}/dashboards/{dashboardUuidOrSlug}',
    {
      params: { path: { projectUuid, dashboardUuidOrSlug: dashboardUuid } },
    },
  )
  if (error) throwOnError(error)
  return data.results
}

type RunMetricTotal = operations['runMetricTotal']
type MetricTotalQuery = RunMetricTotal['parameters']['query'] &
  NonNullable<RunMetricTotal['requestBody']>['content']['application/json']

export async function runMetricsExplorerQuery(
  client: LightdashClient,
  projectUuid: string,
  explore: string,
  metric: string,
  params: MetricTotalQuery,
) {
  const missing = (
    ['timeFrame', 'granularity', 'startDate', 'endDate'] as const
  ).filter((key) => !params?.[key])
  if (missing.length > 0) {
    throw new CliError(
      `Missing required field(s) in --body: ${missing.join(', ')}`,
      'metrics-explorer requires timeFrame, granularity, startDate, and endDate.',
      `Example: --body '{"timeFrame":"DAY","granularity":"DAY","startDate":"2024-01-01","endDate":"2024-12-31"}'`,
    )
  }

  const { data, error } = await client.POST(
    '/api/v1/projects/{projectUuid}/metricsExplorer/{explore}/{metric}/runMetricTotal',
    {
      params: {
        path: { projectUuid, explore, metric },
        query: {
          timeFrame: params.timeFrame,
          granularity: params.granularity,
          startDate: params.startDate,
          endDate: params.endDate,
        },
      },
      body: {
        rollingDays: params.rollingDays,
        comparisonType: params.comparisonType,
      },
    },
  )
  if (error) throwOnError(error)
  return data.results
}
