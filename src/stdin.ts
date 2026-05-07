import { readFileSync } from 'node:fs'
import { CliError } from './errors.js'

/**
 * Read all of stdin into a string. Used by `--body -` and `query sql -` so
 * agents can pipe long SQL or JSON without fighting shell quoting.
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new CliError(
      'Cannot read body from stdin',
      'You passed "-" but stdin is a terminal — there is nothing to read.',
      'Pipe data in: cat body.json | ldash ... --body -',
      'INVALID_INPUT',
    )
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function readFileRef(path: string, displayLabel: string): string {
  try {
    return readFileSync(path, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    const why =
      code === 'ENOENT'
        ? `File not found: ${path}`
        : code === 'EACCES'
          ? `Permission denied: ${path}`
          : `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`
    throw new CliError(
      `Could not read ${displayLabel}`,
      why,
      'Check the path. Use an absolute path, or run from the directory containing the file.',
      'INVALID_INPUT',
    )
  }
}

/**
 * Resolve a value that may be:
 *   - "-"                  → read from stdin (rejected if empty)
 *   - "@path/to/file.json" → read from file (relative to cwd)
 *   - any other string     → returned unchanged (assumed inline value)
 *
 * `displayLabel` is shown verbatim in error messages (e.g. `--body`, `<sql>`);
 * `fileExample` and `pipeExample` are shown in the "pipe data in" / "pass a
 * real file" hints.
 */
async function resolveRef(
  value: string,
  displayLabel: string,
  pipeExample: string,
  fileExample: string,
): Promise<string> {
  if (value === '-') {
    const piped = await readStdin()
    if (piped.trim() === '') {
      throw new CliError(
        `Empty stdin for ${displayLabel}`,
        `You passed "-" for ${displayLabel} but stdin closed without producing any data.`,
        `Pipe data in: ${pipeExample}`,
        'INVALID_INPUT',
      )
    }
    return piped
  }
  if (value.startsWith('@')) {
    const path = value.slice(1)
    if (path === '') {
      throw new CliError(
        `Empty file path after @ for ${displayLabel}`,
        '"@" must be followed by a path.',
        `Pass a real file: ${fileExample}`,
        'INVALID_INPUT',
      )
    }
    return readFileRef(path, displayLabel)
  }
  return value
}

/**
 * Resolve a flag value that may be undefined / "-" (stdin) / "@file".
 * Used by every JSON-bearing flag so agents can avoid nested-quote pain.
 */
export function readFlagValue(
  value: string | undefined,
  label: string,
): Promise<string | undefined> {
  if (value === undefined) return Promise.resolve(undefined)
  return resolveRef(
    value,
    label,
    `cat input.json | ldash ... ${label} -`,
    `${label} @./input.json`,
  )
}

/** Backwards-compatible alias preserved so api-escape / metrics-explorer
 *  read with `--body` semantics. */
export function readBodyOrStdin(
  value: string | undefined,
): Promise<string | undefined> {
  return readFlagValue(value, '--body')
}

/**
 * Resolve a positional argument that may be "-" (stdin) or "@file".
 */
export function readPositionalOrStdin(
  value: string,
  label: string,
): Promise<string> {
  return resolveRef(
    value,
    `<${label}>`,
    'cat input.txt | ldash ... -',
    'ldash ... @./input.txt',
  )
}
