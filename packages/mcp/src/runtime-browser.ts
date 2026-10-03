import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright-core'
import type {
  RuntimeBridgeReady,
  RuntimeBrowser,
  RuntimeDevServer,
  RuntimeLifecycleHandlers,
} from './runtime-session-manager.js'
import type { RuntimePreflightResult } from './runtime-preflight.js'
import {
  awaitRuntimeReadiness,
  boundedMessage,
  runtimeError,
  type BrowserDiagnostics,
  type PageBridgeMetadata,
  type ReadinessProbe,
} from './runtime-readiness.js'
import { RuntimeToolError, type RuntimeControlInput } from './runtime-service.js'

export const RUNTIME_BRIDGE_SYMBOL_KEY = '@waica/runtime-bridge/v1'

export interface BrowserBridgeFailure {
  code: 'multiple-games' | 'render-backend-failed'
  message: string
}

export interface BrowserBridgeActivation {
  readonly protocolVersion: 1
  current: unknown | null
  failure: BrowserBridgeFailure | null
  register(bridge: unknown): void
  unregister(bridge: unknown): void
  /** The Game's renderer could not initialize (ADR 0025): the Run Session stops waiting. */
  fail(failure: BrowserBridgeFailure): void
}

/** Serialized by Playwright and installed before any Project module executes. */
export function installRuntimeBridgeActivation(): void {
  const key = Symbol.for('@waica/runtime-bridge/v1')
  const activation: BrowserBridgeActivation = {
    protocolVersion: 1,
    current: null,
    failure: null,
    register(bridge: unknown): void {
      if (this.current && this.current !== bridge) {
        this.failure = {
          code: 'multiple-games',
          message: 'Exactly one live Game may register with a Run Session.',
        }
        return
      }
      this.current = bridge
    },
    unregister(bridge: unknown): void {
      if (this.current === bridge) this.current = null
    },
    fail(failure: BrowserBridgeFailure): void {
      this.failure ??= { code: failure.code, message: String(failure.message) }
    },
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: activation,
  })
}

type BridgeOperation = 'inspect' | 'control' | 'metadata'

/** What the page reports for one Runtime Bridge call, as JSON-safe data. */
interface BridgeResponse {
  ok: boolean
  value?: Record<string, unknown>
  error?: {
    code: string
    stage: string
    message: string
    availableActions?: unknown[]
    availableScenes?: unknown[]
  }
}

/**
 * Serialized by Playwright and run inside the Project page: calls the live
 * Game's Runtime Bridge and turns a thrown bridge error into data. It must
 * reference nothing outside its own body.
 */
function callLiveBridge(request: {
  operation: BridgeOperation
  argument: Record<string, unknown>
}): BridgeResponse {
  type Bridge = {
    metadata(): Record<string, unknown>
    inspect(filters?: Record<string, unknown>): Record<string, unknown>
    control(request: Record<string, unknown>): Record<string, unknown>
  }
  const { operation, argument } = request
  const hook = (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for('@waica/runtime-bridge/v1')
  ] as BrowserBridgeActivation | undefined
  if (!hook?.current || hook.failure) {
    return {
      ok: false,
      error: {
        code: 'runtime-invalid-state',
        stage: 'game',
        message: hook?.failure?.message ?? 'No live Game is registered.',
      },
    }
  }
  try {
    const bridge = hook.current as Bridge
    const value = operation === 'inspect'
      ? bridge.inspect(argument)
      : operation === 'control'
        ? bridge.control(argument)
        : bridge.metadata()
    return { ok: true, value }
  } catch (error) {
    const detail = error as {
      code?: unknown
      stage?: unknown
      message?: unknown
      availableActions?: unknown
      availableScenes?: unknown
    }
    return {
      ok: false,
      error: {
        code: typeof detail.code === 'string' ? detail.code : 'runtime-operation-failed',
        stage: typeof detail.stage === 'string' ? detail.stage : 'control',
        message: typeof detail.message === 'string' ? detail.message : String(error),
        ...(Array.isArray(detail.availableActions)
          ? { availableActions: detail.availableActions }
          : {}),
        ...(Array.isArray(detail.availableScenes)
          ? { availableScenes: detail.availableScenes }
          : {}),
      },
    }
  }
}

