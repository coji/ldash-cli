import * as api from '../api.js'
import { CliError, missingArg } from '../errors.js'
import { parseFlags } from '../output.js'
import type { CommandGroup } from '../types.js'

function parseJson<T>(value: string | undefined, name: string): T {
  if (!value) {
    throw new CliError(
      `Missing required flag --${name}`,
      `This command requires a --${name} flag with a JSON value.`,
      `Example: --${name} '["field_name"]'`,
    )
  }
  try {
    return JSON.parse(value) as T
  } catch {
    throw new CliError(
      `Invalid JSON for --${name}`,
      `The value "${value}" is not valid JSON.`,
      `Ensure proper quoting: --${name} '["field_name"]'`,
    )
  }
}

export const queryGroup: CommandGroup = {
  description: 'Run queries (metric queries, SQL, totals)',
  workflow: [
    'ldash explore list                    # find an explore',
    'ldash explore get <exploreId>         # see available fields',
    'ldash query run <exploreId> ...       # run a metric query',
    'ldash query sql "SELECT ..."          # or run raw SQL',
  ],
  commands: {
    run: {
      description: 'Run a metric query against an explore',
      usage:
        "ldash query run <exploreId> --dimensions '[\"d\"]' --metrics '[\"m\"]' [--sorts '...'] [--limit N]",
      examples: [
        'ldash query run orders --dimensions \'["orders_status"]\' --metrics \'["orders_count"]\'',
        'ldash query run orders --dimensions \'["orders_date_day"]\' --metrics \'["orders_total_revenue"]\' --sorts \'[{"fieldId":"orders_date_day","descending":true}]\' --limit 10',
      ],
      nextSteps: [
        'ldash query sql "SELECT ..." for raw SQL access',
        'ldash query total <explore> ... for aggregated totals',
      ],
      run: (args) => {
        const exploreId = args[0]
        if (!exploreId || exploreId.startsWith('--'))
          throw missingArg('exploreId', 'query run')
        const opts = parseFlags(args.slice(1))
        const { client, projectUuid } = api.createClient()
        return api.runQuery(client, projectUuid, exploreId, {
          dimensions: parseJson(opts.dimensions, 'dimensions'),
          metrics: parseJson(opts.metrics, 'metrics'),
          filters: opts.filters ? parseJson(opts.filters, 'filters') : {},
          sorts: opts.sorts ? parseJson(opts.sorts, 'sorts') : [],
          limit: opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
        })
      },
    },
    sql: {
      description: 'Execute a raw SQL query against the data warehouse',
      usage: 'ldash query sql "<SQL>" [--limit N]',
      examples: [
        'ldash query sql "SELECT * FROM orders LIMIT 10"',
        'ldash query sql "SELECT status, COUNT(*) FROM orders GROUP BY 1" --limit 100',
      ],
      nextSteps: [
        'ldash explore list to discover available tables',
        'ldash catalog metadata <table> for column details',
      ],
      run: (args) => {
        const sql = args[0]
        if (!sql || sql.startsWith('--')) throw missingArg('sql', 'query sql')
        const opts = parseFlags(args.slice(1))
        const { client, projectUuid } = api.createClient()
        return api.runSqlQuery(
          client,
          projectUuid,
          sql,
          opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
        )
      },
    },
    total: {
      description: 'Calculate metric totals for an explore query',
      usage:
        'ldash query total <exploreName> --dimensions \'["d"]\' --metrics \'["m"]\'',
      examples: [
        'ldash query total orders --dimensions \'["orders_status"]\' --metrics \'["orders_count"]\'',
      ],
      nextSteps: ['ldash query run <explore> ... for full row-level results'],
      run: (args) => {
        const exploreName = args[0]
        if (!exploreName || exploreName.startsWith('--'))
          throw missingArg('exploreName', 'query total')
        const opts = parseFlags(args.slice(1))
        const { client, projectUuid } = api.createClient()
        return api.calculateTotal(client, projectUuid, {
          exploreName,
          dimensions: parseJson(opts.dimensions, 'dimensions'),
          metrics: parseJson(opts.metrics, 'metrics'),
          filters: opts.filters ? parseJson(opts.filters, 'filters') : {},
        })
      },
    },
    'metrics-explorer': {
      description: 'Run a metrics explorer query with time-based analysis',
      usage:
        'ldash query metrics-explorer <explore> <metric> --body \'{"timeFrame":"DAY","granularity":"DAY","startDate":"...","endDate":"..."}\'',
      examples: [
        'ldash query metrics-explorer orders total_revenue --body \'{"timeFrame":"DAY","granularity":"DAY","startDate":"2024-01-01","endDate":"2024-12-31"}\'',
      ],
      nextSteps: ['ldash catalog metrics to discover available metrics'],
      run: (args) => {
        const explore = args[0]
        if (!explore || explore.startsWith('--'))
          throw missingArg('explore', 'query metrics-explorer')
        const metric = args[1]
        if (!metric || metric.startsWith('--'))
          throw missingArg('metric', 'query metrics-explorer')
        const opts = parseFlags(args.slice(2))
        const { client, projectUuid } = api.createClient()
        return api.runMetricsExplorerQuery(
          client,
          projectUuid,
          explore,
          metric,
          parseJson(opts.body, 'body'),
        )
      },
    },
  },
}
