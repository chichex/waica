import type { ComponentClass, ParamSpec } from '@waica/engine'
import {
  execFile,
  fork,
  type ChildProcess,
  type ForkOptions,
} from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp } from 'node:fs/promises'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { KNOWN_ARCHETYPES } from './known-archetypes.js'
import type { PackageResolver } from './package-resolver.js'
import { directFiles } from './project-path.js'

export const PROJECT_COMPONENT_PROTOCOL_VERSION = 1
export const PROJECT_COMPONENT_DEADLINE_MS = 5_000
export const PROJECT_COMPONENT_DIAGNOSTIC_BYTES = 64 * 1_024

const MODULE_HOOKS_MIN_NODE = '22.15'
const REF_KINDS = new Set(['prefab', 'clip', 'action', 'stat'])
const FALLBACK_PACKAGE_DIRECTORIES: ReadonlyArray<readonly [string, string]> = [
  ['@waica/engine', 'engine'],
  ['@waica/behaviors', 'behaviors'],
  ...KNOWN_ARCHETYPES.map(({ packageName, directory }) => [packageName, directory] as const),
]
const execFileAsync = promisify(execFile)
let sourceFallbackEntries: Promise<Record<string, string>> | undefined

export type ComponentLoadFailureCode =
  | 'component-load-failed'
  | 'component-load-unsupported'

export interface ProjectComponentDescription {
  file: string
  /** Parent-created scheduling adapter; never a Project constructor. */
  Class: ComponentClass
  params: Record<string, ParamSpec>
  defaults: Record<string, unknown>
}

export interface ComponentLoadFailure {
  code: ComponentLoadFailureCode
  file: string
  message: string
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

interface ComponentParamRow {
  name: string
  ref: 'prefab' | 'clip' | 'action' | 'stat'
  hasOptions: boolean
  default?: string
}

interface ComponentRow {
  name: string
  file: string
  params: ComponentParamRow[]
  hasOnUpdate: boolean
  hasUpdateAfter: boolean
  updateAfter: string[]
}

interface SuccessTerminal {
  ok: true
  components: ComponentRow[]
}

interface FailureTerminal {
  ok: false
  code: ComponentLoadFailureCode
  message: string
}

type ParsedTerminal = SuccessTerminal | FailureTerminal

type EntryOutcome =
  | { components: ComponentRow[] }
  | { failure: ComponentLoadFailure }

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

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional])
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  )
}

function validReady(value: unknown): boolean {
  const candidate = record(value)
  return (
    candidate !== undefined &&
    exactKeys(candidate, ['kind', 'version']) &&
    candidate.kind === 'project-entry-ready' &&
    candidate.version === PROJECT_COMPONENT_PROTOCOL_VERSION
  )
}

function parseParam(value: unknown): ComponentParamRow | undefined {
  const candidate = record(value)
  if (
    !candidate ||
    !exactKeys(candidate, ['name', 'ref', 'hasOptions'], ['default']) ||
    typeof candidate.name !== 'string' ||
    candidate.name.length === 0 ||
    typeof candidate.ref !== 'string' ||
    !REF_KINDS.has(candidate.ref) ||
    typeof candidate.hasOptions !== 'boolean' ||
    (Object.hasOwn(candidate, 'default') && typeof candidate.default !== 'string')
  ) {
    return undefined
  }
  return {
    name: candidate.name,
    ref: candidate.ref as ComponentParamRow['ref'],
    hasOptions: candidate.hasOptions,
    ...(Object.hasOwn(candidate, 'default')
      ? { default: candidate.default as string }
      : {}),
  }
}

function parseComponent(value: unknown, expectedFile: string): ComponentRow | undefined {
  const candidate = record(value)
  if (
    !candidate ||
    !exactKeys(candidate, [
      'name',
      'file',
      'params',
      'hasOnUpdate',
      'hasUpdateAfter',
      'updateAfter',
    ]) ||
    typeof candidate.name !== 'string' ||
    candidate.name.length === 0 ||
    candidate.file !== expectedFile ||
    !Array.isArray(candidate.params) ||
    typeof candidate.hasOnUpdate !== 'boolean' ||
    typeof candidate.hasUpdateAfter !== 'boolean' ||
    !Array.isArray(candidate.updateAfter) ||
    candidate.updateAfter.some((target) => typeof target !== 'string') ||
    (!candidate.hasUpdateAfter && candidate.updateAfter.length > 0)
  ) {
    return undefined
  }
  const params = candidate.params.map(parseParam)
  if (params.some((param) => param === undefined)) return undefined
  return {
    name: candidate.name,
    file: expectedFile,
    params: params as ComponentParamRow[],
    hasOnUpdate: candidate.hasOnUpdate,
    hasUpdateAfter: candidate.hasUpdateAfter,
    updateAfter: [...(candidate.updateAfter as string[])],
  }
}

