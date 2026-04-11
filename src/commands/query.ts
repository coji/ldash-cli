import * as api from '../api.js'
import { parseArgs } from '../args.js'
import { CliError } from '../errors.js'
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
        const parsed = parseArgs(args, {
          positionalMin: 1,
          positionalMax: 1,
          positionals: ['exploreId'],
          string: ['dimensions', 'metrics', 'filters', 'sorts'],
          int: { limit: { min: 1 } },
        })
        const exploreId = parsed.positional[0]
        const { client, projectUuid } = api.createClient()
        return api.runQuery(client, projectUuid, exploreId, {
          dimensions: parseJson(parsed.string.dimensions, 'dimensions'),
          metrics: parseJson(parsed.string.metrics, 'metrics'),
          filters:
            parsed.string.filters !== undefined
              ? parseJson(parsed.string.filters, 'filters')
              : {},
          sorts:
            parsed.string.sorts !== undefined
              ? parseJson(parsed.string.sorts, 'sorts')
              : [],
          limit: parsed.int.limit,
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
        const parsed = parseArgs(args, {
          positionalMin: 1,
          positionalMax: 1,
          positionals: ['sql'],
          int: { limit: { min: 1 } },
        })
        const sql = parsed.positional[0]
        const { client, projectUuid } = api.createClient()
        return api.runSqlQuery(client, projectUuid, sql, parsed.int.limit)
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
        const parsed = parseArgs(args, {
          positionalMin: 1,
          positionalMax: 1,
          positionals: ['exploreName'],
          string: ['dimensions', 'metrics', 'filters'],
        })
        const exploreName = parsed.positional[0]
        const { client, projectUuid } = api.createClient()
        return api.calculateTotal(client, projectUuid, {
          exploreName,
          dimensions: parseJson(parsed.string.dimensions, 'dimensions'),
          metrics: parseJson(parsed.string.metrics, 'metrics'),
          filters:
            parsed.string.filters !== undefined
              ? parseJson(parsed.string.filters, 'filters')
              : {},
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
        const parsed = parseArgs(args, {
          positionalMin: 2,
          positionalMax: 2,
          positionals: ['explore', 'metric'],
          string: ['body'],
        })
        const explore = parsed.positional[0]
        const metric = parsed.positional[1]
        const { client, projectUuid } = api.createClient()
        return api.runMetricsExplorerQuery(
          client,
          projectUuid,
          explore,
          metric,
          parseJson(parsed.string.body, 'body'),
        )
      },
    },
  },
}
