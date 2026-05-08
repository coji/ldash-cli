import * as api from '../api.js'
import { parseArgs } from '../args.js'
import { CliError } from '../errors.js'
import type { components } from '../generated/api.js'
import {
  readBodyOrStdin,
  readFlagValue,
  readPositionalOrStdin,
} from '../stdin.js'
import type { CommandGroup } from '../types.js'

function parseJsonRaw(value: string | undefined, name: string): unknown {
  if (!value) {
    throw new CliError(
      `Missing required flag --${name}`,
      `This command requires a --${name} flag with a JSON value.`,
      `Example: --${name} '["field_name"]'`,
      'MISSING_FLAG',
    )
  }
  try {
    return JSON.parse(value)
  } catch {
    throw new CliError(
      `Invalid JSON for --${name}`,
      `The value passed to --${name} is not valid JSON.`,
      `Ensure proper quoting: --${name} '["field_name"]'`,
      'INVALID_INPUT',
    )
  }
}

function parseJsonArray<T>(value: string | undefined, name: string): T[] {
  const parsed = parseJsonRaw(value, name)
  if (!Array.isArray(parsed)) {
    throw new CliError(
      `Wrong shape for --${name}`,
      `--${name} must be a JSON array, got ${parsed === null ? 'null' : typeof parsed}.`,
      `Wrap values in []: --${name} '["field_name"]'`,
      'INVALID_INPUT',
    )
  }
  return parsed as T[]
}

function parseJsonObject<T>(value: string | undefined, name: string): T {
  const parsed = parseJsonRaw(value, name)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError(
      `Wrong shape for --${name}`,
      `--${name} must be a JSON object, got ${Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed}.`,
      `Pass an object: --${name} '{"key":"value"}'`,
      'INVALID_INPUT',
    )
  }
  return parsed as T
}

function warnEmptyArray(value: unknown[], name: string): void {
  if (value.length === 0) {
    // Use stderr so machine-readable JSON on stdout stays clean.
    process.stderr.write(
      `Warning: --${name} is an empty array. The query will likely return nothing useful.\n`,
    )
  }
}

/**
 * Hardcoded view of Lightdash's `FilterOperator` enum. The Record key type
 * forces TypeScript to verify that EVERY operator in the upstream union is
 * present here — adding or removing one upstream fails compilation, instead
 * of silently letting a stale list pass through (which a `ReadonlyArray`
 * annotation would have allowed).
 *
 * Each entry's `values` documents the expected `values` array shape on a
 * FilterRule.
 */
const FILTER_OPERATOR_INFO: Record<
  components['schemas']['FilterOperator'],
  { description: string; values: string }
> = {
  isNull: { description: 'Field IS NULL', values: '[]' },
  notNull: { description: 'Field IS NOT NULL', values: '[]' },
  equals: {
    description: 'Field equals any of the given values',
    values: '[v1, v2, ...]  (OR semantics)',
  },
  notEquals: {
    description: 'Field does not equal any of the given values',
    values: '[v1, v2, ...]',
  },
  startsWith: {
    description: 'String field starts with any of the given values',
    values: '[prefix, ...]',
  },
  endsWith: {
    description: 'String field ends with any of the given values',
    values: '[suffix, ...]',
  },
  include: {
    description: 'String field contains any of the given substrings',
    values: '[substring, ...]',
  },
  doesNotInclude: {
    description: 'String field contains none of the given substrings',
    values: '[substring, ...]',
  },
  lessThan: {
    description: 'Numeric/date field is less than value',
    values: '[number-or-date]',
  },
  lessThanOrEqual: {
    description: 'Numeric/date field is less than or equal to value',
    values: '[number-or-date]',
  },
  greaterThan: {
    description: 'Numeric/date field is greater than value',
    values: '[number-or-date]',
  },
  greaterThanOrEqual: {
    description: 'Numeric/date field is greater than or equal to value',
    values: '[number-or-date]',
  },
  inThePast: {
    description: 'Date field falls within the last N (DAY|WEEK|MONTH|YEAR)',
    values:
      '[count]  (also set settings: { unit: "DAY"|... , completed: bool })',
  },
  notInThePast: {
    description: 'Negation of inThePast',
    values: '[count]',
  },
  inTheNext: {
    description: 'Date field falls within the next N units',
    values: '[count]  (also set settings: { unit, completed })',
  },
  inTheCurrent: {
    description: 'Date field falls within the current period',
    values: '[]  (set settings: { unit })',
  },
  notInTheCurrent: {
    description: 'Negation of inTheCurrent',
    values: '[]',
  },
  inBetween: {
    description: 'Field falls in the inclusive range [start, end]',
    values: '[start, end]',
  },
  notInBetween: {
    description: 'Negation of inBetween',
    values: '[start, end]',
  },
  inPeriodToDate: {
    description: 'Date field falls in the period-to-date window',
    values: '[count]  (set settings: { unit })',
  },
}

