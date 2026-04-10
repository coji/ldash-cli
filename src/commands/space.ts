import * as api from '../api.js'
import { missingArg } from '../errors.js'
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
      usage: 'ldash space list',
      examples: ['ldash space list'],
      nextSteps: ['ldash space get <spaceUuid>'],
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
        const spaceUuid = args[0]
        if (!spaceUuid || spaceUuid.startsWith('--'))
          throw missingArg('spaceUuid', 'space get')
        const { client, projectUuid } = api.createClient()
        return api.getSpaceDetail(client, projectUuid, spaceUuid)
      },
    },
  },
}