async function readinessProbe(page: Page): Promise<ReadinessProbe> {
  return page.evaluate(() => {
    type Bridge = {
      metadata(): PageBridgeMetadata
      inspect(filters?: Record<string, unknown>): Record<string, unknown>
    }
    const hook = (globalThis as Record<PropertyKey, unknown>)[
      Symbol.for('@waica/runtime-bridge/v1')
    ] as BrowserBridgeActivation | undefined
    if (hook?.failure) {
      return { status: 'failure', code: hook.failure.code, message: hook.failure.message } as const
    }
    if (!hook?.current) return { status: 'waiting' } as const
    try {
      const bridge = hook.current as Bridge
      return {
        status: 'ready',
        metadata: bridge.metadata(),
        initialSnapshot: bridge.inspect(),
      } as const
    } catch (error) {
      return {
        status: 'failure',
        message: error instanceof Error ? error.message : String(error),
      } as const
    }
  }) as Promise<ReadinessProbe>
}

class PlaywrightRuntimeBrowser implements RuntimeBrowser {
  private lifecycle: RuntimeLifecycleHandlers = {
    reloading: () => {},
    reloaded: () => {},
    failed: () => {},
  }
  private initialReady = false
  private reloading = false
  private closed = false
  private readyValue?: RuntimeBridgeReady
  private readonly browserErrors: string[] = []

  constructor(
    private readonly preflight: RuntimePreflightResult,
    private readonly devServer: RuntimeDevServer,
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly signal?: AbortSignal,
  ) {
    const recordError = (detail: unknown): void => {
      this.browserErrors.push(boundedMessage(detail))
      if (this.browserErrors.length > 100) this.browserErrors.shift()
    }
    page.on('pageerror', recordError)
    page.on('console', (entry) => {
      if (entry.type() === 'error') recordError(entry.text())
    })
    page.on('crash', () => this.lifecycle.failed(new Error('Project page crashed.')))
    page.on('close', () => {
      if (!this.closed) this.lifecycle.failed(new Error('Project page closed.'))
    })
    browser.on('disconnected', () => {
      if (!this.closed) this.lifecycle.failed(new Error('Browser disconnected.'))
    })
    page.on('framenavigated', (frame) => {
      if (
        this.initialReady &&
        frame === page.mainFrame() &&
        !this.reloading &&
        !this.closed
      ) {
        this.handleReload().catch((error: unknown) => this.lifecycle.failed(error))
      }
    })
  }

  async initialize(): Promise<void> {
    try {
      await this.page.goto(this.devServer.url, {
        waitUntil: 'load',
        timeout: this.preflight.timeoutMs,
      })
    } catch (error) {
      throw runtimeError(
        this.preflight,
        'page',
        `Could not load the Project page: ${boundedMessage(error)}`,
        this.diagnostics(),
      )
    }
    // Only the initial readiness belongs to the start call; reloads later in
    // the session are not cancelled by it.
    this.readyValue = await this.waitForReady(this.signal)
    this.initialReady = true
  }

  async ready(): Promise<RuntimeBridgeReady> {
    if (!this.readyValue) throw new Error('Runtime browser was not initialized.')
    return this.readyValue
  }

  async metadata(): Promise<Record<string, unknown>> {
    return this.invokeBridge('metadata', {})
  }

  async inspect(filters: {
    entityIds?: string[]
    entityNames?: string[]
    componentTypes?: string[]
  }): Promise<Record<string, unknown>> {
    return this.invokeBridge('inspect', {
      ...(filters.entityIds ? { entity_ids: filters.entityIds } : {}),
      ...(filters.entityNames ? { entity_names: filters.entityNames } : {}),
      ...(filters.componentTypes ? { component_types: filters.componentTypes } : {}),
    })
  }

  async control(
    request: Omit<RuntimeControlInput, 'projectPath'>,
  ): Promise<Record<string, unknown>> {
    return this.invokeBridge('control', request as Record<string, unknown>)
  }

