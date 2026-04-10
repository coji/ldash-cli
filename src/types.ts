export interface Flags {
  json?: boolean
}

export interface Command {
  description: string
  usage: string
  examples: string[]
  nextSteps: string[]
  run: (args: string[]) => Promise<unknown>
}

export interface CommandGroup {
  description: string
  workflow: string[]
  commands: Record<string, Command>
  defaultRun?: (args: string[]) => Promise<unknown>
}
