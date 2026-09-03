import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { startRuntimeBrowser } from './runtime-browser.js'
import { startRuntimeDevServer } from './runtime-dev-server.js'
import {
  preflightRuntimeProject,
  type RuntimePreflightResult,
} from './runtime-preflight.js'
import {
  RuntimeToolError,
  type RuntimeControlInput,
  type RuntimeInspectInput,
  type RuntimeScreenshotResult,
  type RuntimeService,
  type StartRuntimeInput,
} from './runtime-service.js'

export interface RuntimeBridgeReady {
  engineVersion: string
  bridgeVersion: number
  mode: 'paused' | 'real-time'
  frame: number
  simulationTime: number
  /** [] for a pre-CA-10 engine build that never reports this field. */
  capabilities: readonly string[]
  initialSnapshot: Record<string, unknown>
}

export interface RuntimeBridgeMetadata {
  engineVersion: string
  bridgeVersion: number
  mode: 'paused' | 'real-time'
  frame: number
  simulationTime: number
  [key: string]: unknown
}

export interface RuntimeDevServer {
  readonly url: string
  stop(): Promise<void>
  diagnostics(): Record<string, unknown>
  setExitHandler?(handler: (detail: Record<string, unknown>) => void): void
}

export interface RuntimeLifecycleHandlers {
  reloading(): void
  reloaded(ready: RuntimeBridgeReady): void
  failed(error: unknown): void
}

export interface RuntimeBrowser {
  ready(): Promise<RuntimeBridgeReady>
  inspect(filters: Omit<RuntimeInspectInput, 'projectPath'>): Promise<Record<string, unknown>>
  control(request: Omit<RuntimeControlInput, 'projectPath'>): Promise<Record<string, unknown>>
  captureScreenshot(): Promise<Record<string, unknown> & { data: string }>
  close(): Promise<void>
  setLifecycleHandlers(handlers: RuntimeLifecycleHandlers): void
}

export interface RuntimeSessionAdapters {
  canonicalize(projectPath: string): Promise<string>
  preflight(input: StartRuntimeInput): Promise<RuntimePreflightResult>
  startDevServer(preflight: RuntimePreflightResult): Promise<RuntimeDevServer>
  startBrowser(
    preflight: RuntimePreflightResult,
    devServer: RuntimeDevServer,
  ): Promise<RuntimeBrowser>
}

export interface StartProjectResult extends Record<string, unknown> {
  projectPath: string
  url: string
  reused: boolean
  viewport: { width: number; height: number }
  engineVersion: string
  bridgeVersion: number
  mode: 'paused' | 'real-time'
  frame: number
  simulationTime: number
  provenance: Array<{ package: '@waica/engine'; version: string; source: 'project' }>
  initialSnapshot: Record<string, unknown>
}

