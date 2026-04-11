import * as api from '../api.js'
import { parseArgs } from '../args.js'
import type { CommandGroup } from '../types.js'

export const catalogGroup: CommandGroup = {
  description: 'Browse the data catalog and metrics',
  workflow: [
    'ldash catalog list                    # see all catalog items',
    'ldash catalog metrics                 # browse defined metrics',
    'ldash catalog metadata <table>        # inspect a specific table',
  ],
  commands: {
    list: {
      description: 'Get the full data catalog for the project',
      usage: 'ldash catalog list',
      examples: ['ldash catalog list'],
      nextSteps: [
        'ldash catalog metadata <table> for table details',
        'ldash explore get <exploreId> for queryable fields',
      ],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.getCatalog(client, projectUuid)
      },
    },
    metrics: {
      description: 'Get the metrics catalog',
      usage: 'ldash catalog metrics',
      examples: ['ldash catalog metrics'],
      nextSteps: ['ldash explore get <exploreId> to see metric definitions'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.getMetricsCatalog(client, projectUuid)
      },
    },
    'custom-metrics': {
      description: 'Get custom metrics for the project',
      usage: 'ldash catalog custom-metrics',
      examples: ['ldash catalog custom-metrics'],
      nextSteps: ['ldash catalog metrics for all metrics'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.getCustomMetrics(client, projectUuid)
      },
    },
    metadata: {
      description: 'Get metadata for a specific table',
      usage: 'ldash catalog metadata <table>',
      examples: ['ldash catalog metadata orders'],
      nextSteps: ['ldash catalog analytics <table> for usage analytics'],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['table'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client, projectUuid } = api.createClient()
        return api.getMetadata(client, projectUuid, parsed.positional[0])
      },
    },
    analytics: {
      description: 'Get usage analytics for a specific table',
      usage: 'ldash catalog analytics <table>',
      examples: ['ldash catalog analytics orders'],
      nextSteps: ['ldash catalog metadata <table> for table structure'],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['table'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client, projectUuid } = api.createClient()
        return api.getAnalytics(client, projectUuid, parsed.positional[0])
      },
    },
  },
}
