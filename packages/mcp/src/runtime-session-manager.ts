import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { runtimeAssetStatus, waitForAssetsReady, type RuntimeAssetStatus } from './runtime-assets.js'
import { startRuntimeBrowser } from './runtime-browser.js'
import { startRuntimeDevServer } from './runtime-dev-server.js'
import {
  preflightRuntimeProject,
  type RuntimePreflightResult,
} from './runtime-preflight.js'
import {
  RuntimeToolError,
  type RuntimeCallOptions,
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
  /** `game.assets.status` at readiness; absent for an engine without the 'assets' capability. */
  assets?: RuntimeAssetStatus
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
  /** The bridge's metadata alone — what the Assets Ready wait polls (ADR 0019). */
  metadata(): Promise<Record<string, unknown>>
  inspect(filters: Omit<RuntimeInspectInput, 'projectPath'>): Promise<Record<string, unknown>>
  control(request: Omit<RuntimeControlInput, 'projectPath'>): Promise<Record<string, unknown>>
  /** The PNG plus the bridge metadata read right before it, in one round trip. */
  captureScreenshot(): Promise<Record<string, unknown> & { data: string }>
  close(): Promise<void>
  setLifecycleHandlers(handlers: RuntimeLifecycleHandlers): void
}

export interface RuntimeSessionAdapters {
  canonicalize(projectPath: string): Promise<string>
  preflight(input: StartRuntimeInput): Promise<RuntimePreflightResult>
  /** `signal` cancels the start; the adapter must release what it spawned. */
  startDevServer(
    preflight: RuntimePreflightResult,
    signal?: AbortSignal,
  ): Promise<RuntimeDevServer>
  startBrowser(
    preflight: RuntimePreflightResult,
    devServer: RuntimeDevServer,
    signal?: AbortSignal,
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
  /** Present when the engine reports the 'assets' capability: settled at readiness (`pending` 0). */
  assets?: RuntimeAssetStatus
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

interface PendingStart {
  readonly promise: Promise<RuntimeSession>
  readonly controller: AbortController
  waiters: number
}

/** Stands in for an absent caller signal, so every check is unconditional. */
const NEVER_ABORTED = new AbortController().signal

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function waitsForAssets(session: RuntimeSession): boolean {
  return session.ready.capabilities.includes('assets')
}

export class RuntimeSessionManager implements RuntimeService {
  private readonly sessions = new Map<string, RuntimeSession>()
  private readonly starts = new Map<string, PendingStart>()
  private closing = false

  constructor(private readonly adapters: RuntimeSessionAdapters) {}

  async start(
    input: StartRuntimeInput,
    { signal = NEVER_ABORTED }: RuntimeCallOptions = {},
  ): Promise<StartProjectResult> {
    signal.throwIfAborted()
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
    if (concurrent) return this.startResult(await this.waitForStart(concurrent, signal), true)

    const pending = this.beginStart(canonical, { ...input, projectPath: canonical })
    return this.startResult(await this.waitForStart(pending, signal), false)
  }

  /**
   * The startup belongs to no single caller: it is aborted through its own
   * controller, and only once the last caller waiting on it has cancelled.
   */
  private beginStart(canonical: string, input: StartRuntimeInput): PendingStart {
    const controller = new AbortController()
    const promise = this.createCheckedSession(input, controller.signal).then(
      (session) => {
        this.sessions.set(canonical, session)
        this.starts.delete(canonical)
        return session
      },
      (error: unknown) => {
        this.starts.delete(canonical)
        throw error
      },
    )
    const pending: PendingStart = { promise, controller, waiters: 0 }
    this.starts.set(canonical, pending)
    return pending
  }

  /**
   * A caller's abort abandons only that caller's wait. The last waiter to
   * abort cancels the startup itself, which then rejects with that reason
   * after releasing what it spawned.
   */
  private waitForStart(pending: PendingStart, signal: AbortSignal): Promise<RuntimeSession> {
    pending.waiters += 1
    return new Promise<RuntimeSession>((resolve, reject) => {
      let waiting = true
      const leave = (): boolean => {
        if (!waiting) return false
        waiting = false
        signal.removeEventListener('abort', onAbort)
        pending.waiters -= 1
        return true
      }
      const onAbort = (): void => {
        leave()
        if (pending.waiters === 0) pending.controller.abort(signal.reason)
        else reject(signal.reason)
      }
      pending.promise.then(
        (session) => {
          if (leave()) resolve(session)
        },
        (error: unknown) => {
          leave()
          reject(error)
        },
      )
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
  }

  async stop(projectPath: string): Promise<Record<string, unknown>> {
    const canonical = await this.adapters.canonicalize(projectPath)
    const starting = this.starts.get(canonical)
    if (starting) await starting.promise.catch(() => {})
    const session = this.sessions.get(canonical)
    if (!session) return { projectPath: canonical, stopped: false }
    try {
      await this.cleanupSession(session)
    } finally {
      this.sessions.delete(canonical)
    }
    return { projectPath: canonical, stopped: true }
  }

  async inspect(
    input: RuntimeInspectInput,
    { signal = NEVER_ABORTED }: RuntimeCallOptions = {},
  ): Promise<Record<string, unknown>> {
    const session = await this.requireSession(input.projectPath)
    signal.throwIfAborted()
    const inspected = await session.browser.inspect({
      ...(input.entityIds ? { entityIds: input.entityIds } : {}),
      ...(input.entityNames ? { entityNames: input.entityNames } : {}),
      ...(input.componentTypes ? { componentTypes: input.componentTypes } : {}),
    })
    signal.throwIfAborted()
    return {
      ...this.sharedMetadata(session, inspected),
      snapshot: (inspected.snapshot as Record<string, unknown> | undefined) ?? inspected,
    }
  }

  async control(
    input: RuntimeControlInput,
    { signal = NEVER_ABORTED }: RuntimeCallOptions = {},
  ): Promise<Record<string, unknown>> {
    const session = await this.requireSession(input.projectPath)
    signal.throwIfAborted()
    this.assertControlSupported(session, input)
    const { projectPath: _projectPath, ...request } = input
    let controlled = await session.browser.control(request)
    signal.throwIfAborted()
    if (input.operation === 'scene' && waitsForAssets(session)) {
      // The swap spawned synchronously; its art is still arriving. Wait for
      // Assets Ready before answering, so the result's numbers are settled.
      const wait = await waitForAssetsReady(
        () => session.browser.metadata(),
        session.preflight.timeoutMs,
        signal,
      )
      if (!wait.ok) {
        throw new RuntimeToolError({
          code: 'runtime-operation-failed',
          stage: 'control',
          message: `Scene "${input.scene}" loaded, but its assets did not settle within ${session.preflight.timeoutMs} ms.`,
          projectPath: session.preflight.projectPath,
          diagnostics: { assets: wait.assets },
        })
      }
      controlled = { ...controlled, ...wait.metadata }
    }
    return { ...this.sharedMetadata(session, controlled), heldActions: controlled.heldActions ?? [] }
  }

  async captureScreenshot(
    projectPath: string,
    { signal = NEVER_ABORTED }: RuntimeCallOptions = {},
  ): Promise<RuntimeScreenshotResult> {
    const session = await this.requireSession(projectPath)
    signal.throwIfAborted()
    // The capture reads the bridge once, right before its PNG, so a settled
    // session pays one round trip per screenshot. Only when that read shows
    // art still arriving does the session wait for Assets Ready and capture
    // again — a structured failure rather than a half-textured capture
    // (ADR 0019).
    let screenshot = await session.browser.captureScreenshot()
    signal.throwIfAborted()
    if (waitsForAssets(session) && (runtimeAssetStatus(screenshot.assets)?.pending ?? 0) > 0) {
      const wait = await waitForAssetsReady(
        () => session.browser.metadata(),
        session.preflight.timeoutMs,
        signal,
      )
      if (!wait.ok) {
        throw new RuntimeToolError({
          code: 'runtime-operation-failed',
          stage: 'game',
          message: `The Game's assets did not settle within ${session.preflight.timeoutMs} ms; not capturing a half-textured screenshot.`,
          projectPath: session.preflight.projectPath,
          diagnostics: { assets: wait.assets },
        })
      }
      screenshot = await session.browser.captureScreenshot()
      signal.throwIfAborted()
    }
    const { data, ...metadata } = screenshot
    return { metadata: this.sharedMetadata(session, metadata), data }
  }

  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    await Promise.allSettled([...this.starts.values()].map((pending) => pending.promise))
    const sessions = [...this.sessions.values()]
    const results = await Promise.allSettled(sessions.map((session) => this.cleanupSession(session)))
    this.sessions.clear()
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failed) throw failed.reason
  }

  /** Refuses an operation the Project's engine build cannot run. */
  private assertControlSupported(session: RuntimeSession, input: RuntimeControlInput): void {
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
  }

  private async createCheckedSession(
    input: StartRuntimeInput,
    signal: AbortSignal,
  ): Promise<RuntimeSession> {
    const preflight = await this.adapters.preflight(input)
    signal.throwIfAborted()
    return this.createSession(preflight, signal)
  }

  /**
   * Starts the dev server, browser and bridge. The signal is checked after
   * every stage and handed to both adapters; an abort closes whatever already
   * started and rejects with the signal's reason, so no session is kept.
   */
  private async createSession(
    preflight: RuntimePreflightResult,
    signal: AbortSignal,
  ): Promise<RuntimeSession> {
    let devServer: RuntimeDevServer | undefined
    let browser: RuntimeBrowser | undefined
    try {
      devServer = await this.adapters.startDevServer(preflight, signal)
      signal.throwIfAborted()
      browser = await this.adapters.startBrowser(preflight, devServer, signal)
      signal.throwIfAborted()
      const ready = await bridgeReadiness(preflight, { devServer, browser }, signal)
      const session: RuntimeSession = {
        preflight,
        devServer,
        browser,
        state: 'active',
        ready,
      }
      this.watchSessionLifecycle(session)
      return session
    } catch (error) {
      await browser?.close().catch(() => {})
      await devServer?.stop().catch(() => {})
      signal.throwIfAborted()
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

  /** Tracks reloads and fails the session when its dev server or page dies. */
  private watchSessionLifecycle(session: RuntimeSession): void {
    session.devServer.setExitHandler?.(() => {
      this.failSession(session)
    })
    session.browser.setLifecycleHandlers({
      reloading: () => {
        if (session.state === 'active') session.state = 'reloading'
      },
      reloaded: (nextReady) => {
        if (session.state !== 'stopped') {
          session.ready = nextReady
          session.state = 'active'
        }
      },
      failed: () => {
        this.failSession(session)
      },
    })
  }

  private async startResult(
    session: RuntimeSession,
    reused: boolean,
  ): Promise<StartProjectResult> {
    const { preflight, devServer, ready } = session
    const current = reused ? await session.browser.inspect({}) : ready
    const assets = runtimeAssetStatus(current.assets) ?? ready.assets
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
      ...(assets ? { assets } : {}),
      initialSnapshot: ready.initialSnapshot,
    }
  }

  private sharedMetadata(
    session: RuntimeSession,
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    // Passed through only when the bridge reported it (ADR 0019): an older
    // engine's results keep exactly their pre-assets shape.
    const assets = runtimeAssetStatus(value.assets) ?? session.ready.assets
    return {
      projectPath: session.preflight.projectPath,
      url: session.devServer.url,
      engineVersion: value.engineVersion ?? session.ready.engineVersion,
      bridgeVersion: value.bridgeVersion ?? session.ready.bridgeVersion,
      mode: value.mode ?? session.ready.mode,
      frame: value.frame ?? session.ready.frame,
      simulationTime: value.simulationTime ?? session.ready.simulationTime,
      provenance: [session.preflight.engine],
      ...(assets ? { assets } : {}),
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

  /**
   * Drops a session whose dev process or page died. Its cleanup runs in the
   * background; a cleanup failure is already folded into the session's own
   * cleanup promise, so nothing is left unobserved here.
   */
  private failSession(session: RuntimeSession): void {
    this.sessions.delete(session.preflight.projectPath)
    this.cleanupSession(session).catch(() => {})
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
    startDevServer: (preflight, signal) => startRuntimeDevServer(preflight, signal ? { signal } : {}),
    startBrowser: startRuntimeBrowser,
  })
}

/**
 * The page's Runtime Bridge readiness: protocol 1 required, and — when the
 * engine reports asset status — Assets Ready too (ADR 0019): the Game
 * registered at frame 0, and its scene's images still have to arrive.
 */
async function bridgeReadiness(
  preflight: RuntimePreflightResult,
  started: { devServer: RuntimeDevServer; browser: RuntimeBrowser },
  signal: AbortSignal,
): Promise<RuntimeSession['ready']> {
  const { devServer, browser } = started
  const ready = await browser.ready()
  signal.throwIfAborted()
  if (ready.bridgeVersion !== 1) {
    throw new RuntimeToolError({
      code: 'runtime-incompatible',
      stage: 'bridge',
      message: `The Project engine does not provide Runtime Bridge protocol 1; upgrade @waica/engine to at least ${preflight.engine.version}.`,
      projectPath: preflight.projectPath,
      diagnostics: { minimumEngineVersion: preflight.engine.version },
    })
  }
  if (!ready.capabilities.includes('assets')) return ready
  const wait = await waitForAssetsReady(() => browser.metadata(), preflight.timeoutMs, signal)
  if (!wait.ok) {
    throw new RuntimeToolError({
      code: 'runtime-start-failed',
      stage: 'game',
      message: `The Game registered, but its assets did not settle within ${preflight.timeoutMs} ms.`,
      projectPath: preflight.projectPath,
      diagnostics: { ...devServer.diagnostics(), assets: wait.assets },
    })
  }
  const assets = runtimeAssetStatus(wait.metadata.assets)
  return assets ? { ...ready, assets } : ready
}
