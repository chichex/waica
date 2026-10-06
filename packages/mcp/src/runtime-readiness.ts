import { ASSETS_POLL_INTERVAL_MS, abortableDelay, runtimeAssetStatus } from './runtime-assets.js'
import type { RuntimePreflightResult } from './runtime-preflight.js'
import type { RuntimeBridgeReady } from './runtime-session-manager.js'
import { RuntimeToolError } from './runtime-service.js'

export const MINIMUM_RUNTIME_ENGINE_VERSION = '0.5.0'

export interface PageBridgeMetadata {
  engineVersion: string
  bridgeVersion: number
  mode: 'paused' | 'real-time'
  frame: number
  simulationTime: number
  /** Absent on a pre-CA-10 engine build — never assume it's there. */
  capabilities?: readonly string[]
  /** Absent on an engine without the 'assets' capability (ADR 0019). */
  assets?: { pending: number; loaded: number; failed: number }
  /** The Render Backend, null until the renderer is ready; absent without 'render-backend' (ADR 0025). */
  backend?: 'webgpu' | 'webgl2' | null
  [key: string]: unknown
}

export type ReadinessProbe =
  | { status: 'waiting' }
  /** `code` names the activation's failure ('multiple-games', 'render-backend-failed'), when it has one. */
  | { status: 'failure'; code?: string; message: string }
  | {
      status: 'ready'
      metadata: PageBridgeMetadata
      initialSnapshot: Record<string, unknown>
    }

export interface BrowserDiagnostics {
  browserErrors: string[]
}

export function boundedMessage(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value)
  return text.length <= 4_096 ? text : `${text.slice(-4_096)}`
}

export function runtimeError(
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

/**
 * A registered Game whose renderer has not settled on a Render Backend yet
 * (ADR 0025): it would step without drawing and screenshot nothing, so a
 * Run Session is not operational until it reports one. An engine without
 * the 'render-backend' capability is taken as it always was.
 */
function awaitsRenderBackend(metadata: PageBridgeMetadata): boolean {
  return (metadata.capabilities ?? []).includes('render-backend') && metadata.backend == null
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
  const assets = runtimeAssetStatus(metadata.assets)
  return {
    engineVersion: metadata.engineVersion,
    bridgeVersion: metadata.bridgeVersion,
    mode: metadata.mode,
    frame: metadata.frame,
    simulationTime: metadata.simulationTime,
    // [] (not undefined) for a pre-CA-10 engine that never sent the field,
    // so a capability check can do a plain .includes() either way.
    capabilities: metadata.capabilities ?? [],
    ...(assets ? { assets } : {}),
    initialSnapshot,
  }
}

function failureStage(probe: Extract<ReadinessProbe, { status: 'failure' }>): 'game' | 'bridge' {
  if (probe.code === 'multiple-games' || probe.code === 'render-backend-failed') return 'game'
  return probe.message.includes('Exactly one live Game') ? 'game' : 'bridge'
}

export interface ReadinessWait {
  preflight: RuntimePreflightResult
  /** One look at the page: no bridge yet, a failure, or a registered bridge's metadata. */
  probe(): Promise<ReadinessProbe>
  closed(): boolean
  diagnostics(): BrowserDiagnostics & Record<string, unknown>
  signal?: AbortSignal
}

function timedOut(wait: ReadinessWait, lastReady: ReadinessProbe | null): RuntimeToolError {
  const { preflight } = wait
  const diagnostics = wait.diagnostics()
  if (lastReady?.status === 'ready') {
    return runtimeError(
      preflight,
      'game',
      'Timed out waiting for the Game\'s Render Backend: its renderer never finished initializing.',
      { ...diagnostics, metadata: lastReady.metadata },
    )
  }
  if (diagnostics.browserErrors.length > 0) {
    return runtimeError(preflight, 'page', 'The Project page did not reach Runtime Bridge readiness.', diagnostics)
  }
  return runtimeError(
    preflight,
    'bridge',
    'Timed out waiting for Runtime Bridge protocol 1 and one live Game.',
    { ...diagnostics, minimumEngineVersion: MINIMUM_RUNTIME_ENGINE_VERSION },
    preflight.engine.version === MINIMUM_RUNTIME_ENGINE_VERSION
      ? 'runtime-start-failed'
      : 'runtime-incompatible',
  )
}

/**
 * Polls the page until one live Game is registered and operational — its
 * Render Backend reported, when the engine has one to report — within the
 * preflight's timeout. A failure the page reports (two Games, a renderer
 * that could not initialize) ends the wait at once as a runtime error.
 */
export async function awaitRuntimeReadiness(wait: ReadinessWait): Promise<RuntimeBridgeReady> {
  const { preflight, signal } = wait
  const deadline = Date.now() + preflight.timeoutMs
  let lastReady: ReadinessProbe | null = null
  while (Date.now() <= deadline) {
    signal?.throwIfAborted()
    if (wait.closed()) {
      throw runtimeError(preflight, 'page', 'The Project page closed before Runtime Bridge readiness.', wait.diagnostics())
    }
    const probe = await wait.probe().catch((error: unknown) => ({
      status: 'failure' as const,
      message: boundedMessage(error),
    }))
    if (probe.status === 'failure') {
      throw runtimeError(preflight, failureStage(probe), probe.message, wait.diagnostics())
    }
    if (probe.status === 'ready') {
      if (!awaitsRenderBackend(probe.metadata)) return bridgeReady(preflight, probe)
      lastReady = probe
    }
    await abortableDelay(ASSETS_POLL_INTERVAL_MS, signal)
  }
  throw timedOut(wait, lastReady)
}
