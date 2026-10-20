import type { RenderBackend } from '@waica/engine'

/** Three 0.186 memory counters, never the resettable per-frame render counters. */
export type RendererMemoryVector = Readonly<Record<string, number>>

const REQUIRED_MEMORY = [
  'attributes', 'attributesSize', 'geometries', 'indexAttributes', 'indexAttributesSize',
  'indirectStorageAttributes', 'indirectStorageAttributesSize', 'programs', 'programsSize',
  'readbackBuffers', 'readbackBuffersSize', 'renderTargets', 'storageAttributes',
  'storageAttributesSize', 'textures', 'texturesSize', 'uniformBuffers', 'uniformBuffersSize', 'total',
] as const

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Takes a value copy. Missing/invalid metrics are a failed probe, never zero. */
export function readRendererMemory(renderer: unknown): RendererMemoryVector {
  if (!record(renderer) || !record(renderer.info) || !record(renderer.info.memory)) {
    throw new Error('bench: renderer.info.memory is unavailable')
  }
  const memory = renderer.info.memory
  const snapshot: Record<string, number> = {}
  for (const key of new Set([...REQUIRED_MEMORY, ...Object.keys(memory)])) {
    const value = memory[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`bench: invalid renderer.info.memory.${key}`)
    }
    snapshot[key] = value
  }
  return snapshot
}

export interface ShadowResourceCounters {
  readonly liveTargets: number
  readonly liveTextures: number
  readonly createdTextures: number
  readonly destroyedTextures: number
  readonly initializedTargets: number
  readonly targetDisposals: number
}

export interface ShadowResourceCheckpoint {
  readonly phase: string
  /** Zero denotes the post-warmup reference; measured cycles are 1..10. */
  readonly cycle: number
  readonly memory: RendererMemoryVector
  readonly shadow: ShadowResourceCounters
}

export const SHADOW_RESOURCE_PHASES = [
  'low', 'low-edited', 'medium', 'high', 'resized', 'off',
  'reactivated', 'light-destroyed', 'scene-2d', 'scene-3d', 'empty',
] as const

export interface ShadowResourceReport {
  readonly backend: RenderBackend
  readonly phases: readonly string[]
  readonly checkpoints: readonly ShadowResourceCheckpoint[]
  readonly cycles: 10
  /** Fixed warmup: all phases run three times, never until a leak looks flat. */
  readonly warmupCycles: 3
  readonly passed: true
  readonly measuredBeforeDispose: true
}

function validCheckpoint(value: unknown): value is ShadowResourceCheckpoint {
  if (!record(value) || typeof value.phase !== 'string' || !Number.isInteger(value.cycle)) return false
  if (!record(value.shadow)) return false
  for (const key of ['liveTargets', 'liveTextures', 'createdTextures', 'destroyedTextures', 'initializedTargets', 'targetDisposals']) {
    const counter = value.shadow[key]
    if (typeof counter !== 'number' || !Number.isSafeInteger(counter) || counter < 0) return false
  }
  try { readRendererMemory({ info: { memory: value.memory } }) } catch { return false }
  return true
}

function expectedTargets(phase: string): number {
  if (['off', 'scene-2d', 'empty'].includes(phase)) return 0
  return phase === 'light-destroyed' ? 4 : 5
}

function assertCheckpointEvidence(checkpoint: ShadowResourceCheckpoint): void {
  const { shadow, phase } = checkpoint
  if (shadow.liveTargets !== expectedTargets(phase)) throw new Error('bench: wrong live shadow targets')
  if (shadow.createdTextures - shadow.destroyedTextures !== shadow.liveTextures) throw new Error('bench: unbalanced shadow textures')
  if (shadow.initializedTargets - shadow.targetDisposals !== shadow.liveTargets) throw new Error('bench: unbalanced shadow targets')
  if (shadow.liveTargets > 0 && shadow.liveTextures < shadow.liveTargets * 2) throw new Error('bench: missing shadow attachments')
  if (shadow.createdTextures === 0) throw new Error('bench: no shadow GPU storage observed')
}

