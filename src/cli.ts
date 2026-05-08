#!/usr/bin/env node

import {
  CliError,
  formatError,
  formatErrorJson,
  wrapApiError,
} from './errors.js'
import { output, parseGlobalFlags } from './output.js'
import type { CommandGroup, Flags } from './types.js'

const GROUP_LOADERS: Record<string, () => Promise<CommandGroup>> = {
  explore: () => import('./commands/explore.js').then((m) => m.exploreGroup),
  query: () => import('./commands/query.js').then((m) => m.queryGroup),
  chart: () => import('./commands/chart.js').then((m) => m.chartGroup),
  dashboard: () =>
    import('./commands/dashboard.js').then((m) => m.dashboardGroup),
  catalog: () => import('./commands/catalog.js').then((m) => m.catalogGroup),
  search: () => import('./commands/search.js').then((m) => m.searchGroup),
  project: () => import('./commands/project.js').then((m) => m.projectGroup),
  space: () => import('./commands/space.js').then((m) => m.spaceGroup),
  org: () => import('./commands/org.js').then((m) => m.orgGroup),
  api: () => import('./commands/api-escape.js').then((m) => m.apiGroup),
  config: () => import('./commands/config.js').then((m) => m.configGroup),
  setup: () => import('./commands/setup.js').then((m) => m.setupGroup),
  doctor: () => import('./commands/doctor.js').then((m) => m.doctorGroup),
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
  search      Search everything (tables, fields, charts, dashboards, ...)
  project     Projects and validation
  space       Spaces (folders)
  org         Organization settings
  api         Direct API access (escape hatch)
  config      Manage CLI configuration
  setup       Setup wizard
  doctor      End-to-end health check (URL → token → project)

Flags:
  --json          Compact JSON output (for piping)
  --fields a,b    Project list-style results down to selected keys
  --compact       Apply a sensible default --fields subset for the command
  --help          Show help for any group or command

Quick start:
  ldash search "<query>"                      # find anything by name
  ldash explore list                          # see available tables
  ldash explore get <exploreId>               # see dimensions & metrics
  ldash query run <exploreId> --dimensions '["d"]' --metrics '["m"]'
  ldash query sql "SELECT 1"                  # run raw SQL
  ldash dashboard list                        # see dashboards
  ldash chart get <chartUuid>                 # get chart data

Setup:
  ldash setup                                   # sign in with browser (OAuth)
  ldash setup https://your-instance.com         # sign in against a specific instance
  ldash setup --pat                             # paste a Personal Access Token instead
  ldash setup --check                           # is this environment ready to run setup?
  For agents/CI: ldash setup <url> --api-key <token> --project-uuid <uuid>

Agents / CI — set these env vars instead of running setup:
  LIGHTDASH_API_URL       # e.g. https://app.lightdash.cloud
  LIGHTDASH_API_KEY       # Personal Access Token (preferred over OAuth in non-TTY)
  LIGHTDASH_PROJECT_UUID  # set this so most commands work without --project-uuid

  Verify with:  ldash config show              (jq '.ready' on --json output → true|false)
  Health check: ldash doctor                   (probes URL, token, project)
  PAT setup:    https://<instance>/generalSettings/personalAccessTokens`)
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

/**
 * Pre-detect `--json` from raw argv so the error handler can format the
 * envelope correctly even when parseGlobalFlags itself throws (e.g.
 * `ldash --fields` with no value). Without this, an early throw would
 * bypass the parsed `globalFlags.json` check and dump a raw stack trace
 * — the exact UX agents need to avoid.
 */
const wantsJsonOutput = process.argv.includes('--json')

function reportError(err: unknown, json: boolean): void {
  const cli = err instanceof CliError ? err : wrapApiError(err)
  if (json) {
    console.error(JSON.stringify(formatErrorJson(cli)))
  } else {
    console.error(formatError(cli))
  }
}

let globalArgs: string[]
let globalFlags: Flags
try {
  const parsed = parseGlobalFlags(process.argv.slice(2))
  globalArgs = parsed.args
  globalFlags = parsed.flags
} catch (err) {
  reportError(err, wantsJsonOutput)
  // Synchronous failures land before main() — node would otherwise print
  // a raw stack trace, which defeats the JSON envelope contract.
  // drainStandardStreams isn't reachable yet since main() owns it; just
  // exit. console.error on a TTY is synchronous, and on a pipe Node
  // flushes stderr at process exit.
  process.exit(1)
}

async function main(args: string[], flags: Flags): Promise<void> {
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
      'UNKNOWN_GROUP',
    )
  }

  const group = await loader()

  // Groups with defaultRun (e.g., "api", "setup") — pass remaining args directly
  if (group.defaultRun) {
    const restArgs = args.slice(1)

    if (restArgs.includes('--help') || restArgs.includes('-h')) {
      printGroupHelp(groupName, group)
      return
    }
    if (restArgs.length === 0 && !group.handlesEmptyArgs) {
      printGroupHelp(groupName, group)
      return
    }

    const result = await group.defaultRun(restArgs, flags)
    output(result, flags, group.compactFields)
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
      'UNKNOWN_COMMAND',
    )
  }

  const restArgs = args.slice(2)

  // Command help
  if (restArgs.includes('--help') || restArgs.includes('-h')) {
    printCommandHelp(groupName, commandName, cmd)
    return
  }

  const result = await cmd.run(restArgs, flags)
  output(result, flags, cmd.compactFields)
}

/**
 * Drain stdout and stderr before exiting. console.log is synchronous on a
 * TTY but asynchronous over a pipe, so a bare `process.exit()` immediately
 * after writing output can truncate JSON or help text when consumers like
 * `jq` are downstream. Writing an empty chunk with a callback resolves once
 * everything queued ahead of it has been flushed to the sink.
 */
function drainStandardStreams(): Promise<void> {
  return Promise.all([
    new Promise<void>((resolve) => process.stdout.write('', () => resolve())),
    new Promise<void>((resolve) => process.stderr.write('', () => resolve())),
  ]).then(() => undefined)
}

main(globalArgs, globalFlags)
  .then(async () => {
    // Undici's global fetch pool holds keep-alive sockets open until the
    // remote server drops them (~60s for Lightdash), which keeps node's
    // event loop alive long after the CLI has printed its output. A one-
    // shot CLI has nothing else to do at this point, so exit explicitly
    // instead of waiting for those sockets to time out — but only after
    // the streams have actually flushed.
    //
    // Honor `process.exitCode` set by individual commands (e.g. `ldash
    // doctor` flips it to 1 when a check fails) so CI gates work.
    await drainStandardStreams()
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch(async (err: unknown) => {
    reportError(err, globalFlags.json ?? false)
    await drainStandardStreams()
    process.exit(1)
  })
