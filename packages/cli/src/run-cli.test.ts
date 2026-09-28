import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from './run-cli.js'

function capture(): { lines: string[]; write(text: string): boolean } {
  const lines: string[] = []
  return {
    lines,
    write(text: string) {
      lines.push(text)
      return true
    },
  }
}

describe('runCli', () => {
  it('prints one waica: line and sets exit code 1 when main rejects', async () => {
    const stderr = capture()
    const exit: { exitCode?: number } = {}
    await runCli(() => Promise.reject(new Error('registry exploded')), { stderr, process: exit })

    expect(stderr.lines).toEqual(['waica: registry exploded\n'])
    expect(exit.exitCode).toBe(1)
  })

  it('never prints a stack trace, even for multi-line messages or non-errors', async () => {
    const stderr = capture()
    const exit: { exitCode?: number } = {}
    await runCli(() => Promise.reject(new Error('first line\n    at secret (/tmp/x.js:1:1)')), {
      stderr,
      process: exit,
    })
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- proves a non-Error rejection still prints one line
    await runCli(() => Promise.reject('plain string'), { stderr, process: exit })

    expect(stderr.lines).toEqual([
      'waica: first line at secret (/tmp/x.js:1:1)\n',
      'waica: plain string\n',
    ])
    for (const line of stderr.lines) expect(line.indexOf('\n')).toBe(line.length - 1)
  })

  it('leaves the exit code alone when main resolves', async () => {
    const stderr = capture()
    const exit: { exitCode?: number } = {}
    await runCli(() => Promise.resolve(), { stderr, process: exit })
    expect(stderr.lines).toEqual([])
    expect(exit.exitCode).toBeUndefined()
  })

  it('is how the waica binary runs main', async () => {
    const source = await readFile(path.join(import.meta.dirname, 'cli.ts'), 'utf8')
    expect(source).toMatch(/await runCli\(main\)/)
    expect(source).not.toMatch(/void main\(\)/)
  })
})
