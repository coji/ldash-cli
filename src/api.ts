import { createLightdashClient } from 'lightdash-client-typescript-fetch'
import { getConfig, getConfigPath } from './config.js'

type LightdashClient = ReturnType<typeof createLightdashClient>

export type { LightdashClient }

export function createBaseClient(): {
  client: LightdashClient
  baseUrl: string
  apiKey: string
} {
  const config = getConfig()
  if (!config.apiKey) {
    throw new Error(
      `LIGHTDASH_API_KEY is not set.\nSet it via environment variable or run: ldash config set --api-key <token>\nConfig file: ${getConfigPath()}`,
    )
  }
  const client = createLightdashClient(config.apiUrl, {
    headers: { Authorization: `ApiKey ${config.apiKey}` },
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
    throw new Error(
      `LIGHTDASH_PROJECT_UUID is not set.\nSet it via environment variable or run: ldash config set --project-uuid <uuid>\nConfig file: ${getConfigPath()}`,
    )
  }
  return { ...base, projectUuid }
}

function throwOnError(error: {
  error: { name: string; message?: string }
}): never {
  throw new Error(
    `Lightdash API error: ${error.error.name}, ${error.error.message ?? 'no message'}`,
  )
}

// --- Organization ---

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

// --- Project ---

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

// --- Data Catalog ---

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

// --- Charts as Code ---

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

// --- Explores ---

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

// --- Query ---

export async function runQuery(
  client: LightdashClient,
  projectUuid: string,
  exploreId: string,
  body: {
    dimensions: string[]
    metrics: string[]
    filters?: Record<string, unknown>
    sorts?: { fieldId: string; descending: boolean }[]
    limit?: number
    tableCalculations?: Record<string, unknown>[]
    additionalMetrics?: Record<string, unknown>[]
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
        filters: (body.filters ?? {}) as never,
        sorts: body.sorts ?? [],
        limit: body.limit ?? 500,
        tableCalculations: (body.tableCalculations ?? []) as never,
        additionalMetrics: (body.additionalMetrics ?? []) as never,
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
    filters?: Record<string, unknown>
    tableCalculations?: Record<string, unknown>[]
  },
) {
  const { data, error } = await client.POST(
    '/api/v1/projects/{projectUuid}/calculate-total',
    {
      params: { path: { projectUuid } },
      body: {
        exploreName: body.exploreName,
        dimensions: body.dimensions,
        metrics: body.metrics,
        filters: (body.filters ?? {}) as never,
        tableCalculations: (body.tableCalculations ?? []) as never,
      },
    },
  )
  if (error) throwOnError(error)
  return data.results
}

// --- Charts ---

export async function getChartResults(
  client: LightdashClient,
  chartUuid: string,
) {
  const { data, error } = await client.POST(
    '/api/v1/saved/{chartUuid}/results',
    {
      params: { path: { chartUuid } },
      body: {} as never,
    },
  )
  if (error) throwOnError(error)
  return data.results
}

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

// --- Dashboard (v2, direct fetch) ---

export async function getDashboardDetail(
  baseUrl: string,
  apiKey: string,
  projectUuid: string,
  dashboardUuid: string,
) {
  const response = await fetch(
    `${baseUrl}/api/v2/projects/${projectUuid}/dashboards/${dashboardUuid}`,
    { headers: { Authorization: `ApiKey ${apiKey}` } },
  )
  if (!response.ok) {
    throw new Error(
      `Lightdash API error: ${response.status} ${response.statusText}`,
    )
  }
  const json = (await response.json()) as Record<string, unknown>
  return json.results
}

// --- Metrics Explorer ---

export async function runMetricsExplorerQuery(
  client: LightdashClient,
  projectUuid: string,
  explore: string,
  metric: string,
  body: Record<string, unknown>,
) {
  const { data, error } = await client.POST(
    '/api/v1/projects/{projectUuid}/metricsExplorer/{explore}/{metric}/runMetricExplorerQuery',
    {
      params: { path: { projectUuid, explore, metric } },
      body: body as never,
    },
  )
  if (error) throwOnError(error)
  return data.results
}
