import * as api from '../api.js'
import type { CommandGroup } from '../types.js'

export const orgGroup: CommandGroup = {
  description: 'Organization settings',
  workflow: ['ldash org user-attributes        # see user attributes'],
  commands: {
    'user-attributes': {
      description: 'Get organization user attributes',
      usage: 'ldash org user-attributes',
      examples: ['ldash org user-attributes'],
      nextSteps: ['ldash project list to see projects'],
      run: () => {
        const { client } = api.createBaseClient()
        return api.getUserAttributes(client)
      },
    },
  },
}
