import { CliError } from './errors.js'

export interface ArgsSchema {
  /** Max number of positional args allowed. 0 = none. undefined = unlimited. */
  positionalMax?: number
  /**
   * Min number of positional args required. undefined = none required.
   * Each missing positional throws a "Missing required argument" CliError
   * using the matching label from `positionals`.
   */
  positionalMin?: number
  /** Short human labels for positionals, used in error messages. */
  positionals?: readonly string[]
  /** --foo with a string value. */
  string?: readonly string[]
  /** --foo as a presence-only flag. */
  boolean?: readonly string[]
  /** --foo that takes a positive integer, optionally bounded. */
  int?: Readonly<Record<string, { min?: number; max?: number }>>
}

export interface ParsedArgs {
  positional: string[]
  string: Record<string, string | undefined>
  boolean: Record<string, boolean>
  int: Record<string, number | undefined>
}

function unknownFlag(name: string): CliError {
  return new CliError(
    `Unknown flag "--${name}"`,
    `The flag "--${name}" is not recognized by this command.`,
    'Run "ldash <group> <cmd> --help" for available flags.',
    'UNKNOWN_FLAG',
  )
}

function missingValue(name: string): CliError {
  return new CliError(
    `Missing value for --${name}`,
    `The flag "--${name}" requires a value but none was provided.`,
    `Pass a value: --${name} <value>`,
    'MISSING_FLAG',
  )
}

export function parseArgs(
  argv: readonly string[],
  schema: ArgsSchema,
): ParsedArgs {
  const stringSet = new Set(schema.string ?? [])
  const booleanSet = new Set(schema.boolean ?? [])
  const intSchema = schema.int ?? {}
  const intSet = new Set(Object.keys(intSchema))

  const result: ParsedArgs = {
    positional: [],
    string: {},
    boolean: {},
    int: {},
  }
  for (const name of booleanSet) result.boolean[name] = false

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      result.positional.push(token)
      continue
    }
    const name = token.slice(2)
    if (booleanSet.has(name)) {
      result.boolean[name] = true
      continue
    }
    if (stringSet.has(name)) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw missingValue(name)
      result.string[name] = next
      i++
      continue
    }
    if (intSet.has(name)) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw missingValue(name)
      if (!/^\d+$/.test(next)) {
        throw new CliError(
          `Invalid value for --${name}`,
          `"${next}" is not a positive integer.`,
          `Pass a positive integer: --${name} 10`,
          'INVALID_INPUT',
        )
      }
      const value = Number.parseInt(next, 10)
      const bounds = intSchema[name]
      if (bounds.min !== undefined && value < bounds.min) {
        throw new CliError(
          `Invalid value for --${name}`,
          `${value} is below the minimum (${bounds.min}).`,
          `Pass a value >= ${bounds.min}: --${name} ${bounds.min}`,
          'INVALID_INPUT',
        )
      }
      if (bounds.max !== undefined && value > bounds.max) {
        throw new CliError(
          `Invalid value for --${name}`,
          `${value} exceeds the maximum (${bounds.max}).`,
          `Pass a value <= ${bounds.max}: --${name} ${bounds.max}`,
          'INVALID_INPUT',
        )
      }
      result.int[name] = value
      i++
      continue
    }
    throw unknownFlag(name)
  }

  if (
    schema.positionalMax !== undefined &&
    result.positional.length > schema.positionalMax
  ) {
    const labels = schema.positionals?.join(', ') ?? ''
    const max = schema.positionalMax
    const noun = max === 1 ? 'one' : String(max)
    throw new CliError(
      'Too many positional arguments',
      `This command accepts at most ${noun}${labels ? ` (${labels})` : ''}, got: ${result.positional.join(', ')}`,
      'Remove the extra arguments or check the command usage.',
      'INVALID_INPUT',
    )
  }

  if (
    schema.positionalMin !== undefined &&
    result.positional.length < schema.positionalMin
  ) {
    const i = result.positional.length
    const name = schema.positionals?.[i] ?? `arg${i + 1}`
    const ord = i === 0 ? 'first' : i === 1 ? 'second' : `#${i + 1}`
    throw new CliError(
      `Missing required argument <${name}>`,
      `This command needs a ${name} to run.`,
      `Pass it as the ${ord} positional argument.`,
      'MISSING_ARGUMENT',
    )
  }

  return result
}
