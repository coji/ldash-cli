import * as api from '../api.js'
import { parseArgs } from '../args.js'
import type { CommandGroup } from '../types.js'

export const chartGroup: CommandGroup = {
  description: 'Browse saved charts and their data',
  workflow: [
    'ldash chart list                      # find charts',
    'ldash chart get <chartUuid>           # get definition + results',
    'ldash chart results <chartUuid>       # get results only',
  ],
  commands: {
    list: {
      description: 'List all charts in the project',
      usage: 'ldash chart list',
      examples: ['ldash chart list', 'ldash chart list --json | jq ".[].name"'],
      nextSteps: ['ldash chart get <chartUuid>'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.listCharts(client, projectUuid)
      },
    },
    get: {
      description: 'Get chart definition and query results in one call',
      usage: 'ldash chart get <chartUuid>',
      examples: ['ldash chart get abc123-...'],
      nextSteps: ['ldash chart history <chartUuid> to see version history'],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['chartUuid'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client } = api.createClient()
        return api.getChartAndResults(client, parsed.positional[0])
      },
    },
    results: {
      description: 'Get query results of a saved chart (data only)',
      usage: 'ldash chart results <chartUuid>',
      examples: ['ldash chart results abc123-...'],
      nextSteps: ['ldash chart get <chartUuid> for definition + results'],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['chartUuid'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client } = api.createClient()
        return api.getChartResults(client, parsed.positional[0])
      },
    },
    history: {
      description: 'Get version history of a saved chart',
      usage: 'ldash chart history <chartUuid>',
      examples: ['ldash chart history abc123-...'],
      nextSteps: ['ldash chart version <chartUuid> <versionUuid>'],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['chartUuid'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client } = api.createClient()
        return api.getChartHistory(client, parsed.positional[0])
      },
    },
    version: {
      description: 'Get a specific version of a saved chart',
      usage: 'ldash chart version <chartUuid> <versionUuid>',
      examples: ['ldash chart version abc123-... def456-...'],
      nextSteps: ['ldash chart history <chartUuid> to see all versions'],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['chartUuid', 'versionUuid'],
          positionalMin: 2,
          positionalMax: 2,
        })
        const { client } = api.createClient()
        return api.getChartVersion(
          client,
          parsed.positional[0],
          parsed.positional[1],
        )
      },
    },
    code: {
      description: 'Get all charts as code (BI-as-Code export)',
      usage: 'ldash chart code',
      examples: ['ldash chart code', 'ldash chart code --json'],
      nextSteps: ['ldash dashboard code for dashboard export'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.getChartsAsCode(client, projectUuid)
      },
    },
  },
}
