import * as api from '../api.js'
import type { CommandGroup } from '../types.js'

export const projectGroup: CommandGroup = {
  description: 'Manage projects',
  workflow: [
    'ldash project list                    # find your project UUID',
    'ldash project get                     # see project details',
    'ldash project validate                # check for errors',
  ],
  commands: {
    list: {
      description: 'List all projects in the organization',
      usage: 'ldash project list [--compact] [--fields <a,b,...>]',
      examples: [
        'ldash project list',
        'ldash project list --compact                        # projectUuid + name + type',
      ],
      nextSteps: [
        'Set LIGHTDASH_PROJECT_UUID to use other commands',
        'ldash project get for current project details',
      ],
      compactFields: ['projectUuid', 'name', 'type'],
      run: () => {
        const { client } = api.createBaseClient()
        return api.listProjects(client)
      },
    },
    get: {
      description: 'Get details of the current project',
      usage: 'ldash project get',
      examples: ['ldash project get'],
      nextSteps: [
        'ldash explore list to see data models',
        'ldash dashboard list to see dashboards',
      ],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.getProject(client, projectUuid)
      },
    },
    validate: {
      description:
        'Run validation on the project (check charts, dashboards, tables)',
      usage: 'ldash project validate',
      examples: ['ldash project validate'],
      nextSteps: ['Fix reported errors in Lightdash UI or dbt models'],
      run: () => {
        const { client, projectUuid } = api.createClient()
        return api.validateProject(client, projectUuid)
      },
    },
  },
}
