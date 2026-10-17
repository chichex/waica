import * as THREE from 'three/webgpu'
import type { RenderBackend } from '@waica/engine'
import type { BenchRenderer } from './draw-counter.ts'

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

interface Allocation {
  target: THREE.RenderTarget | null
  owner: string | undefined
}

interface UnclaimedStorage {
  created: number
  destroyed: number
}

/** instanceof validates identity; the predicate also closes generic constructor inference. */
function nativeTexture(value: unknown): value is THREE.Texture {
  return value instanceof THREE.Texture
}

/** Restores even inherited methods without leaving an own-property shadow. */
function intercept(backend: object, name: string, observed: (texture: THREE.Texture) => void): () => void {
  const original: unknown = Reflect.get(backend, name)
  if (typeof original !== 'function') throw new Error(`bench: backend.${name}() is unavailable`)
  const descriptor = Object.getOwnPropertyDescriptor(backend, name)
  Object.defineProperty(backend, name, {
    configurable: true, writable: true,
    value(this: object, ...args: unknown[]): unknown {
      if (!nativeTexture(args[0])) throw new Error(`bench: ${name} received no Three texture`)
      const result: unknown = Reflect.apply(original, this, args)
      observed(args[0])
      return result
    },
  })
  return () => {
    if (descriptor) Object.defineProperty(backend, name, descriptor)
    else Reflect.deleteProperty(backend, name)
  }
}

/**
 * External renderer boundary observer. Only successful backend create/destroy
 * calls establish GPU-storage lifetime; a target dispose event alone cannot.
 * Retired textures/targets leave all strong collections immediately.
 */
export class ShadowResourceObserver {
  private readonly live = new Map<THREE.Texture, Allocation>()
  private readonly owners = new WeakMap<THREE.RenderTarget, string>()
  private readonly unclaimed = new WeakMap<THREE.RenderTarget, UnclaimedStorage>()
  private readonly targets = new Map<THREE.RenderTarget, () => void>()
  private readonly restore: (() => void)[] = []
  private createdTextures = 0
  private destroyedTextures = 0
  private initializedTargets = 0
  private targetDisposals = 0

  constructor(private readonly renderer: BenchRenderer) {
    readRendererMemory(renderer)
    this.restore.push(intercept(renderer.backend, 'createTexture', (texture) => this.created(texture)))
    try {
      this.restore.push(intercept(renderer.backend, 'destroyTexture', (texture) => this.destroyed(texture)))
    } catch (error) {
      this.uninstall()
      throw error
    }
  }

  private created(texture: THREE.Texture): void {
    if (this.live.has(texture)) throw new Error('bench: texture GPU storage recreated without destruction')
    const target = texture.renderTarget
    const owner = target ? this.owners.get(target) : undefined
    this.live.set(texture, { target, owner })
    if (owner !== undefined) this.createdTextures++
    else if (target) this.pending(target).created++
  }

  private destroyed(texture: THREE.Texture): void {
    const allocation = this.live.get(texture)
    if (allocation?.owner !== undefined) this.destroyedTextures++
    else if (allocation?.target) this.pending(allocation.target).destroyed++
    this.live.delete(texture)
  }

  private pending(target: THREE.RenderTarget): UnclaimedStorage {
    const pending = this.unclaimed.get(target) ?? { created: 0, destroyed: 0 }
    this.unclaimed.set(target, pending)
    return pending
  }

  /** Call after rendering: light.shadow.map now points at Three's real target. */
  observe(owner: string, target: THREE.RenderTarget): void {
    const attachments = [...target.textures, ...(target.depthTexture ? [target.depthTexture] : [])]
    if (!attachments.length || attachments.some((texture) => !this.live.has(texture))) {
      throw new Error(`bench: shadow target for ${owner} has unobserved/uninitialized GPU storage`)
    }
    this.owners.set(target, owner)
    const pending = this.unclaimed.get(target)
    if (pending) {
      this.createdTextures += pending.created
      this.destroyedTextures += pending.destroyed
      this.unclaimed.delete(target)
    }
    for (const [texture, allocation] of this.live) {
      if (allocation.target !== target && !attachments.includes(texture)) continue
      if (allocation.owner === undefined && allocation.target !== target) this.createdTextures++
      allocation.owner = owner
      allocation.target = target
    }
    this.trackDisposal(target)
  }

  private trackDisposal(target: THREE.RenderTarget): void {
    if (this.targets.has(target)) return
    const disposed = () => {
      this.targetDisposals++
      target.removeEventListener('dispose', disposed)
      this.targets.delete(target)
    }
    target.addEventListener('dispose', disposed)
    this.targets.set(target, disposed)
    this.initializedTargets++
  }

  checkpoint(phase: string, cycle: number): ShadowResourceCheckpoint {
    const shadows = [...this.live.values()].filter((allocation) => allocation.owner !== undefined)
    return {
      phase, cycle, memory: readRendererMemory(this.renderer),
      shadow: {
        liveTargets: new Set(shadows.map((allocation) => allocation.target)).size,
        liveTextures: shadows.length, createdTextures: this.createdTextures,
        destroyedTextures: this.destroyedTextures, initializedTargets: this.initializedTargets,
        targetDisposals: this.targetDisposals,
      },
    }
  }

  assertRetired(owner: string): void {
    if ([...this.live.values()].some((allocation) => allocation.owner === owner)) {
      throw new Error(`bench: retired shadow owner ${owner} retains GPU attachments`)
    }
    for (const target of this.targets.keys()) {
      if (this.owners.get(target) === owner) throw new Error(`bench: retired shadow owner ${owner} retains a target`)
    }
  }

  uninstall(): void {
    for (const restore of this.restore.splice(0).reverse()) restore()
    for (const [target, listener] of this.targets) target.removeEventListener('dispose', listener)
    this.targets.clear()
    this.live.clear()
  }
}
