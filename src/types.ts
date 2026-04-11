export interface Flags {
  json?: boolean
}

export interface Command {
  description: string
  usage: string
  examples: string[]
  nextSteps: string[]
  run: (args: string[], flags: Flags) => Promise<unknown>
}

export interface CommandGroup {
  description: string
  workflow: string[]
  commands: Record<string, Command>
  defaultRun?: (args: string[], flags: Flags) => Promise<unknown>
  /**
   * When true, `defaultRun` is invoked even with zero arguments (instead of
   * printing group help). Used by `setup`, which has a meaningful no-arg flow.
   */
  handlesEmptyArgs?: boolean
}