interface RuntimeSession {
  readonly preflight: RuntimePreflightResult
  readonly devServer: RuntimeDevServer
  readonly browser: RuntimeBrowser
  state: 'active' | 'reloading' | 'stopping' | 'stopped'
  ready: RuntimeBridgeReady
  cleanup?: Promise<void>
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class RuntimeSessionManager implements RuntimeService {
  private readonly sessions = new Map<string, RuntimeSession>()
  private readonly starts = new Map<string, Promise<RuntimeSession>>()
  private closing = false

  constructor(private readonly adapters: RuntimeSessionAdapters) {}

  async start(input: StartRuntimeInput): Promise<StartProjectResult> {
    if (this.closing) {
      throw new RuntimeToolError({
        code: 'runtime-invalid-state',
        stage: 'cleanup',
        message: 'The MCP server is closing and cannot start another Run Session.',
        projectPath: input.projectPath,
      })
    }
    const canonical = await this.adapters.canonicalize(input.projectPath)
    const current = this.sessions.get(canonical)
    if (current) {
      if (current.state !== 'active') {
        throw new RuntimeToolError({
          code: 'runtime-invalid-state',
          stage: 'game',
          message: `The Run Session is ${current.state}; retry after it is active.`,
          projectPath: canonical,
        })
      }
      return this.startResult(current, true)
    }
    const concurrent = this.starts.get(canonical)
    if (concurrent) return this.startResult(await concurrent, true)

    const creation = this.createCheckedSession({ ...input, projectPath: canonical })
    this.starts.set(canonical, creation)
    try {
      const session = await creation
      this.sessions.set(canonical, session)
      return this.startResult(session, false)
    } finally {
      this.starts.delete(canonical)
    }
  }

  async stop(projectPath: string): Promise<Record<string, unknown>> {
    const canonical = await this.adapters.canonicalize(projectPath)
    const starting = this.starts.get(canonical)
    if (starting) await starting.catch(() => {})
    const session = this.sessions.get(canonical)
    if (!session) return { projectPath: canonical, stopped: false }
    try {
      await this.cleanupSession(session)
    } finally {
      this.sessions.delete(canonical)
    }
    return { projectPath: canonical, stopped: true }
  }

  async inspect(input: RuntimeInspectInput): Promise<Record<string, unknown>> {
    const session = await this.requireSession(input.projectPath)
    const inspected = await session.browser.inspect({
      ...(input.entityIds ? { entityIds: input.entityIds } : {}),
      ...(input.entityNames ? { entityNames: input.entityNames } : {}),
      ...(input.componentTypes ? { componentTypes: input.componentTypes } : {}),
    })
    return {
      ...this.sharedMetadata(session, inspected),
      snapshot: (inspected.snapshot as Record<string, unknown> | undefined) ?? inspected,
    }
  }

  async control(input: RuntimeControlInput): Promise<Record<string, unknown>> {
    const session = await this.requireSession(input.projectPath)
    if (input.operation === 'click' && !session.ready.capabilities.includes('click')) {
      throw new RuntimeToolError({
        code: 'runtime-incompatible',
        stage: 'control',
        message:
          "This Project's @waica/engine build does not support pointer input " +
          "(control_runtime operation:'click'); upgrade @waica/engine to a version " +
          'that ships the click Runtime Bridge operation.',
        projectPath: session.preflight.projectPath,
        diagnostics: { engineVersion: session.ready.engineVersion },
      })
    }
    if (input.operation === 'scene' && !session.ready.capabilities.includes('scene')) {
      throw new RuntimeToolError({
        code: 'runtime-incompatible',
        stage: 'control',
        message:
          "This Project's @waica/engine build does not support scene loading " +
          "(control_runtime operation:'scene'); upgrade @waica/engine to a version " +
          'that ships the scene Runtime Bridge operation.',
        projectPath: session.preflight.projectPath,
        diagnostics: { engineVersion: session.ready.engineVersion },
      })
    }
    const { projectPath: _projectPath, ...request } = input
    const controlled = await session.browser.control(request)
    return { ...this.sharedMetadata(session, controlled), heldActions: controlled.heldActions ?? [] }
  }

  async captureScreenshot(projectPath: string): Promise<RuntimeScreenshotResult> {
    const session = await this.requireSession(projectPath)
    const screenshot = await session.browser.captureScreenshot()
    const { data, ...metadata } = screenshot
    return { metadata: this.sharedMetadata(session, metadata), data }
  }

  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    await Promise.allSettled([...this.starts.values()])
    const sessions = [...this.sessions.values()]
    const results = await Promise.allSettled(sessions.map((session) => this.cleanupSession(session)))
    this.sessions.clear()
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failed) throw failed.reason
  }

  private async createCheckedSession(input: StartRuntimeInput): Promise<RuntimeSession> {
    const preflight = await this.adapters.preflight(input)
    return this.createSession(preflight)
  }

  private async createSession(preflight: RuntimePreflightResult): Promise<RuntimeSession> {
    let devServer: RuntimeDevServer | undefined
    let browser: RuntimeBrowser | undefined
    try {
      devServer = await this.adapters.startDevServer(preflight)
      browser = await this.adapters.startBrowser(preflight, devServer)
      const ready = await browser.ready()
      if (ready.bridgeVersion !== 1) {
        throw new RuntimeToolError({
          code: 'runtime-incompatible',
          stage: 'bridge',
          message: `The Project engine does not provide Runtime Bridge protocol 1; upgrade @waica/engine to at least ${preflight.engine.version}.`,
          projectPath: preflight.projectPath,
          diagnostics: { minimumEngineVersion: preflight.engine.version },
        })
      }
      const session: RuntimeSession = {
        preflight,
        devServer,
        browser,
        state: 'active',
        ready,
      }
      devServer.setExitHandler?.((detail) => {
        void this.failSession(session, new Error(`Project dev process exited: ${JSON.stringify(detail)}`))
      })
      browser.setLifecycleHandlers({
        reloading: () => {
          if (session.state === 'active') session.state = 'reloading'
        },
        reloaded: (nextReady) => {
          if (session.state !== 'stopped') {
            session.ready = nextReady
            session.state = 'active'
          }
        },
        failed: (error) => {
          void this.failSession(session, error)
        },
      })
      return session
    } catch (error) {
      await browser?.close().catch(() => {})
      await devServer?.stop().catch(() => {})
      if (error instanceof RuntimeToolError) throw error
      throw new RuntimeToolError({
        code: 'runtime-start-failed',
        stage: browser ? 'bridge' : devServer ? 'browser' : 'dev-server',
        message: message(error),
        projectPath: preflight.projectPath,
        diagnostics: devServer?.diagnostics(),
      })
    }
  }

  private async startResult(
    session: RuntimeSession,
    reused: boolean,
  ): Promise<StartProjectResult> {
    const { preflight, devServer, ready } = session
    const current = reused ? await session.browser.inspect({}) : ready
    return {
      projectPath: preflight.projectPath,
      url: devServer.url,
      reused,
      viewport: preflight.viewport,
      engineVersion: String(current.engineVersion ?? ready.engineVersion),
      bridgeVersion: Number(current.bridgeVersion ?? ready.bridgeVersion),
      mode: (current.mode ?? ready.mode) as 'paused' | 'real-time',
      frame: Number(current.frame ?? ready.frame),
      simulationTime: Number(current.simulationTime ?? ready.simulationTime),
      provenance: [preflight.engine],
      initialSnapshot: ready.initialSnapshot,
    }
  }

  private sharedMetadata(
    session: RuntimeSession,
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      projectPath: session.preflight.projectPath,
      url: session.devServer.url,
      engineVersion: value.engineVersion ?? session.ready.engineVersion,
      bridgeVersion: value.bridgeVersion ?? session.ready.bridgeVersion,
      mode: value.mode ?? session.ready.mode,
      frame: value.frame ?? session.ready.frame,
      simulationTime: value.simulationTime ?? session.ready.simulationTime,
      provenance: [session.preflight.engine],
    }
  }

  private async requireSession(projectPath: string): Promise<RuntimeSession> {
    const canonical = await this.adapters.canonicalize(projectPath)
    const session = this.sessions.get(canonical)
    if (!session) {
      throw new RuntimeToolError({
        code: 'runtime-not-running',
        stage: 'game',
        message: 'No Run Session is active for this Project.',
        projectPath: canonical,
      })
    }
    if (session.state !== 'active') {
      throw new RuntimeToolError({
        code: 'runtime-invalid-state',
        stage: 'game',
        message: `The Run Session is ${session.state}; retry after it is active.`,
        projectPath: canonical,
      })
    }
    return session
  }

  private cleanupSession(session: RuntimeSession): Promise<void> {
    session.cleanup ??= this.performCleanup(session)
    return session.cleanup
  }

  private async performCleanup(session: RuntimeSession): Promise<void> {
    if (session.state === 'stopped') return
    session.state = 'stopping'
    const failures: string[] = []
    await session.browser.close().catch((error) => failures.push(`browser: ${message(error)}`))
    await session.devServer.stop().catch((error) => failures.push(`dev-server: ${message(error)}`))
    session.state = 'stopped'
    if (failures.length > 0) {
      throw new RuntimeToolError({
        code: 'runtime-operation-failed',
        stage: 'cleanup',
        message: `Could not prove Run Session cleanup: ${failures.join('; ')}`,
        projectPath: session.preflight.projectPath,
        diagnostics: { failures, ...session.devServer.diagnostics() },
      })
    }
  }

  private async failSession(session: RuntimeSession, _error: unknown): Promise<void> {
    this.sessions.delete(session.preflight.projectPath)
    await this.cleanupSession(session).catch(() => {})
  }
}

export function createDefaultRuntimeSessionManager(): RuntimeSessionManager {
  return new RuntimeSessionManager({
    canonicalize: async (projectPath) => {
      try {
        return await realpath(projectPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path.resolve(projectPath)
        throw new RuntimeToolError({
          code: 'runtime-prerequisite-missing',
          stage: 'project',
          message: `Project path is not accessible: ${message(error)}`,
          projectPath,
        })
      }
    },
    preflight: preflightRuntimeProject,
    startDevServer: startRuntimeDevServer,
    startBrowser: startRuntimeBrowser,
  })
}
