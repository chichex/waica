import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, tempDir } from './test-helpers.js'

const moduleUrl = new URL('./stdio-shutdown.ts', import.meta.url).href
const roots: string[] = []
const children: ChildProcess[] = []

afterEach(async () => {
  for (const child of children.splice(0)) child.kill('SIGKILL')
  await cleanup(...roots.splice(0))
})

interface Exit {
  code: number | null
  signal: NodeJS.Signals | null
  elapsedMs: number
}

/**
 * A Node child serving stdin through installStdioShutdown with a fake server
 * whose close() records each call in `log` and takes `closeMs`. Like the
 * SDK's StdioServerTransport.close(), the fake close pauses stdin.
 */
function fixtureSource(log: string, closeMs: number, deadlineMs: number): string {
  return `import { appendFileSync } from 'node:fs'
import { installStdioShutdown } from ${JSON.stringify(moduleUrl)}
const server = {
  close: () => {
    appendFileSync(${JSON.stringify(log)}, 'close\\n')
    return new Promise((resolve) => setTimeout(resolve, ${closeMs})).then(() => process.stdin.pause())
  },
}
installStdioShutdown({ server, host: process, stdin: process.stdin, deadlineMs: ${deadlineMs} })
process.stdin.resume()
process.stdout.write('ready\\n')
`
}

async function startChild(closeMs: number, deadlineMs: number): Promise<{
  child: ChildProcess
  closes: () => Promise<number>
  exit: () => Promise<Exit>
}> {
  const directory = await tempDir('waica-stdio-shutdown-')
  roots.push(directory)
  const log = path.join(directory, 'closes.log')
  const fixture = path.join(directory, 'fixture.mjs')
  await writeFile(log, '')
  await writeFile(fixture, fixtureSource(log, closeMs, deadlineMs))
  const child = spawn(process.execPath, [fixture], { stdio: ['pipe', 'pipe', 'pipe'] })
  children.push(child)
  await new Promise<void>((resolve, reject) => {
    child.stdout?.once('data', () => resolve())
    child.once('error', reject)
  })
  let started = 0
  const exited = new Promise<Exit>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal, elapsedMs: Date.now() - started }))
  })
  const exit = (): Promise<Exit> => {
    started = Date.now()
    return exited
  }
  const closes = async (): Promise<number> =>
    (await readFile(log, 'utf8')).split('\n').filter(Boolean).length
  return { child, closes, exit }
}

describe('stdio server shutdown on a clean close', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)(
    'closes the server once on %s and exits 0',
    async (signal) => {
      const { child, closes, exit } = await startChild(50, 5_000)
      const exited = exit()
      child.kill(signal)
      await expect(exited).resolves.toMatchObject({ code: 0, signal: null })
      expect(await closes()).toBe(1)
    },
  )

  it('closes the server once when the host ends stdin and exits 0', async () => {
    const { child, closes, exit } = await startChild(50, 5_000)
    const exited = exit()
    child.stdin?.end()
    await expect(exited).resolves.toMatchObject({ code: 0, signal: null })
    expect(await closes()).toBe(1)
  })

})

describe('stdio server shutdown when closing stalls', () => {
  it('exits 1 at the deadline when closing hangs', async () => {
    const { child, closes, exit } = await startChild(60_000, 400)
    const exited = exit()
    child.kill('SIGTERM')
    const result = await exited
    expect(result).toMatchObject({ code: 1, signal: null })
    expect(result.elapsedMs).toBeLessThan(3_000)
    expect(await closes()).toBe(1)
  })

  it('exits immediately on a second signal during shutdown', async () => {
    const { child, closes, exit } = await startChild(60_000, 60_000)
    const exited = exit()
    child.kill('SIGTERM')
    await expect.poll(closes).toBe(1)
    child.kill('SIGINT')
    const result = await exited
    expect(result).toMatchObject({ code: 1, signal: null })
    expect(result.elapsedMs).toBeLessThan(3_000)
    expect(await closes()).toBe(1)
  })

  it('uses a five second deadline by default and is installed by the stdio server', async () => {
    const { SHUTDOWN_DEADLINE_MS } = await import('./stdio-shutdown.js')
    expect(SHUTDOWN_DEADLINE_MS).toBe(5_000)
    const source = await readFile(path.join(import.meta.dirname, 'stdio.ts'), 'utf8')
    expect(source).toMatch(/installStdioShutdown\(\{\s*server,\s*host: process,\s*stdin: process\.stdin/)
  })
})
