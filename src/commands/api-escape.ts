import * as api from '../api.js'
import { CliError } from '../errors.js'
import { parseFlags } from '../output.js'
import type { CommandGroup } from '../types.js'

export const apiGroup: CommandGroup = {
  description: 'Direct API access (escape hatch)',
  workflow: [
    'ldash api GET /api/v1/org/projects',
    'ldash api POST /api/v1/projects/{uuid}/sqlQuery --body \'{"sql":"SELECT 1"}\'',
  ],
  commands: {},
  defaultRun: async (args) => {
    const method = args[0]?.toUpperCase()
    if (!method) {
      throw new CliError(
        'Missing HTTP method',
        '"api" command requires a method (GET, POST, PUT, DELETE).',
        'Example: ldash api GET /api/v1/org/projects',
      )
    }
    const path = args[1]
    if (!path) {
      throw new CliError(
        'Missing API path',
        '"api" command requires an API path.',
        'Example: ldash api GET /api/v1/org/projects',
      )
    }

    const { baseUrl, apiKey } = api.createBaseClient()
    const opts = parseFlags(args.slice(2))

    const headers: Record<string, string> = api.authHeaders(apiKey)
    if (opts.body) headers['Content-Type'] = 'application/json'

    const fetchOpts: RequestInit = { method, headers }
    if (opts.body) fetchOpts.body = opts.body

    const response = await fetch(`${baseUrl}${path}`, fetchOpts)
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
