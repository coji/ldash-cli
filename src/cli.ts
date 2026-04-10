#!/usr/bin/env node

import { CliError, formatError, wrapApiError } from './errors.js'
import { output, parseGlobalFlags } from './output.js'
import type { CommandGroup } from './types.js'

const GROUP_LOADERS: Record<string, () => Promise<CommandGroup>> = {
  explore: () => import('./commands/explore.js').then((m) => m.exploreGroup),
  query: () => import('./commands/query.js').then((m) => m.queryGroup),
  chart: () => import('./commands/chart.js').then((m) => m.chartGroup),
  dashboard: () =>
    import('./commands/dashboard.js').then((m) => m.dashboardGroup),
  catalog: () => import('./commands/catalog.js').then((m) => m.catalogGroup),
  project: () => import('./commands/project.js').then((m) => m.projectGroup),
  space: () => import('./commands/space.js').then((m) => m.spaceGroup),
  org: () => import('./commands/org.js').then((m) => m.orgGroup),
  api: () => import('./commands/api-escape.js').then((m) => m.apiGroup),
  config: () => import('./commands/config.js').then((m) => m.configGroup),
  setup: () => import('./commands/setup.js').then((m) => m.setupGroup),
}

// --- Help renderers ---

function printTopHelp(): void {
  console.log(`ldash - Lightdash CLI for coding agents

Usage: ldash <group> <command> [args...] [--json]

Groups:
  explore     Data models (tables, dimensions, metrics)
  query       Run queries (metric queries, SQL, totals)
  chart       Saved charts and their data
  dashboard   Dashboards (tiles, filters, layout)
  catalog     Data catalog and metrics
  project     Projects and validation
  space       Spaces (folders)
  org         Organization settings
  api         Direct API access (escape hatch)
  config      Manage CLI configuration
  setup       Setup wizard

Flags:
  --json      Compact JSON output (for piping)
  --help      Show help for any group or command

Quick start:
  ldash explore list                          # see available tables
  ldash explore get <exploreId>               # see dimensions & metrics
  ldash query run <exploreId> --dimensions '["d"]' --metrics '["m"]'
  ldash query sql "SELECT 1"                  # run raw SQL
  ldash dashboard list                        # see dashboards
  ldash chart get <chartUuid>                 # get chart data

Setup:
  ldash setup                                   # interactive wizard
  ldash setup https://your-instance.com         # step-by-step with flags
  Or: ldash config set --api-key <token> --project-uuid <uuid>`)
}

function printGroupHelp(groupName: string, group: CommandGroup): void {
  const cmdNames = Object.keys(group.commands)

  let commandLines: string
  if (cmdNames.length > 0) {
    const maxLen = Math.max(...cmdNames.map((k) => k.length))
    commandLines = cmdNames
      .map(
        (name) =>
          `  ${name.padEnd(maxLen + 2)}${group.commands[name].description}`,
      )
      .join('\n')
  } else if (group.defaultRun) {
    commandLines = '  (accepts arguments directly — see workflow below)'
  } else {
    commandLines = '  (no commands)'
  }

  console.log(`ldash ${groupName} - ${group.description}

Commands:
${commandLines}

Workflow:
${group.workflow.map((w) => `  ${w}`).join('\n')}

Run "ldash ${groupName} <command> --help" for command details.`)
}

function printCommandHelp(
  groupName: string,
  commandName: string,
  cmd: {
    description: string
    usage: string
    examples: string[]
    nextSteps: string[]
  },
): void {
  console.log(`ldash ${groupName} ${commandName} - ${cmd.description}

Usage: ${cmd.usage}

Examples:
${cmd.examples.map((e) => `  ${e}`).join('\n')}

Next steps:
${cmd.nextSteps.map((n) => `  ${n}`).join('\n')}`)
}

// --- Main ---

async function main(): Promise<void> {
  const { args, flags } = parseGlobalFlags(process.argv.slice(2))

  const groupName = args[0]

  // Top-level help
  if (!groupName || groupName === '--help' || groupName === '-h') {
    printTopHelp()
    return
  }

  const loader = GROUP_LOADERS[groupName]
  if (!loader) {
    throw new CliError(
      `Unknown group "${groupName}"`,
      `"${groupName}" is not a valid command group.`,
      `Available groups: ${Object.keys(GROUP_LOADERS).join(', ')}\nRun "ldash --help" for details.`,
    )
  }

  const group = await loader()

  // Groups with defaultRun (e.g., "api") — pass all remaining args directly
  if (group.defaultRun) {
    const restArgs = args.slice(1)

    if (
      restArgs.length === 0 ||
      restArgs[0] === '--help' ||
      restArgs[0] === '-h'
    ) {
      printGroupHelp(groupName, group)
      return
    }

    const result = await group.defaultRun(restArgs)
    output(result, flags)
    return
  }

  const commandName = args[1]

  // Group help
  if (!commandName || commandName === '--help' || commandName === '-h') {
    printGroupHelp(groupName, group)
    return
  }

  const cmd = group.commands[commandName]
  if (!cmd) {
    throw new CliError(
      `Unknown command "${groupName} ${commandName}"`,
      `"${commandName}" is not a valid command in the "${groupName}" group.`,
      `Available commands: ${Object.keys(group.commands).join(', ')}\nRun "ldash ${groupName} --help" for details.`,
    )
  }

  const restArgs = args.slice(2)

  // Command help
  if (restArgs.includes('--help') || restArgs.includes('-h')) {
    printCommandHelp(groupName, commandName, cmd)
    return
  }

  const result = await cmd.run(restArgs)
  output(result, flags)
}

main().catch((err: unknown) => {
  if (err instanceof CliError) {
    console.error(formatError(err))
  } else {
    const wrapped = wrapApiError(err)
    console.error(formatError(wrapped))
  }
  process.exit(1)
})
