import * as THREE from 'three/webgpu'
import type { BenchRenderer } from './draw-counter.ts'
import { readRendererMemory, type ShadowResourceCheckpoint } from './shadow-resources.ts'

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
  private readonly renderer: BenchRenderer

  constructor(renderer: BenchRenderer) {
    this.renderer = renderer
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
