import type { ComponentClass, ParamSpec } from '@waica/engine'
import { fork, type ChildProcess, type ForkOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as nodeModule from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PackageResolver } from './package-resolver.js'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import {
  PROJECT_COMPONENT_PROTOCOL_VERSION,
  parseTerminal,
  record,
  validReady,
  type ComponentLoadFailure,
  type ComponentLoadFailureCode,
  type ComponentRow,
  type EntryOutcome,
  type ParsedTerminal,
} from './project-component-protocol.js'
import { directFiles } from './project-path.js'

export {
  PROJECT_COMPONENT_PROTOCOL_VERSION,
  type ComponentLoadFailure,
  type ComponentLoadFailureCode,
} from './project-component-protocol.js'

export const PROJECT_COMPONENT_DEADLINE_MS = 5_000
export const PROJECT_COMPONENT_DIAGNOSTIC_BYTES = 64 * 1_024

const MODULE_HOOKS_MIN_NODE = '22.15'

export interface ProjectComponentDescription {
  file: string
  /** Parent-created scheduling adapter; never a Project constructor. */
  Class: ComponentClass
  params: Record<string, ParamSpec>
  defaults: Record<string, unknown>
}

export interface ProjectComponentLoadResult {
  components: Record<string, ProjectComponentDescription>
  failures: ComponentLoadFailure[]
}

export interface ProjectComponentLoadOptions {
  signal?: AbortSignal
  /** Private test seam; the MCP tool exposes no timeout argument. */
  deadlineMs?: number
  /** Private runner-infrastructure seam used by focused integration tests. */
  runnerPath?: string
}

export type ProjectComponentChildLauncher = (
  modulePath: string,
  args: string[],
  options: ForkOptions,
) => ChildProcess

export interface ProjectComponentLoaderOptions {
  deadlineMs?: number
  runnerPath?: string
  /** OS-process boundary adapter; production uses node:child_process.fork. */
  launcher?: ProjectComponentChildLauncher
}

interface ActiveExecution {
  terminate(reason: unknown): Promise<void>
}

export class ProjectComponentRunnerUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectComponentRunnerUnavailableError'
  }
}

/** Pure feature probe retained for callers that report the native Node capability. */
export function nodeSupportsModuleHooks(
  moduleApi: { registerHooks?: unknown } = nodeModule,
): boolean {
  return typeof moduleApi.registerHooks === 'function'
}

/** Compatibility diagnostic for hosts below the package's declared Node floor. */
export function unsupportedNodeFailure(
  nodeVersion: string = process.version,
): ComponentLoadFailure {
  return {
    code: 'component-load-unsupported',
    file: 'src',
    message:
      `Deep component validation requires Node >= ${MODULE_HOOKS_MIN_NODE} (node:module registerHooks) ` +
      `to run isolated project-entry children; this host runs Node ${nodeVersion}. ` +
      'Skipping validate_project component metadata loading until the host upgrades.',
  }
}

function appendTail(current: Buffer, chunk: Buffer | string): Buffer {
  const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  if (next.length >= PROJECT_COMPONENT_DIAGNOSTIC_BYTES) {
    return next.subarray(next.length - PROJECT_COMPONENT_DIAGNOSTIC_BYTES)
  }
  const combined = Buffer.concat([current, next])
  return combined.length <= PROJECT_COMPONENT_DIAGNOSTIC_BYTES
    ? combined
    : combined.subarray(combined.length - PROJECT_COMPONENT_DIAGNOSTIC_BYTES)
}

function diagnosticMessage(base: string, stdout: Buffer, stderr: Buffer): string {
  const diagnostics: string[] = []
  if (stdout.length > 0) diagnostics.push(`stdout tail:\n${stdout.toString('utf8')}`)
  if (stderr.length > 0) diagnostics.push(`stderr tail:\n${stderr.toString('utf8')}`)
  return diagnostics.length > 0 ? `${base}\n${diagnostics.join('\n')}` : base
}