function validReportHeader(value: Record<string, unknown>): boolean {
  const expected = { cycles: 10, warmupCycles: 3, passed: true, measuredBeforeDispose: true }
  if (!Object.entries(expected).every(([key, field]) => value[key] === field)) return false
  if (value.backend !== 'webgl2' && value.backend !== 'webgpu') return false
  const phases: unknown = value.phases
  if (!Array.isArray(phases) || phases.length !== SHADOW_RESOURCE_PHASES.length) return false
  return phases.every((phase, index) => phase === SHADOW_RESOURCE_PHASES[index])
}

function orderedCheckpoint(checkpoint: ShadowResourceCheckpoint, index: number): boolean {
  return checkpoint.cycle === Math.floor(index / SHADOW_RESOURCE_PHASES.length)
    && checkpoint.phase === SHADOW_RESOURCE_PHASES[index % SHADOW_RESOURCE_PHASES.length]
}

function assertMeasuredCheckpoint(reference: ShadowResourceCheckpoint, measured: ShadowResourceCheckpoint): void {
  assertStableShadowCheckpoint(reference, measured)
  for (const key of ['createdTextures', 'destroyedTextures', 'initializedTargets', 'targetDisposals'] as const) {
    if (measured.shadow[key] <= reference.shadow[key]) throw new Error(`bench: no measured shadow turnover: ${key}`)
  }
}

/** JSON/public result boundary: rechecks completeness, actual vectors and every cycle. */
export function isShadowResourceReport(value: unknown): value is ShadowResourceReport {
  if (!record(value) || !validReportHeader(value)) return false
  if (!Array.isArray(value.checkpoints) || value.checkpoints.length !== SHADOW_RESOURCE_PHASES.length * 11) return false
  const checkpoints: unknown[] = value.checkpoints
  const references = new Map<string, ShadowResourceCheckpoint>()
  try {
    for (const [index, checkpoint] of checkpoints.entries()) {
      if (!validCheckpoint(checkpoint)) return false
      if (!orderedCheckpoint(checkpoint, index)) return false
      assertCheckpointEvidence(checkpoint)
      const reference = references.get(checkpoint.phase)
      if (reference) assertMeasuredCheckpoint(reference, checkpoint)
      references.set(checkpoint.phase, checkpoint)
    }
  } catch { return false }
  return true
}

/**
 * GPU counts/storage must be stable. Three's programsSize is literally shader
 * source code.length (Info.createProgram), including changing generated names,
 * not GPU memory; retain/report it raw but separate it from total storage.
 */
export function assertStableShadowCheckpoint(reference: ShadowResourceCheckpoint, measured: ShadowResourceCheckpoint): void {
  if (reference.phase !== measured.phase) throw new Error('bench: incomparable shadow resource phases')
  const keys = new Set([...Object.keys(reference.memory), ...Object.keys(measured.memory)])
  for (const key of keys) {
    if (key === 'programsSize' || key === 'total') continue
    if (reference.memory[key] !== measured.memory[key]) {
      throw new Error(`bench: shadow resources ${measured.phase} cycle ${measured.cycle}: memory.${key} ${reference.memory[key]} -> ${measured.memory[key]}`)
    }
  }
  const retainedStorage = (checkpoint: ShadowResourceCheckpoint): number =>
    Number(checkpoint.memory.total) - Number(checkpoint.memory.programsSize)
  if (retainedStorage(reference) !== retainedStorage(measured)) {
    throw new Error(`bench: shadow resources ${measured.phase} cycle ${measured.cycle}: memory.total GPU storage changed`)
  }
  for (const key of ['liveTargets', 'liveTextures'] as const) {
    if (reference.shadow[key] !== measured.shadow[key]) {
      throw new Error(`bench: shadow resources ${measured.phase} cycle ${measured.cycle}: ${key} changed`)
    }
  }
}