  /** The PNG plus the bridge metadata read in the same round trip, right before the capture. */
  async captureScreenshot(): Promise<Record<string, unknown> & { data: string }> {
    this.assertOperational()
    const geometry = await this.page.evaluate(() => {
      type Bridge = {
        surface: HTMLCanvasElement
        metadata(): PageBridgeMetadata
      }
      const hook = (globalThis as Record<PropertyKey, unknown>)[
        Symbol.for('@waica/runtime-bridge/v1')
      ] as BrowserBridgeActivation
      const bridge = hook.current as Bridge
      const rect = bridge.surface.getBoundingClientRect()
      return {
        metadata: bridge.metadata(),
        clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      }
    })
    const { width, height } = geometry.clip
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      Math.ceil(width) * Math.ceil(height) > 1_000_000
    ) {
      throw runtimeError(
        this.preflight,
        'game',
        'The Game surface has invalid or oversized screenshot dimensions.',
        { clip: geometry.clip },
        'runtime-operation-failed',
      )
    }
    const png = await this.page.screenshot({
      type: 'png',
      clip: geometry.clip,
      animations: 'allow',
      caret: 'hide',
    })
    return { ...geometry.metadata, data: png.toString('base64') }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.context.close().catch(() => {})
    await this.browser.close().catch(() => {})
  }

  setLifecycleHandlers(handlers: RuntimeLifecycleHandlers): void {
    this.lifecycle = handlers
  }

  private async waitForReady(signal?: AbortSignal): Promise<RuntimeBridgeReady> {
    return awaitRuntimeReadiness({
      preflight: this.preflight,
      probe: () => readinessProbe(this.page),
      closed: () => this.closed || this.page.isClosed(),
      diagnostics: () => this.diagnostics(),
      signal,
    })
  }

  private async invokeBridge(
    operation: BridgeOperation,
    argument: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertOperational()
    const response = await this.page.evaluate(callLiveBridge, { operation, argument })
    if (response.ok && response.value) return response.value
    const error = response.error ?? {
      code: 'runtime-operation-failed',
      stage: 'control',
      message: 'Runtime Bridge operation failed.',
    }
    throw runtimeError(
      this.preflight,
      error.stage === 'game' ? 'game' : 'control',
      error.message,
      error.availableActions
        ? { availableActions: error.availableActions }
        : error.availableScenes
          ? { availableScenes: error.availableScenes }
          : undefined,
      error.code === 'runtime-invalid-state'
        ? 'runtime-invalid-state'
        : 'runtime-operation-failed',
    )
  }

  private assertOperational(): void {
    if (this.closed || this.page.isClosed()) {
      throw runtimeError(
        this.preflight,
        'game',
        'The Project browser page is not available.',
        this.diagnostics(),
        'runtime-invalid-state',
      )
    }
  }

  private diagnostics(): BrowserDiagnostics & Record<string, unknown> {
    return {
      ...this.devServer.diagnostics(),
      browserErrors: [...this.browserErrors],
    }
  }

  private async handleReload(): Promise<void> {
    this.reloading = true
    this.browserErrors.length = 0
    this.lifecycle.reloading()
    try {
      const next = await this.waitForReady()
      this.readyValue = next
      this.lifecycle.reloaded(next)
    } catch (error) {
      this.lifecycle.failed(error)
    } finally {
      this.reloading = false
    }
  }
}

/**
 * Extra Chrome switches, read from WAICA_RUNTIME_CHROME_ARGS as a JSON array
 * of strings. Internal and undocumented: only the e2e legs set it, to pick
 * the Render Backend through the browser (ADR 0025) — a Run Session offers
 * no backend option. Unset or empty means none, as before.
 */
export function runtimeChromeArgs(env: Record<string, string | undefined>): string[] {
  const raw = env.WAICA_RUNTIME_CHROME_ARGS
  if (raw === undefined || raw === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === 'string')) {
    throw new Error('WAICA_RUNTIME_CHROME_ARGS must be a JSON array of strings.')
  }
  return parsed
}

export async function startRuntimeBrowser(
  preflight: RuntimePreflightResult,
  devServer: RuntimeDevServer,
  signal?: AbortSignal,
): Promise<RuntimeBrowser> {
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  try {
    browser = await chromium.launch({
      executablePath: preflight.browserExecutablePath,
      headless: preflight.headless,
      args: runtimeChromeArgs(process.env),
    })
    context = await browser.newContext({
      viewport: preflight.viewport,
      deviceScaleFactor: 1,
    })
    await context.addInitScript(installRuntimeBridgeActivation)
    const page = await context.newPage()
    signal?.throwIfAborted()
    const runtime = new PlaywrightRuntimeBrowser(preflight, devServer, browser, context, page, signal)
    await runtime.initialize()
    return runtime
  } catch (error) {
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    if (signal?.aborted) throw signal.reason
    if (error instanceof RuntimeToolError) throw error
    throw runtimeError(
      preflight,
      browser ? 'page' : 'browser',
      `Could not launch a compatible browser context: ${boundedMessage(error)}`,
      devServer.diagnostics(),
    )
  }
}
