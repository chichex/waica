import { Component, type ComponentSpace, type ParamSpec } from '../component.js'
import {
  ParticleBatch,
  type ParticleRenderContext,
  type ParticleSpawn,
} from '../particle-batch.js'
import type { YSortBatchParticipant, YSortEntry } from '../render-sort.js'
import { sceneDrainsOf } from '../scene-drains.js'
import { setEmissive } from '../render-layers.js'

export type ParticleVector = [number, number]
export type ParticleSpace = 'world' | 'local'
export type ParticleOverflow = 'recycle-oldest' | 'drop-new'
export type ParticleDestroyMode = 'clear' | 'drain'
export type ParticleBlend = 'normal' | 'additive'

/** A fixed-capacity source of short-lived, batched 2D particles. */
export class ParticleEmitter extends Component implements YSortBatchParticipant {
  static override componentName = 'ParticleEmitter'
  static override space: ComponentSpace = '2d'
  static override displayName = 'Particle Emitter'
  static override params = {
    rate: { label: 'Rate', min: 0 },
    emitting: { label: 'Emitting' },
    lifetime: { label: 'Lifetime', min: 0 },
    positionSpread: { label: 'Position spread', kind: 'vector2' },
    velocity: { label: 'Velocity', kind: 'vector2' },
    velocitySpread: { label: 'Velocity spread', kind: 'vector2' },
    gravity: { label: 'Gravity', kind: 'vector2' },
    space: { label: 'Space', options: ['world', 'local'] },
    seed: { label: 'Seed', step: 1 },
    capacity: { label: 'Capacity', min: 1, step: 1 },
    overflow: { label: 'Overflow', options: ['recycle-oldest', 'drop-new'] },
    destroyMode: { label: 'On destroy', options: ['clear', 'drain'] },
    width: { label: 'Width', min: 0 },
    height: { label: 'Height', min: 0 },
    startScale: { label: 'Start scale', min: 0 },
    endScale: { label: 'End scale', min: 0 },
    startColor: { label: 'Start color', kind: 'color' },
    endColor: { label: 'End color', kind: 'color' },
    startAlpha: { label: 'Start alpha', min: 0, max: 1 },
    endAlpha: { label: 'End alpha', min: 0, max: 1 },
    texture: { label: 'Texture', kind: 'texture' },
    pixelArt: { label: 'Pixel art' },
    blend: { label: 'Blend', options: ['normal', 'additive'] },
    layer: { label: 'Layer', step: 1 },
    emissive: { label: 'Emissive' },
  } satisfies Record<string, ParamSpec>

