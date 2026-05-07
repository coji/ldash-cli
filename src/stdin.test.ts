import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { CliError } from './errors.js'
import { readBodyOrStdin, readPositionalOrStdin } from './stdin.js'

const ORIGINAL_STDIN = process.stdin
let restoreStdin: (() => void) | undefined

function withStdin(content: string): void {
  const stream = Readable.from([content]) as NodeJS.ReadStream
  // Pretend it's not a TTY so readStdin() actually consumes the stream.
  Object.defineProperty(stream, 'isTTY', { value: false })
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: stream,
  })
  restoreStdin = () => {
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: ORIGINAL_STDIN,
    })
  }
}

afterEach(() => {
  if (restoreStdin) {
    restoreStdin()
    restoreStdin = undefined
  }
})

describe('readBodyOrStdin', () => {
  it('returns undefined when no value is provided', async () => {
    expect(await readBodyOrStdin(undefined)).toBeUndefined()
  })

  it('returns the value unchanged when not "-"', async () => {
    expect(await readBodyOrStdin('{"x":1}')).toBe('{"x":1}')
  })

  it('reads stdin when value is "-"', async () => {
    withStdin('{"piped":true}')
    expect(await readBodyOrStdin('-')).toBe('{"piped":true}')
  })

  it('throws on empty piped stdin', async () => {
    withStdin('')
    await expect(readBodyOrStdin('-')).rejects.toBeInstanceOf(CliError)
  })
})

describe('readPositionalOrStdin', () => {
  it('returns the value unchanged when not "-"', async () => {
    expect(await readPositionalOrStdin('SELECT 1', 'sql')).toBe('SELECT 1')
  })

  it('reads stdin when value is "-"', async () => {
    withStdin('SELECT * FROM orders')
    expect(await readPositionalOrStdin('-', 'sql')).toBe('SELECT * FROM orders')
  })

  it('throws on whitespace-only piped stdin', async () => {
    withStdin('   \n  ')
    await expect(readPositionalOrStdin('-', 'sql')).rejects.toBeInstanceOf(
      CliError,
    )
  })
})