function schedulingAdapter(row: ComponentRow): ComponentClass {
  class SchedulingAdapter {}
  Object.defineProperty(SchedulingAdapter, 'componentName', { value: row.name })
  if (row.hasUpdateAfter) {
    Object.defineProperty(SchedulingAdapter, 'updateAfter', {
      value: Object.freeze([...row.updateAfter]),
    })
  }
  if (row.space !== null) {
    Object.defineProperty(SchedulingAdapter, 'space', { value: row.space })
  }
  if (row.hasOnUpdate) {
    Object.defineProperty(SchedulingAdapter.prototype, 'onUpdate', {
      value: () => undefined,
    })
  }
  return asSchedulingClass(SchedulingAdapter)
}

/**
 * A scheduling stand-in carries only what resolveComponentUpdateSchedule
 * reads (componentName, updateAfter, prototype.onUpdate) and what
 * validate_project reads (space). This process imports @waica/engine for
 * types only — project code and its engine run in isolated children — so
 * the stand-in cannot extend the real Component class. This is the one
 * place that presents it as a ComponentClass.
 */
function asSchedulingClass(adapter: new () => object): ComponentClass {
  // eslint-disable-next-line no-restricted-syntax -- structural stand-in: this process loads no engine runtime code; the scheduler and validate_project read only componentName, updateAfter, space and prototype.onUpdate
  return adapter as unknown as ComponentClass
}

function description(row: ComponentRow): ProjectComponentDescription {
  const params: Record<string, ParamSpec> = {}
  const defaults: Record<string, unknown> = {}
  for (const param of row.params) {
    params[param.name] = {
      ref: param.ref,
      ...(param.hasOptions ? { options: [] } : {}),
    } as ParamSpec
    if (param.default !== undefined) defaults[param.name] = param.default
  }
  return {
    file: row.file,
    Class: schedulingAdapter(row),
    params,
    defaults,
  }
}

function runnerFromModule(): string {
  const javascript = fileURLToPath(
    new URL('./project-component-runner.js', import.meta.url),
  )
  if (existsSync(javascript)) return javascript
  const typescript = fileURLToPath(
    new URL('./project-component-runner.ts', import.meta.url),
  )
  if (existsSync(typescript)) return typescript
  throw new ProjectComponentRunnerUnavailableError(
    `Project component runner is missing beside ${fileURLToPath(import.meta.url)}.`,
  )
}

async function projectModuleFiles(projectPath: string): Promise<string[]> {
  const groups = await Promise.all(
    ['components', 'roles', 'states'].map(async (directory) =>
      (await directFiles(path.join(projectPath, 'src', directory), '.ts')).map(
        (file) => `src/${directory}/${file}`,
      ),
    ),
  )
  return groups.flat()
}

function cancellationReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function unavailable(message: string, cause?: unknown): ProjectComponentRunnerUnavailableError {
  return new ProjectComponentRunnerUnavailableError(
    message,
    cause === undefined ? undefined : { cause },
  )
}

export class ProjectComponentLoader {
  private readonly active = new Set<ActiveExecution>()
  private readonly defaults: ProjectComponentLoaderOptions
  private closed = false

  constructor(options: ProjectComponentLoaderOptions = {}) {
    this.defaults = options
  }