function parseTerminal(
  value: unknown,
  token: string,
  expectedFile: string,
): ParsedTerminal | undefined {
  const candidate = record(value)
  if (
    !candidate ||
    candidate.kind !== 'project-entry-result' ||
    candidate.version !== PROJECT_COMPONENT_PROTOCOL_VERSION ||
    candidate.token !== token ||
    typeof candidate.ok !== 'boolean'
  ) {
    return undefined
  }
  if (candidate.ok) {
    if (!exactKeys(candidate, ['kind', 'version', 'token', 'ok', 'components'])) {
      return undefined
    }
    if (!Array.isArray(candidate.components)) return undefined
    const components = candidate.components.map((row) => parseComponent(row, expectedFile))
    if (components.some((row) => row === undefined)) return undefined
    return { ok: true, components: components as ComponentRow[] }
  }
  if (
    !exactKeys(candidate, ['kind', 'version', 'token', 'ok', 'code', 'message']) ||
    (candidate.code !== 'component-load-failed' &&
      candidate.code !== 'component-load-unsupported') ||
    typeof candidate.message !== 'string'
  ) {
    return undefined
  }
  return {
    ok: false,
    code: candidate.code,
    message: candidate.message,
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
  if (row.hasOnUpdate) {
    Object.defineProperty(SchedulingAdapter.prototype, 'onUpdate', {
      value: () => undefined,
    })
  }
  return SchedulingAdapter as unknown as ComponentClass
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

function checkoutPackagesRoot(): string | undefined {
  const candidate = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  )
  return FALLBACK_PACKAGE_DIRECTORIES.every(([, directory]) =>
    existsSync(path.join(candidate, directory, 'package.json')),
  )
    ? candidate
    : undefined
}

async function compileSourceFallbacks(packagesRoot: string): Promise<Record<string, string>> {
  const repositoryRoot = path.dirname(packagesRoot)
  const requireFromLoader = nodeModule.createRequire(import.meta.url)
  const typescriptRoot = path.dirname(requireFromLoader.resolve('typescript/package.json'))
  const compiler = path.join(typescriptRoot, 'bin', 'tsc')
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'waica-mcp-fallback-'))
  try {
    await Promise.all(
      FALLBACK_PACKAGE_DIRECTORIES.map(async ([, directory]) => {
        const sourceRoot = path.join(packagesRoot, directory)
        const destinationRoot = path.join(outputRoot, directory)
        await mkdir(destinationRoot, { recursive: true })
        await Promise.all([
          execFileAsync(
            process.execPath,
            [
              compiler,
              '-p',
              path.join(sourceRoot, 'tsconfig.build.json'),
              '--outDir',
              path.join(destinationRoot, 'dist'),
              '--declaration',
              'false',
            ],
            { cwd: repositoryRoot },
          ),
          copyFile(
            path.join(sourceRoot, 'package.json'),
            path.join(destinationRoot, 'package.json'),
          ),
          ...(existsSync(path.join(sourceRoot, 'assets'))
            ? [
                cp(path.join(sourceRoot, 'assets'), path.join(destinationRoot, 'assets'), {
                  recursive: true,
                }),
              ]
            : []),
        ])
      }),
    )
    const entries: Record<string, string> = Object.fromEntries(
      FALLBACK_PACKAGE_DIRECTORIES.map(([specifier, directory]) => [
        specifier,
        path.join(outputRoot, directory, 'dist', 'index.js'),
      ]),
    )
    entries.three = nodeModule
      .createRequire(path.join(packagesRoot, 'engine', 'package.json'))
      .resolve('three')
    if (Object.values(entries).some((entry) => !existsSync(entry))) {
      throw new Error('TypeScript fallback compilation did not emit every package entry.')
    }
    process.once('exit', () => rmSync(outputRoot, { recursive: true, force: true }))
    return entries
  } catch (error) {
    rmSync(outputRoot, { recursive: true, force: true })
    throw error
  }
}

