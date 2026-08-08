import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import type { RuntimeDevServer } from './runtime-session-manager.js'
import type { RuntimePreflightResult } from './runtime-preflight.js'
import { RuntimeToolError } from './runtime-service.js'

const TAIL_BYTES = 64 * 1024
const LOOPBACK_URL = /http:\/\/127\.0\.0\.1:(\d+)\/?/
export const RUNTIME_PORT_PLACEHOLDER = '__WAICA_RUNTIME_PORT__'

export interface RuntimeDevServerOptions {
  graceMs?: number
  forceWaitMs?: number
  maxPortAttempts?: number
  allocatePort?: () => Promise<number>
}

class ByteTail {
  private value = Buffer.alloc(0)

  append(chunk: Buffer | string): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.value = Buffer.concat([this.value, bytes]).subarray(-TAIL_BYTES)
  }

  text(): string {
    return this.value.toString('utf8')
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('could not allocate a loopback TCP port'))
        return
      }
      const { port } = address
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

async function waitForGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    if (!groupAlive(pid)) return true
    await delay(10)
  }
  return !groupAlive(pid)
}

async function terminateGroup(child: ChildProcess, graceMs: number, forceWaitMs: number): Promise<void> {
  const pid = child.pid
  if (pid === undefined || !groupAlive(pid)) return
  signalGroup(pid, 'SIGTERM')
  if (await waitForGroupExit(pid, graceMs)) return
  signalGroup(pid, 'SIGKILL')
  if (!(await waitForGroupExit(pid, forceWaitMs))) {
    throw new Error(`process group ${pid} survived SIGKILL`)
  }
}

async function portAcceptsConnections(url: string): Promise<boolean> {
  const parsed = new URL(url)
  const port = Number(parsed.port)
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const finish = (open: boolean): void => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(100)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function waitForClosedPort(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    if (!(await portAcceptsConnections(url))) return true
    await delay(10)
  }
  return !(await portAcceptsConnections(url))
}

async function probe(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(250) })
    await response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}

class OwnedRuntimeDevServer implements RuntimeDevServer {
  private stopping = false
  private stopped = false
  private exitHandler: ((detail: Record<string, unknown>) => void) | undefined

  constructor(
    readonly url: string,
    private readonly child: ChildProcess,
    private readonly stdout: ByteTail,
    private readonly stderr: ByteTail,
    private readonly graceMs: number,
    private readonly forceWaitMs: number,
    private readonly command: string,
    private readonly args: string[],
  ) {
    child.once('exit', () => {
      if (!this.stopping) this.exitHandler?.(this.diagnostics())
    })
  }

  setExitHandler(handler: (detail: Record<string, unknown>) => void): void {
    this.exitHandler = handler
  }