  async load(
    projectPath: string,
    _resolver?: PackageResolver,
    options: ProjectComponentLoadOptions = {},
  ): Promise<ProjectComponentLoadResult> {
    this.assertOpen()
    options.signal?.throwIfAborted()
    const files = await projectModuleFiles(projectPath)
    this.assertOpen()
    options.signal?.throwIfAborted()
    if (files.length === 0) return { components: {}, failures: [] }

    const runnerPath = options.runnerPath ?? this.defaults.runnerPath ?? runnerFromModule()
    if (!existsSync(runnerPath)) {
      throw unavailable(`Project component runner is missing: ${runnerPath}`)
    }
    const deadlineMs = options.deadlineMs ?? this.defaults.deadlineMs ?? PROJECT_COMPONENT_DEADLINE_MS
    let fallbackEntries: Record<string, string>
    try {
      fallbackEntries = await fallbackEntriesFor(runnerPath)
    } catch (error) {
      throw unavailable('Cannot prepare source fallback packages for the project component runner.', error)
    }
    this.assertOpen()
    options.signal?.throwIfAborted()
    const components: Record<string, ProjectComponentDescription> = {}
    const failures: ComponentLoadFailure[] = []
    for (const relativeFile of files) {
      this.assertOpen()
      options.signal?.throwIfAborted()
      const outcome = await this.runEntry({
        projectPath,
        relativeFile,
        runnerPath,
        deadlineMs,
        fallbackEntries,
        signal: options.signal,
      })
      if ('failure' in outcome) {
        failures.push(outcome.failure)
      } else {
        for (const row of outcome.components) components[row.name] = description(row)
      }
    }
    return { components, failures }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw unavailable('Project component runner is unavailable because its owner is closed.')
    }
  }

  async close(): Promise<void> {
    if (this.closed && this.active.size === 0) return
    this.closed = true
    const reason = new DOMException('The MCP server is closing.', 'AbortError')
    await Promise.all([...this.active].map((execution) => execution.terminate(reason)))
  }

  private runEntry(input: EntryRequest): Promise<EntryOutcome> {
    let child: ChildProcess
    try {
      child = (this.defaults.launcher ?? fork)(input.runnerPath, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        serialization: 'json',
        execArgv: [],
      })
    } catch (error) {
      return Promise.reject(
        unavailable(`Cannot launch project component runner ${input.runnerPath}.`, error),
      )
    }
    const run = new EntryRun(child, input)
    const execution: ActiveExecution = {
      terminate: async (reason) => {
        run.abort(reason)
        await run.closed
        const failure = run.terminationFailure
        if (failure) throw failure
      },
    }
    this.active.add(execution)

    return new Promise<EntryOutcome>((resolve, reject) => {
      const { signal } = input
      const onAbort = (): void => {
        if (signal) run.abort(cancellationReason(signal))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      run.listen()
      child.once('close', (code, closeSignal) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        this.active.delete(execution)
        run.markClosed()
        const settled = run.settle(code, closeSignal)
        if ('error' in settled) reject(settled.error)
        else resolve(settled.outcome)
      })
      const timer = setTimeout(() => run.expire(), input.deadlineMs)
    })
  }
}

interface EntryRequest {
  projectPath: string
  relativeFile: string
  runnerPath: string
  deadlineMs: number
  fallbackEntries: Record<string, string>
  signal?: AbortSignal
}

type EntrySettlement = { error: unknown } | { outcome: EntryOutcome }

/**
 * One runner child for one project entry: its handshake, the single request,
 * exactly one terminal payload and bounded stdout/stderr tails, and the
 * outcome they add up to once the child's close is observed.
 */
class EntryRun {
  readonly closed: Promise<void>
  terminationFailure: Error | undefined
  private readonly token = randomUUID()
  private resolveClosed: () => void = () => undefined
  private stdout: Buffer = Buffer.alloc(0)
  private stderr: Buffer = Buffer.alloc(0)
  private ready = false
  private terminalCount = 0
  private terminal: ParsedTerminal | undefined
  private protocolFailure: string | undefined
  private infrastructureFailure: ProjectComponentRunnerUnavailableError | undefined
  private timedOut = false
  private aborted: unknown

  constructor(
    private readonly child: ChildProcess,
    private readonly request: EntryRequest,
  ) {
    this.closed = new Promise<void>((resolve) => {
      this.resolveClosed = resolve
    })
  }

  listen(): void {
    const { child } = this
    child.stdout?.on('data', (chunk: Buffer | string) => {
      this.stdout = appendTail(this.stdout, chunk)
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      this.stderr = appendTail(this.stderr, chunk)
    })
    child.on('error', (error) => {
      this.infrastructureFailure ??= unavailable(
        `Project component runner failed to launch for ${this.request.relativeFile}.`,
        error,
      )
      this.forceTerminate()
    })
    child.on('message', (message) => {
      if (this.ready) this.acceptTerminal(message)
      else this.acceptHandshake(message)
    })
  }

  abort(reason: unknown): void {
    this.aborted ??= reason
    this.forceTerminate()
  }

  /** The deadline passed: before the handshake the runner is unavailable, after it the entry timed out. */
  expire(): void {
    if (!this.ready) {
      this.infrastructureFailure ??= unavailable(
        `Project component runner did not complete its handshake within ${this.request.deadlineMs} ms for ${this.request.relativeFile}.`,
      )
    } else {
      this.timedOut = true
    }
    this.forceTerminate()
  }

