import * as api from '../api.js'
import { parseArgs } from '../args.js'
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
      usage: 'ldash explore list [--compact] [--fields <a,b,...>]',
      examples: [
        'ldash explore list',
        'ldash explore list --compact                        # name + label + description',
        'ldash explore list --fields name,label              # custom subset',
        'ldash explore list --json | jq ".[].name"',
      ],
      nextSteps: ['ldash explore get <exploreId>'],
      compactFields: ['name', 'label', 'description', 'tags', 'groupLabel'],
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
        const parsed = parseArgs(args, {
          positionals: ['exploreId'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client, projectUuid } = api.createClient()
        return api.getExplore(client, projectUuid, parsed.positional[0])
      },
    },
  },
}