  diagnostics(): Record<string, unknown> {
    return {
      command: this.command,
      args: this.args,
      stdout: this.stdout.text(),
      stderr: this.stderr.text(),
      exitCode: this.child.exitCode,
      signal: this.child.signalCode,
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopping = true
    await terminateGroup(this.child, this.graceMs, this.forceWaitMs)
    if (!(await waitForClosedPort(this.url, this.forceWaitMs))) {
      throw new Error(`loopback port remained open after process cleanup: ${this.url}`)
    }
    this.stopped = true
  }
}

function diagnostics(
  child: ChildProcess,
  stdout: ByteTail,
  stderr: ByteTail,
  command: string,
  args: string[],
): Record<string, unknown> {
  return {
    command,
    args,
    stdout: stdout.text(),
    stderr: stderr.text(),
    exitCode: child.exitCode,
    signal: child.signalCode,
  }
}

async function startAttempt(
  preflight: RuntimePreflightResult,
  args: string[],
  expectedPort: number | undefined,
  options: RuntimeDevServerOptions,
): Promise<RuntimeDevServer> {
  const stdout = new ByteTail()
  const stderr = new ByteTail()
  let child: ChildProcess
  try {
    child = spawn(preflight.command, args, {
      cwd: preflight.projectPath,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      detached: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new RuntimeToolError({
      code: 'runtime-start-failed',
      stage: 'dev-server',
      message: `Could not spawn the Project dev script: ${error instanceof Error ? error.message : String(error)}`,
      projectPath: preflight.projectPath,
      diagnostics: { command: preflight.command, args, stdout: '', stderr: '' },
    })
  }
  child.stdout?.on('data', (chunk: Buffer) => stdout.append(chunk))
  child.stderr?.on('data', (chunk: Buffer) => stderr.append(chunk))
  const spawnError = new Promise<Error | null>((resolve) => {
    child.once('error', (error) => resolve(error))
    child.once('spawn', () => resolve(null))
  })
  const error = await spawnError
  if (error) {
    throw new RuntimeToolError({
      code: 'runtime-start-failed',
      stage: 'dev-server',
      message: `Could not spawn the Project dev script: ${error.message}`,
      projectPath: preflight.projectPath,
      diagnostics: { command: preflight.command, args, stdout: stdout.text(), stderr: stderr.text() },
    })
  }

  const deadline = Date.now() + preflight.timeoutMs
  let parsedUrl: string | undefined
  while (Date.now() <= deadline) {
    if (child.exitCode !== null || child.signalCode !== null) break
    const match = LOOPBACK_URL.exec(`${stdout.text()}\n${stderr.text()}`)
    if (match) {
      const reportedPort = Number(match[1])
      parsedUrl = `http://127.0.0.1:${reportedPort}/`
      if (expectedPort !== undefined && reportedPort !== expectedPort) {
        await terminateGroup(child, options.graceMs ?? 2_000, options.forceWaitMs ?? 2_000)
        throw new RuntimeToolError({
          code: 'runtime-start-failed',
          stage: 'dev-server',
          message: `Project dev script did not forward the required --port ${expectedPort}; it reported ${parsedUrl}.`,
          projectPath: preflight.projectPath,
          diagnostics: diagnostics(child, stdout, stderr, preflight.command, args),
        })
      }
      if (await probe(parsedUrl)) {
        return new OwnedRuntimeDevServer(
          parsedUrl,
          child,
          stdout,
          stderr,
          options.graceMs ?? 2_000,
          options.forceWaitMs ?? 2_000,
          preflight.command,
          args,
        )
      }
    }
    await delay(20)
  }

  const detail = diagnostics(child, stdout, stderr, preflight.command, args)
  await terminateGroup(child, options.graceMs ?? 2_000, options.forceWaitMs ?? 2_000)
  throw new RuntimeToolError({
    code: 'runtime-start-failed',
    stage: 'dev-server',
    message: child.exitCode !== null
      ? `Project dev script exited with code ${child.exitCode} before a usable loopback URL was ready.`
      : parsedUrl
        ? `Project dev script reported ${parsedUrl}, but its HTTP page never became ready.`
        : 'Project dev script never reported a usable http://127.0.0.1 URL.',
    projectPath: preflight.projectPath,
    diagnostics: detail,
  })
}

function isBindCollision(error: unknown): boolean {
  if (!(error instanceof RuntimeToolError)) return false
  const diagnosticsText = JSON.stringify(error.body.diagnostics ?? {})
  return /EADDRINUSE|address already in use|Port \d+ is already in use/i.test(
    `${error.message}\n${diagnosticsText}`,
  )
}

export async function startRuntimeDevServer(
  preflight: RuntimePreflightResult,
  options: RuntimeDevServerOptions = {},
): Promise<RuntimeDevServer> {
  const placeholder = preflight.args.indexOf(RUNTIME_PORT_PLACEHOLDER)
  if (placeholder === -1) return startAttempt(preflight, preflight.args, undefined, options)

  const attempts = options.maxPortAttempts ?? 3
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const port = await (options.allocatePort ?? allocateLoopbackPort)()
    const args = [...preflight.args]
    args[placeholder] = String(port)
    try {
      return await startAttempt(preflight, args, port, options)
    } catch (error) {
      lastError = error
      if (!isBindCollision(error) || attempt === attempts - 1) throw error
    }
  }
  throw lastError
}
