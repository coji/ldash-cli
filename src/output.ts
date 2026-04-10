import type { Flags } from './types.js'

export function output(data: unknown, flags: Flags): void {
  if (flags.json) {
    console.log(JSON.stringify(data))
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
}

export function parseGlobalFlags(argv: string[]): {
  args: string[]
  flags: Flags
} {
  const flags: Flags = {}
  const args: string[] = []

  for (const arg of argv) {
    if (arg === '--json') {
      flags.json = true
    } else {
      args.push(arg)
    }
  }

  return { args, flags }
}

export function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1]
      i++
    }
  }
  return flags
}
