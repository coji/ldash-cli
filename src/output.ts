import { CliError } from './errors.js'
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

/** Default key set used by `--compact` when the command doesn't supply one. */
const DEFAULT_COMPACT_FIELDS = ['uuid', 'name', 'description'] as const

function pickKeys(
  obj: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    if (k in obj) out[k] = obj[k]
  }
  return out
}

/**
 * Apply a key-projection to the payload:
 *  - array of objects → map each element through the picker
 *  - single object   → pick at the top level
 *  - anything else   → returned unchanged (projection is meaningless)
 *
 * Missing keys are silently dropped so a single field list works across
 * heterogenous list shapes (e.g. a `--fields name,uuid` that hits both
 * tables and fields in `ldash search`).
 */
export function projectFields(
  data: unknown,
  fields: readonly string[],
): unknown {
  if (fields.length === 0) return data
  if (Array.isArray(data)) {
    return data.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? pickKeys(item as Record<string, unknown>, fields)
        : item,
    )
  }
  if (data && typeof data === 'object') {
    return pickKeys(data as Record<string, unknown>, fields)
  }
  return data
}

/**
 * Decide which fields to project on, given the global flags and the optional
 * command-specific compact default. Returns null when no projection should be
 * applied.
 */
export function resolveProjection(
  flags: Flags,
  commandCompactFields: readonly string[] | undefined,
): readonly string[] | null {
  if (flags.fields && flags.fields.length > 0) return flags.fields
  if (flags.compact) {
    return commandCompactFields ?? DEFAULT_COMPACT_FIELDS
  }
  return null
}

export function output(
  data: unknown,
  flags: Flags,
  commandCompactFields?: readonly string[],
): void {
  // Project before serializing so --fields trims the rendered output too.
  const projection = resolveProjection(flags, commandCompactFields)
  const projected = projection ? projectFields(data, projection) : data

  if (typeof projected === 'string') {
    // Strings are human-oriented messages — print raw so newlines render.
    // Under --json, serialize them so the output is still valid JSON.
    console.log(flags.json ? JSON.stringify(projected) : projected)
    return
  }
  if (flags.json) {
    console.log(JSON.stringify(projected))
  } else {
    console.log(JSON.stringify(projected, null, 2))
  }
}

export function parseGlobalFlags(argv: string[]): {
  args: string[]
  flags: Flags
} {
  const flags: Flags = {}
  const args: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') {
      flags.json = true
      continue
    }
    if (arg === '--compact') {
      flags.compact = true
      continue
    }
    if (arg === '--fields') {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new CliError(
          'Missing value for --fields',
          'The flag "--fields" requires a comma-separated list of keys.',
          'Pass a value: --fields name,uuid,description',
          'MISSING_FLAG',
        )
      }
      flags.fields = next
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
      if (flags.fields.length === 0) {
        throw new CliError(
          'Empty value for --fields',
          'The --fields list parsed to nothing.',
          'Pass at least one key: --fields name,uuid,description',
          'INVALID_INPUT',
        )
      }
      i++
      continue
    }
    args.push(arg)
  }

  return { args, flags }
}
