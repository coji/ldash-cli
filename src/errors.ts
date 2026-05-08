/**
 * Stable error codes consumed by agents and downstream tooling. New codes can
 * be added freely; existing codes must not change meaning so JSON consumers
 * can branch on them. UNKNOWN is the catch-all when nothing more specific fits.
 *
 * Grouping (informal):
 *   - Auth/config:  AUTH_MISSING, AUTH_INVALID, FORBIDDEN, PROJECT_MISSING,
 *                   INVALID_CONFIG
 *   - Resource 404: PROJECT_NOT_FOUND, EXPLORE_NOT_FOUND, CHART_NOT_FOUND,
 *                   DASHBOARD_NOT_FOUND, SPACE_NOT_FOUND, FIELD_NOT_FOUND,
 *                   METRIC_NOT_FOUND, RESOURCE_NOT_FOUND
 *   - Request:      BAD_REQUEST, RATE_LIMITED, UPSTREAM, NETWORK
 *   - Local input:  INVALID_INPUT, MISSING_ARGUMENT, MISSING_FLAG,
 *                   UNKNOWN_FLAG, UNKNOWN_GROUP, UNKNOWN_COMMAND
 *   - Catch-all:    UNKNOWN
 */
export type CliErrorCode =
  | 'AUTH_MISSING'
  | 'AUTH_INVALID'
  | 'FORBIDDEN'
  | 'PROJECT_MISSING'
  | 'PROJECT_NOT_FOUND'
  | 'EXPLORE_NOT_FOUND'
  | 'FIELD_NOT_FOUND'
  | 'METRIC_NOT_FOUND'
  | 'CHART_NOT_FOUND'
  | 'DASHBOARD_NOT_FOUND'
  | 'SPACE_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'UPSTREAM'
  | 'NETWORK'
  | 'INVALID_CONFIG'
  | 'INVALID_INPUT'
  | 'MISSING_ARGUMENT'
  | 'MISSING_FLAG'
  | 'UNKNOWN_FLAG'
  | 'UNKNOWN_GROUP'
  | 'UNKNOWN_COMMAND'
  | 'UNKNOWN'

export class CliError extends Error {
  public code: CliErrorCode
  constructor(
    public what: string,
    public why: string,
    public hint: string,
    code: CliErrorCode = 'UNKNOWN',
  ) {
    super(what)
    this.name = 'CliError'
    this.code = code
  }
}

export function formatError(err: CliError): string {
  return `Error: ${err.what}\nWhy: ${err.why}\nHint: ${err.hint}`
}

export interface JsonErrorEnvelope {
  ok: false
  error: {
    code: CliErrorCode
    what: string
    why: string
    hint: string
  }
}

export function formatErrorJson(err: CliError): JsonErrorEnvelope {
  return {
    ok: false,
    error: {
      code: err.code,
      what: err.what,
      why: err.why,
      hint: err.hint,
    },
  }
}

export function wrapApiError(err: unknown): CliError {
  if (err instanceof CliError) return err
  const message = err instanceof Error ? err.message : 'Unknown error occurred'
  return new CliError(
    'Unexpected error',
    message,
    'Run "ldash --help" for available commands.',
    'UNKNOWN',
  )
}
