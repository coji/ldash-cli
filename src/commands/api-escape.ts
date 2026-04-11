import * as api from '../api.js'
import { parseArgs } from '../args.js'
import { CliError } from '../errors.js'
import type { CommandGroup } from '../types.js'

export const apiGroup: CommandGroup = {
  description: 'Direct API access (escape hatch)',
  workflow: [
    'ldash api GET /api/v1/org/projects',
    'ldash api POST /api/v1/projects/{uuid}/sqlQuery --body \'{"sql":"SELECT 1"}\'',
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
      )
    }
    const path = parsed.positional[1]
    if (!path) {
      throw new CliError(
        'Missing API path',
        '"api" command requires an API path.',
        'Example: ldash api GET /api/v1/org/projects',
      )
    }

    const { baseUrl, apiKey } = api.createBaseClient()
    const body = parsed.string.body

    const headers: Record<string, string> = api.authHeaders(apiKey)
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const fetchOpts: RequestInit = { method, headers }
    if (body !== undefined) fetchOpts.body = body

    const response = await api.safeFetch(`${baseUrl}${path}`, fetchOpts, {
      what: `API ${method} ${path} failed`,
      hint: 'Check your network connection and the API path. See: https://docs.lightdash.com/api-reference/v1/introduction',
    })
    if (!response.ok) {
      const text = await response.text()
      throw new CliError(
        `API ${method} ${path} failed: ${response.status}`,
        text || response.statusText,
        'Check the path and method. See: https://docs.lightdash.com/api-reference/v1/introduction',
      )
    }

    const json = (await response.json()) as Record<string, unknown>
    return json.results ?? json
  },
}
