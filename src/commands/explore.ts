import * as api from '../api.js'
import { missingArg } from '../errors.js'
import type { CommandGroup } from '../types.js'

export const exploreGroup: CommandGroup = {
  description: 'Browse and inspect data models (explores)',
  workflow: [
    'ldash explore list                    # find available explores',
    'ldash explore get <exploreId>         # inspect dimensions & metrics',
    'ldash query run <exploreId> ...       # then query it',
  ],
  commands: {
    list: {
      description: 'List all explores (tables/models) in the project',
      usage: 'ldash explore list',
      examples: [
        'ldash explore list',
        'ldash explore list --json | jq ".[].name"',
      ],
      nextSteps: ['ldash explore get <exploreId>'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.listExplores(client, projectUuid)
      },
    },
    get: {
      description:
        'Get full details of an explore (dimensions, metrics, joins)',
      usage: 'ldash explore get <exploreId>',
      examples: [
        'ldash explore get orders',
        'ldash explore get orders --json | jq ".tables | keys"',
      ],
      nextSteps: [
        'ldash query run <exploreId> --dimensions \'["d"]\' --metrics \'["m"]\'',
      ],
      run: (args) => {
        const exploreId = args[0]
        if (!exploreId || exploreId.startsWith('--'))
          throw missingArg('exploreId', 'explore get')
        const { client, projectUuid } = api.createClient()
        return api.getExplore(client, projectUuid, exploreId)
      },
    },
  },
}
