import * as api from '../api.js'
import { parseArgs } from '../args.js'
import type { CommandGroup } from '../types.js'

export const dashboardGroup: CommandGroup = {
  description: 'Browse dashboards and their layout',
  workflow: [
    'ldash dashboard list                  # find dashboards',
    'ldash dashboard get <uuid>            # get tiles, filters, chart UUIDs',
    'ldash chart get <chartUuid>           # then get data for each chart',
  ],
  commands: {
    list: {
      description: 'List all dashboards in the project',
      usage: 'ldash dashboard list [--compact] [--fields <a,b,...>]',
      examples: [
        'ldash dashboard list',
        'ldash dashboard list --compact                      # uuid + name + description',
        'ldash dashboard list --fields uuid,name,spaceUuid',
        'ldash dashboard list --json | jq ".[].name"',
      ],
      nextSteps: ['ldash dashboard get <dashboardUuid>'],
      compactFields: ['uuid', 'name', 'description', 'spaceUuid'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.listDashboards(client, projectUuid)
      },
    },
    get: {
      description: 'Get full dashboard details (tiles, filters, layout)',
      usage: 'ldash dashboard get <dashboardUuid>',
      examples: [
        'ldash dashboard get abc123-...',
        'ldash dashboard get abc123-... --json | jq "[.tiles[] | {type, chartUuid: .properties.savedChartUuid}]"',
      ],
      nextSteps: [
        'ldash chart get <chartUuid> to get data for a dashboard tile',
        'ldash chart results <chartUuid> for results only',
      ],
      run: (args) => {
        const parsed = parseArgs(args, {
          positionals: ['dashboardUuid'],
          positionalMin: 1,
          positionalMax: 1,
        })
        const { client, projectUuid } = api.createClient()
        return api.getDashboardDetail(client, projectUuid, parsed.positional[0])
      },
    },
    code: {
      description: 'Get all dashboards as code (BI-as-Code export)',
      usage: 'ldash dashboard code',
      examples: ['ldash dashboard code'],
      nextSteps: ['ldash chart code for chart export'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.getDashboardsAsCode(client, projectUuid)
      },
    },
  },
}