async function fallbackEntriesFor(runnerPath: string): Promise<Record<string, string>> {
  const packagesRoot = checkoutPackagesRoot()
  if (!packagesRoot) return {}
  const built: Record<string, string> = Object.fromEntries(
    FALLBACK_PACKAGE_DIRECTORIES.map(([specifier, directory]) => [
      specifier,
      path.join(packagesRoot, directory, 'dist', 'index.js'),
    ]),
  )
  built.three = nodeModule
    .createRequire(path.join(packagesRoot, 'engine', 'package.json'))
    .resolve('three')
  if (Object.values(built).every((entry) => existsSync(entry))) return built
  if (!runnerPath.endsWith('.ts')) return {}
  sourceFallbackEntries ??= compileSourceFallbacks(packagesRoot)
  return sourceFallbackEntries
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

  private runEntry(input: {
    projectPath: string
    relativeFile: string
    runnerPath: string
    deadlineMs: number
    fallbackEntries: Record<string, string>
    signal?: AbortSignal
  }): Promise<EntryOutcome> {
    const token = randomUUID()
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

    let stdout: Buffer = Buffer.alloc(0)
    let stderr: Buffer = Buffer.alloc(0)
    let ready = false
    let terminalCount = 0
    let terminal: ParsedTerminal | undefined
    let protocolFailure: string | undefined
    let infrastructureFailure: ProjectComponentRunnerUnavailableError | undefined
    let timeout = false
    let aborted: unknown
    let terminationFailure: Error | undefined
    let closeObservedResolve!: () => void
    const closeObserved = new Promise<void>((resolve) => {
      closeObservedResolve = resolve
    })

    const forceTerminate = (): void => {
      if (child.exitCode !== null || child.signalCode !== null) return
      try {
        if (!child.kill('SIGKILL')) {
          terminationFailure ??= new Error(
            `Could not force-terminate validation child ${child.pid ?? '(unknown pid)'}.`,
          )
        }
      } catch (error) {
        terminationFailure ??= error instanceof Error ? error : new Error(String(error))
      }
    }

    const execution: ActiveExecution = {
      terminate: async (reason) => {
        aborted ??= reason
        forceTerminate()
        await closeObserved
        if (terminationFailure) throw terminationFailure
      },
    }
    this.active.add(execution)

    return new Promise<EntryOutcome>((resolve, reject) => {
      const clear = (): void => {
        clearTimeout(timer)
        input.signal?.removeEventListener('abort', onAbort)
        this.active.delete(execution)
        closeObservedResolve()
      }
      const onAbort = (): void => {
        aborted ??= cancellationReason(input.signal!)
        forceTerminate()
      }
      if (input.signal) input.signal.addEventListener('abort', onAbort, { once: true })

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout = appendTail(stdout, chunk)
      })
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr = appendTail(stderr, chunk)
      })
      child.on('error', (error) => {
        infrastructureFailure ??= unavailable(
          `Project component runner failed to launch for ${input.relativeFile}.`,
          error,
        )
        forceTerminate()
      })
      child.on('message', (message) => {
        if (!ready) {
          if (!validReady(message)) {
            infrastructureFailure ??= unavailable(
              `Project component runner handshake is incompatible for ${input.relativeFile}.`,
            )
            forceTerminate()
            return
          }
          ready = true
          child.send(
            {
              kind: 'load-project-entry',
              version: PROJECT_COMPONENT_PROTOCOL_VERSION,
              token,
              projectPath: input.projectPath,
              entryFile: path.join(input.projectPath, input.relativeFile),
              relativeFile: input.relativeFile,
              fallbackEntries: input.fallbackEntries,
            },
            (error) => {
              if (!error) return
              infrastructureFailure ??= unavailable(
                `Cannot send a request to the project component runner for ${input.relativeFile}.`,
                error,
              )
              forceTerminate()
            },
          )
          return
        }

        const candidate = record(message)
        if (candidate?.kind === 'project-entry-result') terminalCount += 1
        if (terminalCount > 1) {
          protocolFailure = 'Runner sent more than one terminal message.'
          forceTerminate()
          return
        }
        const parsed = parseTerminal(message, token, input.relativeFile)
        if (!parsed) {
          protocolFailure = 'Runner returned a malformed or unbound terminal payload.'
          forceTerminate()
          return
        }
        terminal = parsed
      })
      child.once('close', (code, signal) => {
        clear()
        if (aborted !== undefined) {
          reject(aborted)
          return
        }
        if (terminationFailure) {
          reject(terminationFailure)
          return
        }
        if (infrastructureFailure) {
          reject(infrastructureFailure)
          return
        }
        if (!ready) {
          reject(
            unavailable(
              `Project component runner exited before its handshake for ${input.relativeFile}.`,
            ),
          )
          return
        }
        if (timeout) {
          resolve({
            failure: {
              code: 'component-load-failed',
              file: input.relativeFile,
              message: diagnosticMessage(
                `Timed out after ${input.deadlineMs} ms; the direct child was force-terminated and its close was observed.`,
                stdout,
                stderr,
              ),
            },
          })
          return
        }
        if (protocolFailure || terminalCount !== 1 || !terminal) {
          const outcome = signal
            ? `signal ${signal}`
            : code === null
              ? 'without an exit status'
              : `exit ${code}`
          resolve({
            failure: {
              code: 'component-load-failed',
              file: input.relativeFile,
              message: diagnosticMessage(
                protocolFailure ?? `Child ended with ${outcome} before one terminal payload.`,
                stdout,
                stderr,
              ),
            },
          })
          return
        }
        if (signal || code !== 0) {
          resolve({
            failure: {
              code: 'component-load-failed',
              file: input.relativeFile,
              message: diagnosticMessage(
                signal
                  ? `Child exited with signal ${signal} after returning metadata.`
                  : `Child exited with status ${code} after returning metadata.`,
                stdout,
                stderr,
              ),
            },
          })
          return
        }
        if (!terminal.ok) {
          resolve({
            failure: {
              code: terminal.code,
              file: input.relativeFile,
              message: diagnosticMessage(terminal.message, stdout, stderr),
            },
          })
          return
        }
        resolve({ components: terminal.components })
      })

      const timer = setTimeout(() => {
        if (!ready) {
          infrastructureFailure ??= unavailable(
            `Project component runner did not complete its handshake within ${input.deadlineMs} ms for ${input.relativeFile}.`,
          )
        } else {
          timeout = true
        }
        forceTerminate()
      }, input.deadlineMs)
    })
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
