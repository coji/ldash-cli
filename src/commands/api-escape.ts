import * as api from '../api.js'
import { parseArgs } from '../args.js'
import { CliError, type CliErrorCode } from '../errors.js'
import { readBodyOrStdin } from '../stdin.js'
import type { CommandGroup } from '../types.js'

function statusToCode(status: number): CliErrorCode {
  if (status === 401) return 'AUTH_INVALID'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'RESOURCE_NOT_FOUND'
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 500) return 'UPSTREAM'
  return 'BAD_REQUEST'
}

export const apiGroup: CommandGroup = {
  description: 'Direct API access (escape hatch)',
  workflow: [
    'ldash api GET /api/v1/org/projects',
    'ldash api POST /api/v1/projects/{uuid}/sqlQuery --body \'{"sql":"SELECT 1"}\'',
    'ldash api POST /api/v1/... --body @body.json          # read body from file',
    'cat body.json | ldash api POST /api/v1/... --body -   # read body from stdin',
  ],
  commands: {},
  defaultRun: async (args) => {
    const parsed = parseArgs(args, {
      positionalMax: 2,
      positionals: ['method', 'path'],
      string: ['body'],
    })
    const method = parsed.positional[0]?.toUpperCase()
    if (!method) {
      throw new CliError(
        'Missing HTTP method',
        '"api" command requires a method (GET, POST, PUT, DELETE).',
        'Example: ldash api GET /api/v1/org/projects',
        'MISSING_ARGUMENT',
      )
    }
    const path = parsed.positional[1]
    if (!path) {
      throw new CliError(
        'Missing API path',
        '"api" command requires an API path.',
        'Example: ldash api GET /api/v1/org/projects',
        'MISSING_ARGUMENT',
      )
    }

    const { baseUrl, apiKey } = api.createBaseClient()
    const body = await readBodyOrStdin(parsed.string.body)

    const headers: Record<string, string> = api.authHeaders(apiKey)
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const fetchOpts: RequestInit = { method, headers }
    if (body !== undefined) fetchOpts.body = body

    const response = await api.safeFetch(`${baseUrl}${path}`, fetchOpts, {
      what: `API ${method} ${path} failed`,
      hint: 'Check your network connection and the API path. See: https://docs.lightdash.com/api-reference/v1/introduction',
    })
    if (!response.ok) {
      // Try to parse the response as Lightdash's standard error envelope so
      // the same code/hint mapping applies to the escape hatch as to the
      // typed API calls. Falls back to a raw-text BAD_REQUEST otherwise.
      const text = await response.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        'error' in (parsed as Record<string, unknown>)
      ) {
        throw api.mapApiError(parsed)
      }
      throw new CliError(
        `API ${method} ${path} failed: ${response.status}`,
        text || response.statusText,
        'Check the path and method. See: https://docs.lightdash.com/api-reference/v1/introduction',
        statusToCode(response.status),
      )
    }

    const json = (await response.json()) as Record<string, unknown>
    return json.results ?? json
  },
}
