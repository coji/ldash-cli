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

export function wrapApiError(err: unknown, context?: string): CliError {
  const message = err instanceof Error ? err.message : 'Unknown error occurred'

  if (message.includes('LIGHTDASH_API_KEY')) {
    return new CliError(
      'LIGHTDASH_API_KEY is not set',
      'Authentication is required to access the Lightdash API.',
      'Set it with: export LIGHTDASH_API_KEY=your_token',
    )
  }

  if (message.includes('LIGHTDASH_PROJECT_UUID')) {
    return new CliError(
      'LIGHTDASH_PROJECT_UUID is not set',
      'Most commands require a project context.',
      'Run "ldash project list" to find your project UUID,\n      then: export LIGHTDASH_PROJECT_UUID=<uuid>',
    )
  }

  if (message.includes('NotFoundError') || message.includes('404')) {
    return new CliError(
      'Lightdash API error: Not Found',
      context
        ? `The requested ${context} was not found in this project.`
        : 'The requested resource was not found.',
      context
        ? `Check the ${context} identifier. Run "ldash ${context} list" to see valid options.`
        : 'Verify the identifier and try again.',
    )
  }

  if (message.includes('401') || message.includes('Unauthorized')) {
    return new CliError(
      'Lightdash API error: Unauthorized',
      'Your API key is invalid or expired.',
      'Check LIGHTDASH_API_KEY. Generate a new token in Lightdash settings.',
    )
  }

  return new CliError(
    'Lightdash API error',
    message,
    context
      ? `Run "ldash ${context} --help" for usage details.`
      : 'Run "ldash --help" for available commands.',
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
