import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

describe('@file syntax', () => {
  let tmpDir: string | undefined

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = undefined
    }
  })

  function makeTmpFile(name: string, contents: string): string {
    tmpDir = mkdtempSync(join(tmpdir(), 'ldash-stdin-test-'))
    const path = join(tmpDir, name)
    writeFileSync(path, contents)
    return path
  }

  it('readBodyOrStdin reads file contents when value is @path', async () => {
    const path = makeTmpFile('body.json', '{"hello":"world"}')
    expect(await readBodyOrStdin(`@${path}`)).toBe('{"hello":"world"}')
  })

  it('readPositionalOrStdin reads file contents when value is @path', async () => {
    const path = makeTmpFile('query.sql', 'SELECT 1\n')
    expect(await readPositionalOrStdin(`@${path}`, 'sql')).toBe('SELECT 1\n')
  })

  it('throws CliError for a missing @file', async () => {
    await expect(
      readBodyOrStdin('@/nonexistent/path/to/file.json'),
    ).rejects.toBeInstanceOf(CliError)
  })

  it('throws CliError for an empty @-prefix with no path', async () => {
    await expect(readBodyOrStdin('@')).rejects.toBeInstanceOf(CliError)
    await expect(readPositionalOrStdin('@', 'sql')).rejects.toBeInstanceOf(
      CliError,
    )
  })
})
