export interface Flags {
  json?: boolean
  /**
   * Field projection: pluck only these keys from the result. For an array,
   * applies to each element. For an object, applies to the top level.
   * Mirrors `jq '[.[] | {a, b}]'` for the common list-shrinking case.
   */
  fields?: string[]
  /**
   * Convenience: apply a per-command default field projection. Falls back to
   * a universal `['uuid', 'name', 'description']` subset when the command
   * doesn't specify its own.
   */
  compact?: boolean
}

export interface Command {
  description: string
  usage: string
  examples: string[]
  nextSteps: string[]
  /** Default field projection used by `--compact` when the user hasn't set
   *  `--fields` explicitly. */
  compactFields?: string[]
  run: (args: string[], flags: Flags) => Promise<unknown>
}

export interface CommandGroup {
  description: string
  workflow: string[]
  commands: Record<string, Command>
  defaultRun?: (args: string[], flags: Flags) => Promise<unknown>
  /** Default field projection for the group's `defaultRun` under `--compact`. */
  compactFields?: string[]
  /**
   * When true, `defaultRun` is invoked even with zero arguments (instead of
   * printing group help). Used by `setup`, which has a meaningful no-arg flow.
   */
  handlesEmptyArgs?: boolean
}
