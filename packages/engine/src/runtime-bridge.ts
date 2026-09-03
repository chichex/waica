import enginePackage from '../package.json' with { type: 'json' }
import type { RuntimeSnapshot, RuntimeSnapshotFilters } from './runtime-inspection.js'

export const RUNTIME_BRIDGE_PROTOCOL_VERSION = 1 as const
export const RUNTIME_BRIDGE_SYMBOL = Symbol.for('@waica/runtime-bridge/v1')

export type RuntimeMode = 'paused' | 'real-time'

/**
 * Operations this build's control() actually implements, beyond the
 * baseline protocol 1 set (press/hold/release/pause/resume/step) every
 * bridge has always supported. Additive metadata, not a protocol bump: a
 * pre-CA-10 engine simply lacks this field, which is exactly what callers
 * gating on capabilities check for (review finding #4) — protocol 1 alone
 * doesn't distinguish an engine that silently no-ops an unknown operation
 * from one that runs it.
 */
export const RUNTIME_BRIDGE_CAPABILITIES = ['click', 'scene'] as const

export interface RuntimeMetadata {
  bridgeVersion: typeof RUNTIME_BRIDGE_PROTOCOL_VERSION
  engineVersion: string
  mode: RuntimeMode
  frame: number
  simulationTime: number
  capabilities: readonly string[]
}

export type RuntimeControlRequest =
  | { operation: 'press' | 'hold' | 'release'; action: string }
  | { operation: 'pause' | 'resume' }
  | { operation: 'step'; dt?: number; frames?: number }
  | { operation: 'click'; x: number; y: number }
  | { operation: 'scene'; scene: string }

export interface RuntimeControlResult extends RuntimeMetadata {
  heldActions: string[]
}

export class RuntimeBridgeOperationError extends Error {
  readonly stage = 'control' as const

  constructor(
    readonly code: 'runtime-invalid-state' | 'runtime-operation-failed',
    message: string,
    readonly availableActions?: string[],
    readonly availableScenes?: string[],
  ) {
    super(message)
    this.name = 'RuntimeBridgeOperationError'
  }
}

/** Engine-owned capability registered only in an MCP-activated page. */
export interface RuntimeBridge {
  readonly surface: HTMLCanvasElement
  metadata(): RuntimeMetadata
  inspect(filters?: RuntimeSnapshotFilters): RuntimeSnapshot
  control(request: RuntimeControlRequest): RuntimeControlResult
}

/** Ephemeral pre-page hook installed by the owner of a browser context. */
export interface RuntimeBridgeActivation {
  readonly protocolVersion: typeof RUNTIME_BRIDGE_PROTOCOL_VERSION
  register(bridge: RuntimeBridge): void
  unregister(bridge: RuntimeBridge): void
}

export function activeRuntimeBridgeHook(): RuntimeBridgeActivation | null {
  const candidate = (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  if (!candidate || typeof candidate !== 'object') return null
  const hook = candidate as Partial<RuntimeBridgeActivation>
  if (
    hook.protocolVersion !== RUNTIME_BRIDGE_PROTOCOL_VERSION ||
    typeof hook.register !== 'function' ||
    typeof hook.unregister !== 'function'
  ) {
    return null
  }
  return hook as RuntimeBridgeActivation
}

export interface RuntimeBridgeHost {
  step(dt: number): void
  resume(frame: (dt: number) => void): void
  pause(): void
  injectAction(action: string, operation: 'press' | 'hold' | 'release'): boolean
  availableActions(): string[]
  heldActions(): string[]
  inspect(metadata: RuntimeMetadata, filters?: RuntimeSnapshotFilters): RuntimeSnapshot
  click(x: number, y: number): void
  /** Resolves `name` through the registered catalog and loads it. */
  loadScene(name: string): boolean
  availableScenes(): string[]
}

export class EngineRuntimeBridge implements RuntimeBridge {
  readonly engineVersion = enginePackage.version
  private registered = true
  private mode: RuntimeMode = 'paused'
  private frame = 0
  private simulationTime = 0

  constructor(
    readonly surface: HTMLCanvasElement,
    private readonly activation: RuntimeBridgeActivation,
    private readonly host: RuntimeBridgeHost,
  ) {}

  metadata(): RuntimeMetadata {
    return {
      bridgeVersion: RUNTIME_BRIDGE_PROTOCOL_VERSION,
      engineVersion: this.engineVersion,
      mode: this.mode,
      frame: this.frame,
      simulationTime: this.simulationTime,
      capabilities: RUNTIME_BRIDGE_CAPABILITIES,
    }
  }

  inspect(filters: RuntimeSnapshotFilters = {}): RuntimeSnapshot {
    return this.host.inspect(this.metadata(), filters)
  }

  control(request: RuntimeControlRequest): RuntimeControlResult {
    switch (request.operation) {
      case 'pause':
        if (this.mode === 'real-time') {
          this.host.pause()
          this.mode = 'paused'
        }
        break
      case 'resume':
        if (this.mode === 'paused') {
          this.mode = 'real-time'
          this.host.resume((dt) => this.advance(dt))
        }
        break
      case 'press':
      case 'hold':
      case 'release':
        if (!this.host.injectAction(request.action, request.operation)) {
          const available = this.host.availableActions()
          throw new RuntimeBridgeOperationError(
            'runtime-operation-failed',
            `Unknown action "${request.action}". Available actions: ${available.join(', ') || '(none)'}.`,
            available,
          )
        }
        break
      case 'step': {
        if (this.mode !== 'paused') {
          throw new RuntimeBridgeOperationError(
            'runtime-invalid-state',
            'step is only available while the Runtime Bridge is paused.',
          )
        }
        const dt = request.dt ?? 1 / 60
        const frames = request.frames ?? 1
        if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) {
          throw new RuntimeBridgeOperationError(
            'runtime-operation-failed',
            'dt must be finite and greater than 0 and at most 0.1.',
          )
        }
        if (!Number.isInteger(frames) || frames < 1 || frames > 600) {
          throw new RuntimeBridgeOperationError(
            'runtime-operation-failed',
            'frames must be an integer from 1 through 600.',
          )
        }
        for (let index = 0; index < frames; index += 1) this.advance(dt)
        break
      }
      case 'click': {
        if (!Number.isFinite(request.x) || !Number.isFinite(request.y)) {
          throw new RuntimeBridgeOperationError(
            'runtime-operation-failed',
            'x and y must be finite numbers.',
          )
        }
        this.host.click(request.x, request.y)
        break
      }
      case 'scene': {
        if (!this.host.loadScene(request.scene)) {
          const available = this.host.availableScenes()
          throw new RuntimeBridgeOperationError(
            'runtime-operation-failed',
            `Unknown scene "${request.scene}". Available scenes: ${available.join(', ') || '(none)'}.`,
            undefined,
            available,
          )
        }
        break
      }
      default: {
        const unsupported: never = request
        throw new RuntimeBridgeOperationError(
          'runtime-operation-failed',
          `Unsupported runtime control operation "${(unsupported as { operation: string }).operation}".`,
        )
      }
    }
    return { ...this.metadata(), heldActions: this.host.heldActions() }
  }

  private advance(dt: number): void {
    this.host.step(dt)
    this.frame += 1
    this.simulationTime += dt
  }

  unregister(): void {
    if (!this.registered) return
    this.registered = false
    this.activation.unregister(this)
  }
}