  rate = 0
  emitting = true
  lifetime = 1
  positionSpread: ParticleVector = [0, 0]
  velocity: ParticleVector = [0, 0]
  velocitySpread: ParticleVector = [0, 0]
  gravity: ParticleVector = [0, 0]
  space: ParticleSpace = 'world'
  private _seed = 1
  get seed(): number {
    return this._seed
  }
  set seed(value: number) {
    const next = Number.isFinite(value) ? Math.trunc(value) >>> 0 : 1
    if (next === this._seed) return
    this._seed = next
    this._batch?.setSeed(next)
  }
  private _capacity = 256
  get capacity(): number {
    return this._capacity
  }
  set capacity(value: number) {
    const next = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 256
    if (next === this._capacity) return
    this._capacity = next
    this._batch?.resize(next)
  }
  overflow: ParticleOverflow = 'recycle-oldest'
  destroyMode: ParticleDestroyMode = 'clear'
  width = 1
  height = 1
  startScale = 1
  endScale = 1
  startColor = 0xffffff
  endColor = 0xffffff
  startAlpha = 1
  endAlpha = 0
  private _texture = ''
  get texture(): string {
    return this._texture
  }
  set texture(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._texture) return
    this._texture = next
    this._batch?.setTexture(next, this.pixelArt)
  }
  private _pixelArt = false
  get pixelArt(): boolean {
    return this._pixelArt
  }
  set pixelArt(value: boolean) {
    const next = value === true
    if (next === this._pixelArt) return
    this._pixelArt = next
    this._batch?.setTexture(this.texture, next)
  }
  private _blend: ParticleBlend = 'normal'
  get blend(): ParticleBlend {
    return this._blend
  }
  set blend(value: ParticleBlend) {
    const next = value === 'additive' ? 'additive' : 'normal'
    if (next === this._blend) return
    this._blend = next
    this._batch?.setBlend(next)
  }
  private _layer = 0
  get layer(): number {
    return this._layer
  }
  set layer(value: number) {
    const next = Number.isFinite(value) ? value : 0
    if (next === this._layer) return
    this._layer = next
    this._batch?.setLayer(next)
    this._batch?.sync(this.renderContext())
  }

  // Emissive (issue #78 CA-10): never darkened by the light-map.
  private _emissive = false
  get emissive(): boolean {
    return this._emissive
  }
  set emissive(value: boolean) {
    this._emissive = value === true
    if (this._batch) setEmissive(this._batch.mesh, this._emissive)
  }

  private _batch?: ParticleBatch
  private _unsubscribeRenderSync?: () => void
  private _emissionRemainder = 0
  private _destroyed = false

  get active(): number {
    return this._batch?.active ?? 0
  }

  override onReady(): void {
    const capacity = Number.isFinite(this.capacity) ? Math.max(1, Math.floor(this.capacity)) : 256
    this._batch = new ParticleBatch({
      capacity,
      seed: this.seed,
      layer: this.layer,
      blend: this.blend,
      assets: this.game.assets,
    })
    this._batch.setTexture(this.texture, this.pixelArt)
    setEmissive(this._batch.mesh, this._emissive)
    this.game.scene.add(this._batch.mesh)
    this._batch.sync(this.renderContext())
    this._unsubscribeRenderSync = this.game.onUpdate(() => this._batch?.sync(this.renderContext()))
    this._emissionRemainder = 0
    this._destroyed = false
  }

  override onUpdate(dt: number): void {
    if (this._destroyed) return
    this._batch?.advance(dt, this.renderContext())
    if (!this.emitting) return
    const rate = Number.isFinite(this.rate) ? Math.max(0, this.rate) : 0
    if (rate === 0) return
    this._emissionRemainder += rate * dt
    const count = Math.floor(this._emissionRemainder)
    if (count === 0) return
    this._emissionRemainder -= count
    this.emit(count)
  }

  /** Emits a burst immediately and returns how many particles from it remain active. */
  emit(value: number): number {
    if (this._destroyed || !this._batch) return 0
    const accepted = this._batch.emit(value, this.overflow, this.spawnConfig())
    this._batch.sync(this.renderContext())
    return accepted
  }

  ySortEntries(): readonly YSortEntry[] {
    return this._batch?.ySortEntries() ?? []
  }

  setSortZ(z: number): void {
    this._batch?.setSortZ(z)
  }

  setSortZs(values: readonly number[]): void {
    this._batch?.setSortZs(values)
  }

  override inspectState(): { active: number; capacity: number; emitting: boolean } {
    return { active: this.active, capacity: this.capacity, emitting: this.emitting }
  }

  override onDestroy(): void {
    this._destroyed = true
    this._unsubscribeRenderSync?.()
    this._unsubscribeRenderSync = undefined
    const batch = this._batch
    this._batch = undefined
    if (!batch) return
    if (this.destroyMode === 'drain' && batch.active > 0) {
      batch.detach(this.renderContext())
      sceneDrainsOf(this.game).add(batch)
    } else {
      batch.dispose()
    }
  }

  private renderContext(): ParticleRenderContext {
    return {
      owner: [this.entity.position.x, this.entity.position.y],
      projection: this.game.projection,
    }
  }

  private spawnConfig(): ParticleSpawn {
    return {
      origin: [this.entity.position.x, this.entity.position.y],
      positionSpread: this.positionSpread,
      velocity: this.velocity,
      velocitySpread: this.velocitySpread,
      gravity: this.gravity,
      space: this.space,
      lifetime: this.lifetime,
      width: this.width,
      height: this.height,
      startScale: this.startScale,
      endScale: this.endScale,
      startColor: this.startColor,
      endColor: this.endColor,
      startAlpha: this.startAlpha,
      endAlpha: this.endAlpha,
    }
  }
}
