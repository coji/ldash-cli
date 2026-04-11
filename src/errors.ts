export class CliError extends Error {
  constructor(
    public what: string,
    public why: string,
    public hint: string,
  ) {
    super(what)
    this.name = 'CliError'
  }
}

export function formatError(err: CliError): string {
  return `Error: ${err.what}\nWhy: ${err.why}\nHint: ${err.hint}`
}

export function wrapApiError(err: unknown): CliError {
  if (err instanceof CliError) return err
  const message = err instanceof Error ? err.message : 'Unknown error occurred'
  return new CliError(
    'Unexpected error',
    message,
    'Run "ldash --help" for available commands.',
  )
}

export function missingArg(name: string, groupCommand: string): CliError {
  const group = groupCommand.split(' ')[0]
  return new CliError(
    `Missing required argument <${name}>`,
    `"${groupCommand}" needs a ${name} to look up.`,
    `Run "ldash ${group} list" to see available options.`,
  )
}