  markClosed(): void {
    this.resolveClosed()
  }

  settle(code: number | null, signal: NodeJS.Signals | null): EntrySettlement {
    if (this.aborted !== undefined) return { error: this.aborted }
    if (this.terminationFailure) return { error: this.terminationFailure }
    if (this.infrastructureFailure) return { error: this.infrastructureFailure }
    if (!this.ready) {
      return {
        error: unavailable(
          `Project component runner exited before its handshake for ${this.request.relativeFile}.`,
        ),
      }
    }
    return { outcome: this.outcome(code, signal) }
  }

  private outcome(code: number | null, signal: NodeJS.Signals | null): EntryOutcome {
    if (this.timedOut) {
      return this.failure(
        'component-load-failed',
        `Timed out after ${this.request.deadlineMs} ms; the direct child was force-terminated and its close was observed.`,
      )
    }
    const { terminal } = this
    if (this.protocolFailure || this.terminalCount !== 1 || !terminal) {
      const ending = signal ? `signal ${signal}` : code === null ? 'without an exit status' : `exit ${code}`
      return this.failure(
        'component-load-failed',
        this.protocolFailure ?? `Child ended with ${ending} before one terminal payload.`,
      )
    }
    if (signal || code !== 0) {
      return this.failure(
        'component-load-failed',
        signal
          ? `Child exited with signal ${signal} after returning metadata.`
          : `Child exited with status ${code} after returning metadata.`,
      )
    }
    if (!terminal.ok) return this.failure(terminal.code, terminal.message)
    return { components: terminal.components }
  }

  private failure(code: ComponentLoadFailureCode, base: string): EntryOutcome {
    return {
      failure: {
        code,
        file: this.request.relativeFile,
        message: diagnosticMessage(base, this.stdout, this.stderr),
      },
    }
  }

  private acceptHandshake(message: unknown): void {
    const { request } = this
    if (!validReady(message)) {
      this.infrastructureFailure ??= unavailable(
        `Project component runner handshake is incompatible for ${request.relativeFile}.`,
      )
      this.forceTerminate()
      return
    }
    this.ready = true
    this.child.send(
      {
        kind: 'load-project-entry',
        version: PROJECT_COMPONENT_PROTOCOL_VERSION,
        token: this.token,
        projectPath: request.projectPath,
        entryFile: path.join(request.projectPath, request.relativeFile),
        relativeFile: request.relativeFile,
        fallbackEntries: request.fallbackEntries,
      },
      (error) => {
        if (!error) return
        this.infrastructureFailure ??= unavailable(
          `Cannot send a request to the project component runner for ${request.relativeFile}.`,
          error,
        )
        this.forceTerminate()
      },
    )
  }

  private acceptTerminal(message: unknown): void {
    const candidate = record(message)
    if (candidate?.kind === 'project-entry-result') this.terminalCount += 1
    if (this.terminalCount > 1) {
      this.protocolFailure = 'Runner sent more than one terminal message.'
      this.forceTerminate()
      return
    }
    const parsed = parseTerminal(message, this.token, this.request.relativeFile)
    if (!parsed) {
      this.protocolFailure = 'Runner returned a malformed or unbound terminal payload.'
      this.forceTerminate()
      return
    }
    this.terminal = parsed
  }

  private forceTerminate(): void {
    const { child } = this
    if (child.exitCode !== null || child.signalCode !== null) return
    try {
      if (!child.kill('SIGKILL')) {
        this.terminationFailure ??= new Error(
          `Could not force-terminate validation child ${child.pid ?? '(unknown pid)'}.`,
        )
      }
    } catch (error) {
      this.terminationFailure ??= error instanceof Error ? error : new Error(String(error))
    }
  }
}

const defaultLoader = new ProjectComponentLoader()

/**
 * Executes every direct Project component, role and state entry in its own
 * short-lived child. File-attributable failures remain result data.
 */
export function loadProjectComponents(
  projectPath: string,
  resolver?: PackageResolver,
  options?: ProjectComponentLoadOptions,
): Promise<ProjectComponentLoadResult> {
  return defaultLoader.load(projectPath, resolver, options)
}