const FILTER_OPERATORS = (
  Object.keys(FILTER_OPERATOR_INFO) as Array<
    components['schemas']['FilterOperator']
  >
).map((operator) => ({ operator, ...FILTER_OPERATOR_INFO[operator] }))

export const queryGroup: CommandGroup = {
  description: 'Run queries (metric queries, SQL, totals)',
  workflow: [
    'ldash explore list                    # find an explore',
    'ldash explore get <exploreId>         # see available fields',
    'ldash query filter-ops                # see valid filter operators',
    'ldash query run <exploreId> ...       # run a metric query',
    'ldash query sql "SELECT ..."          # or run raw SQL',
  ],
  commands: {
    run: {
      description: 'Run a metric query against an explore',
      usage:
        "ldash query run <exploreId> --dimensions '[\"d\"]' --metrics '[\"m\"]' [--filters '<json>'] [--sorts '<json>'] [--limit N]\n\n  --limit defaults to 500 server-side. Pass an explicit value to widen or narrow.\n  Any JSON-bearing flag accepts @path/to/file.json or - for stdin (one stdin per command).\n  Run \"ldash query filter-ops\" for the list of valid filter operators.",
      examples: [
        'ldash query run orders --dimensions \'["orders_status"]\' --metrics \'["orders_count"]\'',
        'ldash query run orders --dimensions \'["orders_date_day"]\' --metrics \'["orders_total_revenue"]\' --sorts \'[{"fieldId":"orders_date_day","descending":true}]\' --limit 10',
        'ldash query run orders --dimensions \'["orders_status"]\' --metrics \'["orders_count"]\' --filters \'{"dimensions":{"id":"f1","and":[{"id":"r1","target":{"fieldId":"orders_status"},"operator":"equals","values":["completed"]}]}}\'',
        'ldash query run orders --dimensions \'["orders_status"]\' --metrics \'["orders_count"]\' --filters @filters.json',
      ],
      nextSteps: [
        'ldash query filter-ops to see valid filter operators',
        'ldash query sql "SELECT ..." for raw SQL access',
        'ldash query total <explore> ... for aggregated totals',
      ],
      run: async (args) => {
        const parsed = parseArgs(args, {
          positionalMin: 1,
          positionalMax: 1,
          positionals: ['exploreId'],
          string: ['dimensions', 'metrics', 'filters', 'sorts'],
          int: { limit: { min: 1 } },
        })
        const exploreId = parsed.positional[0]
        // All four JSON flags accept @file or - so agents don't have to
        // wrestle with nested-shell quoting on filters in particular.
        const dimensionsRaw = await readFlagValue(
          parsed.string.dimensions,
          '--dimensions',
        )
        const metricsRaw = await readFlagValue(
          parsed.string.metrics,
          '--metrics',
        )
        const filtersRaw = await readFlagValue(
          parsed.string.filters,
          '--filters',
        )
        const sortsRaw = await readFlagValue(parsed.string.sorts, '--sorts')
        const dimensions = parseJsonArray<string>(dimensionsRaw, 'dimensions')
        const metrics = parseJsonArray<string>(metricsRaw, 'metrics')
        // At least one of dimensions or metrics needs entries — both empty
        // is a degenerate query that always returns nothing.
        if (dimensions.length === 0 && metrics.length === 0) {
          throw new CliError(
            'Empty query',
            '--dimensions and --metrics are both empty arrays.',
            'Pick at least one field. Run "ldash explore get <exploreId>" to see what is available.',
            'INVALID_INPUT',
          )
        }
        const { client, projectUuid } = api.createClient()
        return api.runQuery(client, projectUuid, exploreId, {
          dimensions,
          metrics,
          filters:
            filtersRaw !== undefined
              ? parseJsonObject(filtersRaw, 'filters')
              : {},
          sorts:
            sortsRaw !== undefined ? parseJsonArray(sortsRaw, 'sorts') : [],
          limit: parsed.int.limit,
        })
      },
    },
    sql: {
      description: 'Execute a raw SQL query against the data warehouse',
      usage:
        'ldash query sql "<SQL>" [--limit N]\n\n  --limit defaults to 500 server-side. Pass an explicit value to widen or narrow.\n  Pass "-" to read SQL from stdin or "@path.sql" to read from a file.',
      examples: [
        'ldash query sql "SELECT * FROM orders LIMIT 10"',
        'ldash query sql "SELECT status, COUNT(*) FROM orders GROUP BY 1" --limit 100',
        'cat query.sql | ldash query sql -',
        'ldash query sql @./query.sql',
      ],
      nextSteps: [
        'ldash explore list to discover available tables',
        'ldash catalog metadata <table> for column details',
      ],
      run: async (args) => {
        const parsed = parseArgs(args, {
          positionalMin: 1,
          positionalMax: 1,
          positionals: ['sql'],
          int: { limit: { min: 1 } },
        })
        const sql = (
          await readPositionalOrStdin(parsed.positional[0], 'sql')
        ).trim()
        if (sql === '') {
          throw new CliError(
            'Empty SQL query',
            'No SQL was provided.',
            'Pass a SQL string, or pipe it: cat query.sql | ldash query sql -',
            'INVALID_INPUT',
          )
        }
        const { client, projectUuid } = api.createClient()
        return api.runSqlQuery(client, projectUuid, sql, parsed.int.limit)
      },
    },
    total: {
      description: 'Calculate metric totals for an explore query',
      usage:
        "ldash query total <exploreName> --dimensions '[\"d\"]' --metrics '[\"m\"]' [--filters '<json>']",
      examples: [
        'ldash query total orders --dimensions \'["orders_status"]\' --metrics \'["orders_count"]\'',
        'ldash query total orders --dimensions \'["orders_status"]\' --metrics \'["orders_count"]\' --filters @filters.json',
      ],
      nextSteps: [
        'ldash query filter-ops for valid filter operators',
        'ldash query run <explore> ... for full row-level results',
      ],
      run: async (args) => {
        const parsed = parseArgs(args, {
          positionalMin: 1,
          positionalMax: 1,
          positionals: ['exploreName'],
          string: ['dimensions', 'metrics', 'filters'],
        })
        const exploreName = parsed.positional[0]
        const dimensionsRaw = await readFlagValue(
          parsed.string.dimensions,
          '--dimensions',
        )
        const metricsRaw = await readFlagValue(
          parsed.string.metrics,
          '--metrics',
        )
        const filtersRaw = await readFlagValue(
          parsed.string.filters,
          '--filters',
        )
        const metrics = parseJsonArray<string>(metricsRaw, 'metrics')
        warnEmptyArray(metrics, 'metrics')
        const { client, projectUuid } = api.createClient()
        return api.calculateTotal(client, projectUuid, {
          exploreName,
          dimensions: parseJsonArray<string>(dimensionsRaw, 'dimensions'),
          metrics,
          filters:
            filtersRaw !== undefined
              ? parseJsonObject(filtersRaw, 'filters')
              : {},
        })
      },
    },
    'filter-ops': {
      description: 'List valid FilterRule operators and their value shapes',
      usage: 'ldash query filter-ops [--compact] [--fields a,b,...]',
      examples: [
        'ldash query filter-ops',
        'ldash query filter-ops --json | jq -r ".[].operator"',
      ],
      nextSteps: [
        "ldash query run <explore> ... --filters '{...}' to apply filters",
      ],
      compactFields: ['operator', 'description'],
      run: () => Promise.resolve(FILTER_OPERATORS),
    },
    'metrics-explorer': {
      description: 'Run a metrics explorer query with time-based analysis',
      usage:
        'ldash query metrics-explorer <explore> <metric>\n      [--time-frame <DAY|WEEK|MONTH|...>] [--granularity <DAY|WEEK|MONTH|...>]\n      [--start-date <YYYY-MM-DD>] [--end-date <YYYY-MM-DD>]\n      [--rolling-days <N>] [--comparison-type <none|previous_period|rolling_days>]\n\n      Or, equivalently, pass everything as a JSON body:\n      [--body \'{"timeFrame":"DAY","granularity":"DAY","startDate":"...","endDate":"..."}\']\n      (--body also accepts @file.json or - for stdin; do not mix --body with the discrete flags.)',
      examples: [
        'ldash query metrics-explorer orders total_revenue --time-frame DAY --granularity DAY --start-date 2024-01-01 --end-date 2024-12-31',
        'ldash query metrics-explorer orders total_revenue --time-frame DAY --granularity WEEK --start-date 2024-01-01 --end-date 2024-12-31 --comparison-type previous_period',
        'ldash query metrics-explorer orders total_revenue --body \'{"timeFrame":"DAY","granularity":"DAY","startDate":"2024-01-01","endDate":"2024-12-31"}\'',
        'cat body.json | ldash query metrics-explorer orders total_revenue --body -',
        'ldash query metrics-explorer orders total_revenue --body @body.json',
      ],
      nextSteps: ['ldash catalog metrics to discover available metrics'],
      run: async (args) => {
        const parsed = parseArgs(args, {
          positionalMin: 2,
          positionalMax: 2,
          positionals: ['explore', 'metric'],
          string: [
            'body',
            'time-frame',
            'granularity',
            'start-date',
            'end-date',
            'comparison-type',
          ],
          int: { 'rolling-days': { min: 1 } },
        })
        const explore = parsed.positional[0]
        const metric = parsed.positional[1]
        const discreteFlags = [
          parsed.string['time-frame'],
          parsed.string.granularity,
          parsed.string['start-date'],
          parsed.string['end-date'],
          parsed.string['comparison-type'],
          parsed.int['rolling-days'],
        ]
        const hasDiscrete = discreteFlags.some((v) => v !== undefined)
        if (parsed.string.body !== undefined && hasDiscrete) {
          throw new CliError(
            'Cannot mix --body with --time-frame/--granularity/...',
            'Pass either a single --body JSON object or the discrete flags, not both.',
            'Drop --body and use the discrete flags, or remove the discrete flags and pass --body alone.',
            'INVALID_INPUT',
          )
        }
        let body: Record<string, unknown>
        if (parsed.string.body !== undefined) {
          const raw = await readBodyOrStdin(parsed.string.body)
          body = parseJsonObject<Record<string, unknown>>(raw, 'body')
        } else {
          body = {}
          if (parsed.string['time-frame'] !== undefined)
            body.timeFrame = parsed.string['time-frame']
          if (parsed.string.granularity !== undefined)
            body.granularity = parsed.string.granularity
          if (parsed.string['start-date'] !== undefined)
            body.startDate = parsed.string['start-date']
          if (parsed.string['end-date'] !== undefined)
            body.endDate = parsed.string['end-date']
          if (parsed.string['comparison-type'] !== undefined)
            body.comparisonType = parsed.string['comparison-type']
          if (parsed.int['rolling-days'] !== undefined)
            body.rollingDays = parsed.int['rolling-days']
        }
        const { client, projectUuid } = api.createClient()
        return api.runMetricsExplorerQuery(
          client,
          projectUuid,
          explore,
          metric,
          body as Parameters<typeof api.runMetricsExplorerQuery>[4],
        )
      },
    },
  },
}
