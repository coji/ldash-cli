import type { Flags } from './types.js'

/**
 * Mask a secret for display. Returns a fixed "****" for values short enough
 * that showing a suffix would leak meaningful information.
 */
export function maskSecret(value: string | undefined): string {
  if (!value) return '(not set)'
  if (value.length <= 8) return '****'
  return `***${value.slice(-4)}`
}

/**
 * Return the structured payload when `--json` is set, otherwise the
 * human-readable string. Commands that have both a machine-consumable
 * shape and a friendly multi-line message use this to pick one.
 */
export function renderable<T>(
  structured: T,
  display: string,
  flags: Flags,
): T | string {
  return flags.json ? structured : display
}

export function output(data: unknown, flags: Flags): void {
  if (typeof data === 'string') {
    // Strings are human-oriented messages — print raw so newlines render.
    // Under --json, serialize them so the output is still valid JSON.
    console.log(flags.json ? JSON.stringify(data) : data)
    return
  }
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
