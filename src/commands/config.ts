import {
  getConfigPath,
  getResolvedConfig,
  type ResolvedField,
  saveConfig,
} from '../config.js'
import { maskSecret, parseFlags } from '../output.js'
import type { CommandGroup, Flags } from '../types.js'

function sourceLabel(field: ResolvedField<unknown>): string {
  switch (field.source) {
    case 'env':
      return `from env: ${field.envVar}`
    case 'file':
      return 'from config file'
    case 'default':
      return 'default'
    case 'unset':
      return 'not set'
  }
}

export const configGroup: CommandGroup = {
  description: 'Manage CLI configuration',
  workflow: [
    'ldash config set --api-key <token> --project-uuid <uuid>',
    'ldash config show                     # show current config + source',
    'ldash config path                     # show config file path',
  ],
  commands: {
    set: {
      description: 'Set configuration values (written to the config file)',
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
        'Show current configuration with source (env / config file / default)',
      usage: 'ldash config show [--json]',
      examples: ['ldash config show', 'ldash config show --json'],
      nextSteps: [
        'ldash config set to update saved values',
        'unset LIGHTDASH_API_KEY (etc.) to fall back to the saved config or defaults',
      ],
      run: (_args, flags: Flags) => {
        const r = getResolvedConfig()

        // Structured (JSON) shape — used by --json and renders nicely in
        // the default pretty-print path too.
        const envOverrides: string[] = []
        if (r.apiKey.source === 'env' && r.apiKey.envVar)
          envOverrides.push(r.apiKey.envVar)
        if (r.apiUrl.source === 'env' && r.apiUrl.envVar)
          envOverrides.push(r.apiUrl.envVar)
        if (r.projectUuid.source === 'env' && r.projectUuid.envVar)
          envOverrides.push(r.projectUuid.envVar)

        const structured = {
          apiUrl: {
            value: r.apiUrl.value,
            source: r.apiUrl.source,
            envVar: r.apiUrl.envVar,
          },
          apiKey: {
            masked: maskSecret(r.apiKey.value),
            source: r.apiKey.source,
            envVar: r.apiKey.envVar,
          },
          projectUuid: {
            value: r.projectUuid.value ?? null,
            source: r.projectUuid.source,
            envVar: r.projectUuid.envVar,
          },
          configFile: r.configFile,
          warnings:
            envOverrides.length > 0
              ? [
                  `${envOverrides.length} setting${envOverrides.length > 1 ? 's' : ''} currently resolved from environment variables: ${envOverrides.join(', ')}`,
                ]
              : [],
        }

        if (flags.json) {
          return Promise.resolve(structured)
        }

        const labelWidth = 8
        const valueWidth = Math.max(
          r.apiUrl.value.length,
          maskSecret(r.apiKey.value).length,
          (r.projectUuid.value ?? '(not set)').length,
        )
        const pad = (label: string, value: string) =>
          `  ${label.padEnd(labelWidth)} ${value.padEnd(valueWidth)}`

        const warnMark = (s: ResolvedField<unknown>) =>
          s.source === 'env' ? '  ⚠' : ''
        const lines = [
          `${pad('URL:', r.apiUrl.value)}  (${sourceLabel(r.apiUrl)})${warnMark(r.apiUrl)}`,
          `${pad('API Key:', maskSecret(r.apiKey.value))}  (${sourceLabel(r.apiKey)})${warnMark(r.apiKey)}`,
          `${pad('Project:', r.projectUuid.value ?? '(not set)')}  (${sourceLabel(r.projectUuid)})${warnMark(r.projectUuid)}`,
          `  File:    ${r.configFile}`,
        ]
        if (envOverrides.length > 0) {
          lines.push('')
          lines.push(
            `⚠  ${envOverrides.length} setting${envOverrides.length > 1 ? 's are' : ' is'} currently resolved from environment variables.`,
          )
          lines.push(
            `   Unset to fall back to the saved config or defaults: ${envOverrides.join(', ')}`,
          )
        }
        return Promise.resolve(lines.join('\n'))
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
