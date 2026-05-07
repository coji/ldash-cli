import createOpenApiFetchClient from 'openapi-fetch'
import { getConfig, getConfigPath, getResolvedConfig } from './config.js'
import { CliError, type CliErrorCode } from './errors.js'
import type { components, operations, paths } from './generated/api.js'

export type LightdashClient = ReturnType<typeof createOpenApiFetchClient<paths>>

export function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `ApiKey ${apiKey}` }
}

/**
 * fetch() wrapper that converts transport-level failures (DNS, TLS,
 * connection refused, etc.) into CliError so they surface through the
 * --json envelope like every other user-facing error. HTTP-level errors
 * (!response.ok) are still the caller's responsibility to handle.
 */
export async function safeFetch(
  url: string,
  init: RequestInit,
  context: { what: string; hint: string },
): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    throw new CliError(
      context.what,
      `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
      context.hint,
      'NETWORK',
    )
  }
}

/**
 * Typed client factory. With `apiKey`, bakes `Authorization: ApiKey <key>`
 * into the default headers for every call. Without, returns an
 * unauthenticated client — used by the OAuth sign-in flow where the
 * Authorization header is supplied per-call (a short-lived OAuth access
 * token for PAT creation, then the freshly minted PAT for /api/v1/user).
 */
export function createApiClient(
  baseUrl: string,
  apiKey?: string,
): LightdashClient {
  return createOpenApiFetchClient<paths>({
    baseUrl,
    ...(apiKey ? { headers: authHeaders(apiKey) } : {}),
  })
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
      `Sign in with:  ldash setup\nOr set env var: LIGHTDASH_API_KEY=<token>\nConfig file: ${getConfigPath()}`,
      'AUTH_MISSING',
    )
  }
  const client = createApiClient(config.apiUrl, config.apiKey)
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
      'PROJECT_MISSING',
    )
  }
  return { ...base, projectUuid }
}

/** Resource being accessed when an API call failed. Lets the error mapper
 *  produce a hint like "use `ldash explore list`" instead of a generic
 *  "use the list command". Optional: callers that don't have a single
 *  obvious resource (e.g. the API escape hatch) can omit it. */
export type ResourceKind =
  | 'project'
  | 'explore'
  | 'chart'
  | 'dashboard'
  | 'space'
  | 'catalog'
  | 'metric'
  | 'field'
  | 'table'
  | 'org'

export interface ResourceContext {
  resource?: ResourceKind
  /** Identifier the user passed in (explore name, chart UUID, etc.). Echoed in `why`. */
  id?: string
}

interface ApiErrorInner {
  name?: string
  message?: string
  statusCode?: number
}

function extractApiError(error: unknown): ApiErrorInner | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const inner = (error as Record<string, unknown>).error
  if (typeof inner !== 'object' || inner === null) return undefined
  return inner as ApiErrorInner
}

const NEXT_STEP_BY_RESOURCE: Record<ResourceKind, string> = {
  project: 'ldash project list',
  explore: 'ldash explore list',
  chart: 'ldash chart list',
  dashboard: 'ldash dashboard list',
  space: 'ldash space list',
  catalog: 'ldash catalog list',
  metric: 'ldash catalog metrics',
  field: 'ldash explore get <exploreId>',
  table: 'ldash catalog list',
  org: 'ldash org user-attributes',
}

const NOT_FOUND_CODE_BY_RESOURCE: Record<ResourceKind, CliErrorCode> = {
  project: 'PROJECT_NOT_FOUND',
  explore: 'EXPLORE_NOT_FOUND',
  chart: 'CHART_NOT_FOUND',
  dashboard: 'DASHBOARD_NOT_FOUND',
  space: 'SPACE_NOT_FOUND',
  catalog: 'RESOURCE_NOT_FOUND',
  metric: 'METRIC_NOT_FOUND',
  field: 'FIELD_NOT_FOUND',
  table: 'RESOURCE_NOT_FOUND',
  org: 'RESOURCE_NOT_FOUND',
}

function authHint(): string {
  const apiKeyField = getResolvedConfig().apiKey
  if (apiKeyField.source === 'env' && apiKeyField.envVar) {
    const env = apiKeyField.envVar
    return [
      `This key comes from environment variable ${env}.`,
      `  - Update (POSIX):       export ${env}=<new-token>`,
      `  - Update (PowerShell):  $env:${env} = "<new-token>"`,
      `  - Or unset (POSIX):     unset ${env}`,
      `  - Or unset (PowerShell): Remove-Item Env:${env}`,
      '  - Or re-run sign in:    ldash setup',
    ].join('\n      ')
  }
  if (apiKeyField.source === 'file') {
    return [
      `This key is stored in ${getConfigPath()}.`,
      '  Re-authenticate with:  ldash setup',
    ].join('\n      ')
  }
  return 'Sign in with:  ldash setup'
}

/** Look at a 400 message and decide whether it's really a bad field reference
 *  in disguise. Lightdash's MetricQuery validator produces messages like
 *  "Dimension X does not exist" or "Field X cannot be found in explore Y". */
function looksLikeFieldError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    /\b(field|dimension|metric)\b/.test(m) &&
    /(not exist|not found|does not|cannot be found|unknown|invalid)/.test(m)
  )
}

/**
 * Map a Lightdash API error envelope (or any thrown value) into a CliError
 * with a stable code and a hint that points the user (or coding agent) at
 * the next concrete command to run.
 *
 * Pattern matching cascades: status code first (most reliable), then
 * `error.name`, then a few message-text heuristics for cases like a 400
 * "field does not exist" that should really be classified as
 * FIELD_NOT_FOUND.
 */
export function mapApiError(
  error: unknown,
  ctx: ResourceContext = {},
): CliError {
  const apiError = extractApiError(error)
  const name = apiError?.name
  const message = apiError?.message ?? 'no message'
  const statusCode = apiError?.statusCode

  const idSuffix = ctx.id ? ` (id: ${ctx.id})` : ''

  // 401 — credentials problem. Hint depends on where the key was loaded from.
  if (statusCode === 401 || name === 'AuthorizationError') {
    return new CliError(
      'Unauthorized',
      'Your API key is invalid or expired.',
      authHint(),
      'AUTH_INVALID',
    )
  }

  // 403 — credentials are valid but lack permission.
  if (statusCode === 403 || name === 'ForbiddenError') {
    return new CliError(
      'Forbidden',
      `${message}${idSuffix}`,
      'Your account does not have permission to access this resource. Ask an admin for access, or pick a project you can read with: ldash project list',
      'FORBIDDEN',
    )
  }

  // 404 — resource missing. Pick the most specific code we can given the
  // calling context, and point the user at the matching list command.
  if (statusCode === 404 || name === 'NotFoundError') {
    const code = ctx.resource
      ? NOT_FOUND_CODE_BY_RESOURCE[ctx.resource]
      : 'RESOURCE_NOT_FOUND'
    const listCmd = ctx.resource ? NEXT_STEP_BY_RESOURCE[ctx.resource] : null
    const what = ctx.resource
      ? `${ctx.resource[0].toUpperCase()}${ctx.resource.slice(1)} not found`
      : 'Resource not found'
    const hint = listCmd
      ? `Run "${listCmd}" to see valid identifiers.`
      : 'Check the identifier and try again.'
    return new CliError(what, `${message}${idSuffix}`, hint, code)
  }

  // 429 — rate limited. The API doesn't currently expose Retry-After in the
  // error envelope, so the hint is generic.
  if (statusCode === 429) {
    return new CliError(
      'Rate limited',
      message,
      'Wait a few seconds and retry. If this happens repeatedly, reduce the request rate or contact your admin.',
      'RATE_LIMITED',
    )
  }

  // 5xx — Lightdash itself is unhealthy or returned an unexpected error.
  if (statusCode !== undefined && statusCode >= 500) {
    return new CliError(
      'Lightdash server error',
      `${name ?? 'Error'} (${statusCode}): ${message}`,
      'This is an upstream issue. Retry shortly. If it persists, check the Lightdash status page or your instance logs.',
      'UPSTREAM',
    )
  }

  // 400 — generic bad request. Promote to FIELD_NOT_FOUND when the message
  // makes it obvious the user referenced a non-existent dimension/metric.
  if (
    statusCode === 400 ||
    name === 'ValidationError' ||
    name === 'ParameterError'
  ) {
    if (looksLikeFieldError(message)) {
      const exploreHint = ctx.id
        ? `Run "ldash explore get ${ctx.id}" to see valid dimensions and metrics.`
        : 'Run "ldash explore get <exploreId>" to see valid dimensions and metrics.'
      return new CliError(
        'Field not found',
        `${message}${idSuffix}`,
        exploreHint,
        'FIELD_NOT_FOUND',
      )
    }
    return new CliError(
      'Bad request',
      `${name ?? 'ValidationError'}: ${message}`,
      'Check the request payload. Run the command with --help for the expected shape.',
      'BAD_REQUEST',
    )
  }

  // Fallback — keep the API error name + message visible so the user has
  // something to grep for, and surface the status code if we have one.
  const why = statusCode
    ? `${name ?? 'Error'} (${statusCode}): ${message}`
    : name
      ? `${name}: ${message}`
      : message
  return new CliError(
    'Lightdash API error',
    why,
    'Run with --help for usage details.',
    'UNKNOWN',
  )
}

function throwOnError(error: unknown, ctx: ResourceContext = {}): never {
  throw mapApiError(error, ctx)
}

export async function listProjects(client: LightdashClient) {
  const { data, error } = await client.GET('/api/v1/org/projects', {})
  if (error) throwOnError(error, { resource: 'project' })
  return data.results
}

export async function getUserAttributes(client: LightdashClient) {
  const { data, error } = await client.GET('/api/v1/org/attributes', {})
  if (error) throwOnError(error, { resource: 'org' })
  return data.results
}

export async function getProject(client: LightdashClient, projectUuid: string) {
  const { data, error } = await client.GET('/api/v1/projects/{projectUuid}', {
    params: { path: { projectUuid } },
  })
  if (error) throwOnError(error, { resource: 'project', id: projectUuid })
  return data.results
}

export async function listSpaces(client: LightdashClient, projectUuid: string) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/spaces',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error, { resource: 'space' })
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
  if (error) throwOnError(error, { resource: 'space', id: spaceUuid })
  return data.results
}

export async function listCharts(client: LightdashClient, projectUuid: string) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/charts',
    { params: { path: { projectUuid } } },
  )
  if (error) throwOnError(error, { resource: 'chart' })
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
  if (error) throwOnError(error, { resource: 'dashboard' })
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
  if (error) throwOnError(error, { resource: 'metric' })
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
  if (error) throwOnError(error, { resource: 'project', id: projectUuid })
  return data.results
}

export interface CatalogQuery {
  search?: string
  type?: components['schemas']['CatalogType']
  filter?: components['schemas']['CatalogFilter']
}

export async function getCatalog(
  client: LightdashClient,
  projectUuid: string,
  query: CatalogQuery = {},
) {
  const { data, error } = await client.GET(
    '/api/v1/projects/{projectUuid}/dataCatalog',
    {
      params: {
        path: { projectUuid },
        query,
      },
    },
  )
  if (error) throwOnError(error, { resource: 'catalog' })
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
  if (error) throwOnError(error, { resource: 'metric' })
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
  if (error) throwOnError(error, { resource: 'table', id: table })
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
  if (error) throwOnError(error, { resource: 'table', id: table })
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
  if (error) throwOnError(error, { resource: 'chart' })
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
  if (error) throwOnError(error, { resource: 'dashboard' })
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
  if (error) throwOnError(error, { resource: 'explore' })
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
  if (error) throwOnError(error, { resource: 'explore', id: exploreId })
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
  if (error) throwOnError(error, { resource: 'explore', id: exploreId })
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
  if (error) throwOnError(error, { resource: 'explore', id: body.exploreName })
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
  if (error) throwOnError(error, { resource: 'chart', id: chartUuid })
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
  if (error) throwOnError(error, { resource: 'chart', id: chartUuid })
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
  if (error) throwOnError(error, { resource: 'chart', id: chartUuid })
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
  if (error) throwOnError(error, { resource: 'chart', id: chartUuid })
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
  if (error) throwOnError(error, { resource: 'dashboard', id: dashboardUuid })
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
      'INVALID_INPUT',
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
  if (error) throwOnError(error, { resource: 'metric', id: metric })
  return data.results
}
