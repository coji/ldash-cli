import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapApiError } from './api.js'
import { CliError } from './errors.js'

// mapApiError reaches into getResolvedConfig() to compose the AUTH_INVALID
// hint, so we control the env vars to keep the tests independent of the host.
const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.LIGHTDASH_API_KEY = 'test-key'
  process.env.LIGHTDASH_API_URL = 'https://app.lightdash.cloud'
  delete process.env.LIGHTDASH_PROJECT_UUID
})
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
  vi.restoreAllMocks()
})

function envelope(
  name: string,
  message: string,
  statusCode: number,
): { error: { name: string; message: string; statusCode: number } } {
  return { error: { name, message, statusCode } }
}

describe('mapApiError', () => {
  it('classifies 401 as AUTH_INVALID and uses the env-aware hint', () => {
    const err = mapApiError(envelope('AuthorizationError', 'bad', 401))
    expect(err).toBeInstanceOf(CliError)
    expect(err.code).toBe('AUTH_INVALID')
    expect(err.what).toBe('Unauthorized')
    expect(err.hint).toContain('LIGHTDASH_API_KEY')
  })

  it('classifies 403 as FORBIDDEN', () => {
    const err = mapApiError(envelope('ForbiddenError', 'no', 403))
    expect(err.code).toBe('FORBIDDEN')
  })

  it('classifies 404 against an explore as EXPLORE_NOT_FOUND', () => {
    const err = mapApiError(envelope('NotFoundError', 'gone', 404), {
      resource: 'explore',
      id: 'orders',
    })
    expect(err.code).toBe('EXPLORE_NOT_FOUND')
    expect(err.what).toBe('Explore not found')
    expect(err.why).toContain('orders')
    expect(err.hint).toContain('ldash explore list')
  })

  it('classifies 404 against a chart as CHART_NOT_FOUND', () => {
    const err = mapApiError(envelope('NotFoundError', 'missing', 404), {
      resource: 'chart',
      id: 'abc',
    })
    expect(err.code).toBe('CHART_NOT_FOUND')
    expect(err.hint).toContain('ldash chart list')
  })

  it('classifies 404 against a dashboard as DASHBOARD_NOT_FOUND', () => {
    const err = mapApiError(envelope('NotFoundError', 'missing', 404), {
      resource: 'dashboard',
      id: 'abc',
    })
    expect(err.code).toBe('DASHBOARD_NOT_FOUND')
    expect(err.hint).toContain('ldash dashboard list')
  })

  it('classifies 404 against a space as SPACE_NOT_FOUND', () => {
    const err = mapApiError(envelope('NotFoundError', 'missing', 404), {
      resource: 'space',
      id: 'abc',
    })
    expect(err.code).toBe('SPACE_NOT_FOUND')
    expect(err.hint).toContain('ldash space list')
  })

  it('classifies 404 against a metric as METRIC_NOT_FOUND', () => {
    const err = mapApiError(envelope('NotFoundError', 'missing', 404), {
      resource: 'metric',
      id: 'revenue',
    })
    expect(err.code).toBe('METRIC_NOT_FOUND')
    expect(err.hint).toContain('ldash catalog metrics')
  })

  it('falls back to RESOURCE_NOT_FOUND without a context resource', () => {
    const err = mapApiError(envelope('NotFoundError', 'missing', 404))
    expect(err.code).toBe('RESOURCE_NOT_FOUND')
  })

  it('classifies 429 as RATE_LIMITED', () => {
    const err = mapApiError(envelope('TooManyRequests', 'slow down', 429))
    expect(err.code).toBe('RATE_LIMITED')
  })

  it('classifies 5xx as UPSTREAM', () => {
    const err = mapApiError(envelope('UnexpectedError', 'oops', 503))
    expect(err.code).toBe('UPSTREAM')
  })

  it('promotes "field not found" 400 to FIELD_NOT_FOUND', () => {
    const err = mapApiError(
      envelope(
        'ValidationError',
        'Dimension orders_status does not exist on explore orders',
        400,
      ),
      { resource: 'explore', id: 'orders' },
    )
    expect(err.code).toBe('FIELD_NOT_FOUND')
    expect(err.hint).toContain('ldash explore get orders')
  })

  it('classifies generic 400 as BAD_REQUEST', () => {
    const err = mapApiError(envelope('ValidationError', 'bad payload', 400))
    expect(err.code).toBe('BAD_REQUEST')
  })

  it('falls back to UNKNOWN when nothing matches', () => {
    const err = mapApiError({ error: { name: 'WeirdError', message: 'huh' } })
    expect(err.code).toBe('UNKNOWN')
    expect(err.why).toContain('WeirdError')
  })
})
