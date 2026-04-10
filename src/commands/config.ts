import { getConfig, getConfigPath, saveConfig } from '../config.js'
import { parseFlags } from '../output.js'
import type { CommandGroup } from '../types.js'

export const configGroup: CommandGroup = {
  description: 'Manage CLI configuration',
  workflow: [
    'ldash config set --api-key <token> --project-uuid <uuid>',
    'ldash config show                     # show current config',
    'ldash config path                     # show config file path',
  ],
  commands: {
    set: {
      description: 'Set configuration values',
      usage:
        'ldash config set --api-key <token> [--api-url <url>] [--project-uuid <uuid>]',
      examples: [
        'ldash config set --api-key your_token --project-uuid your_uuid',
        'ldash config set --api-url https://your-instance.com',
      ],
      nextSteps: [
        'ldash config show to verify',
        'ldash explore list to start using the CLI',
      ],
      run: (args) => {
        const opts = parseFlags(args)
        const values: Record<string, string> = {}
        if (opts['api-key']) values.apiKey = opts['api-key']
        if (opts['api-url']) values.apiUrl = opts['api-url']
        if (opts['project-uuid']) values.projectUuid = opts['project-uuid']
        if (Object.keys(values).length === 0) {
          return Promise.resolve(
            'No values provided. Use --api-key, --api-url, or --project-uuid.',
          )
        }
        saveConfig(values)
        return Promise.resolve(
          `Config saved to ${getConfigPath()}\nKeys updated: ${Object.keys(values).join(', ')}`,
        )
      },
    },
    show: {
      description:
        'Show current configuration (resolved from env + config file)',
      usage: 'ldash config show',
      examples: ['ldash config show'],
      nextSteps: ['ldash config set to update values'],
      run: () => {
        const config = getConfig()
        return Promise.resolve({
          apiKey: config.apiKey ? `***${config.apiKey.slice(-4)}` : '(not set)',
          apiUrl: config.apiUrl,
          projectUuid: config.projectUuid || '(not set)',
          configFile: getConfigPath(),
        })
      },
    },
    path: {
      description: 'Show the config file path',
      usage: 'ldash config path',
      examples: ['ldash config path'],
      nextSteps: ['ldash config show to see current values'],
      run: () => {
        return Promise.resolve(getConfigPath())
      },
    },
  },
}
