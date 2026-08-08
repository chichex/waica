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
import { RuntimeToolError, type RuntimeControlInput } from './runtime-service.js'

export const RUNTIME_BRIDGE_SYMBOL_KEY = '@waica/runtime-bridge/v1'
export const MINIMUM_RUNTIME_ENGINE_VERSION = '0.5.0'

export interface BrowserBridgeFailure {
  code: 'multiple-games'
  message: string
}

export interface BrowserBridgeActivation {
  readonly protocolVersion: 1
  current: unknown | null
  failure: BrowserBridgeFailure | null
  register(bridge: unknown): void
  unregister(bridge: unknown): void
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
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: activation,
  })
}

interface PageBridgeMetadata {
  engineVersion: string
  bridgeVersion: number
  mode: 'paused' | 'real-time'
  frame: number
  simulationTime: number
  [key: string]: unknown
}

type ReadinessProbe =
  | { status: 'waiting' }
  | { status: 'failure'; message: string }
  | {
      status: 'ready'
      metadata: PageBridgeMetadata
      initialSnapshot: Record<string, unknown>
    }

interface BrowserDiagnostics {
  browserErrors: string[]
}

function boundedMessage(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value)
  return text.length <= 4_096 ? text : `${text.slice(-4_096)}`
}

function runtimeError(
  preflight: RuntimePreflightResult,
  stage: 'browser' | 'page' | 'bridge' | 'game' | 'control',
  message: string,
  diagnostics?: Record<string, unknown>,
  code:
    | 'runtime-start-failed'
    | 'runtime-incompatible'
    | 'runtime-invalid-state'
    | 'runtime-operation-failed' = 'runtime-start-failed',
): RuntimeToolError {
  return new RuntimeToolError({
    code,
    stage,
    message,
    projectPath: preflight.projectPath,
    ...(diagnostics ? { diagnostics } : {}),
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
    if (!hook?.current) {
      if (hook?.failure) return { status: 'failure', message: hook.failure.message } as const
      return { status: 'waiting' } as const
    }
    if (hook.failure) return { status: 'failure', message: hook.failure.message } as const
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

function bridgeReady(
  preflight: RuntimePreflightResult,
  probe: Extract<ReadinessProbe, { status: 'ready' }>,
): RuntimeBridgeReady {
  const { metadata, initialSnapshot } = probe
  if (metadata.bridgeVersion !== 1) {
    throw runtimeError(
      preflight,
      'bridge',
      `Runtime Bridge protocol ${String(metadata.bridgeVersion)} is incompatible; protocol 1 is required.`,
      { minimumEngineVersion: MINIMUM_RUNTIME_ENGINE_VERSION },
      'runtime-incompatible',
    )
  }
  if (
    metadata.mode !== 'paused' ||
    metadata.frame !== 0 ||
    metadata.simulationTime !== 0
  ) {
    throw runtimeError(
      preflight,
      'game',
      'The Runtime Bridge did not reach the required paused frame-zero baseline.',
      { metadata },
    )
  }
  return {
    engineVersion: metadata.engineVersion,
    bridgeVersion: metadata.bridgeVersion,
    mode: metadata.mode,
    frame: metadata.frame,
    simulationTime: metadata.simulationTime,
    initialSnapshot,
  }
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
        void this.handleReload()
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
    this.readyValue = await this.waitForReady()
    this.initialReady = true
  }

  async ready(): Promise<RuntimeBridgeReady> {
    if (!this.readyValue) throw new Error('Runtime browser was not initialized.')
    return this.readyValue
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
    const metadata = await this.invokeBridge('metadata', {})
    return { ...metadata, data: png.toString('base64') }
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

  private async waitForReady(): Promise<RuntimeBridgeReady> {
    const deadline = Date.now() + this.preflight.timeoutMs
    while (Date.now() <= deadline) {
      if (this.closed || this.page.isClosed()) {
        throw runtimeError(
          this.preflight,
          'page',
          'The Project page closed before Runtime Bridge readiness.',
          this.diagnostics(),
        )
      }
      const probe = await readinessProbe(this.page).catch((error) => ({
        status: 'failure' as const,
        message: boundedMessage(error),
      }))
      if (probe.status === 'ready') return bridgeReady(this.preflight, probe)
      if (probe.status === 'failure') {
        throw runtimeError(
          this.preflight,
          probe.message.includes('Exactly one live Game') ? 'game' : 'bridge',
          probe.message,
          this.diagnostics(),
        )
      }
      await delay(25)
    }
    const diagnostics = this.diagnostics()
    if (this.browserErrors.length > 0) {
      throw runtimeError(
        this.preflight,
        'page',
        'The Project page did not reach Runtime Bridge readiness.',
        diagnostics,
      )
    }
    throw runtimeError(
      this.preflight,
      'bridge',
      'Timed out waiting for Runtime Bridge protocol 1 and one live Game.',
      { ...diagnostics, minimumEngineVersion: MINIMUM_RUNTIME_ENGINE_VERSION },
      this.preflight.engine.version === MINIMUM_RUNTIME_ENGINE_VERSION
        ? 'runtime-start-failed'
        : 'runtime-incompatible',
    )
  }

  private async invokeBridge(
    operation: 'inspect' | 'control' | 'metadata',
    argument: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertOperational()
    const response = await this.page.evaluate(
      ({ operation, argument }) => {
        type Bridge = {
          metadata(): Record<string, unknown>
          inspect(filters?: Record<string, unknown>): Record<string, unknown>
          control(request: Record<string, unknown>): Record<string, unknown>
        }
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
            },
          }
        }
      },
      { operation, argument },
    ) as {
      ok: boolean
      value?: Record<string, unknown>
      error?: {
        code: string
        stage: string
        message: string
        availableActions?: string[]
      }
    }
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
      error.availableActions ? { availableActions: error.availableActions } : undefined,
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

export async function startRuntimeBrowser(
  preflight: RuntimePreflightResult,
  devServer: RuntimeDevServer,
): Promise<RuntimeBrowser> {
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  try {
    browser = await chromium.launch({
      executablePath: preflight.browserExecutablePath,
      headless: preflight.headless,
    })
    context = await browser.newContext({
      viewport: preflight.viewport,
      deviceScaleFactor: 1,
    })
    await context.addInitScript(installRuntimeBridgeActivation)
    const page = await context.newPage()
    const runtime = new PlaywrightRuntimeBrowser(preflight, devServer, browser, context, page)
    await runtime.initialize()
    return runtime
  } catch (error) {
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    if (error instanceof RuntimeToolError) throw error
    throw runtimeError(
      preflight,
      browser ? 'page' : 'browser',
      `Could not launch a compatible browser context: ${boundedMessage(error)}`,
      devServer.diagnostics(),
    )
  }
}
