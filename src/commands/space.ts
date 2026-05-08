import * as api from '../api.js'
import { parseArgs } from '../args.js'
import type { CommandGroup } from '../types.js'

export const spaceGroup: CommandGroup = {
  description: 'Browse spaces (folders for dashboards and charts)',
  workflow: [
    'ldash space list                      # find spaces',
    'ldash space get <spaceUuid>           # see dashboards & charts in a space',
  ],
  commands: {
    list: {
      description: 'List all spaces in the project',
      usage: 'ldash space list [--compact] [--fields <a,b,...>]',
      examples: [
        'ldash space list',
        'ldash space list --compact                          # uuid + name + slug',
      ],
      nextSteps: ['ldash space get <spaceUuid>'],
      compactFields: ['uuid', 'name', 'slug'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.listSpaces(client, projectUuid)
      },
    },
    get: {
      description:
        'Get detailed information about a space (dashboards, charts)',
      usage: 'ldash space get <spaceUuid>',
      examples: ['ldash space get abc123-...'],
      nextSteps: [
        'ldash dashboard get <uuid> for dashboard details',
        'ldash chart get <uuid> for chart data',
      ],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['spaceUuid'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client, projectUuid } = api.createClient()
        return api.getSpaceDetail(client, projectUuid, parsed.positional[0])
      },
    },
  },
}
