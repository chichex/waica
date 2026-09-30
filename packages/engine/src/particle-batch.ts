import * as THREE from 'three'
import type { AssetLoader } from './assets/asset-loader.js'
import type { ParticleBlend, ParticleOverflow, ParticleSpace, ParticleVector } from './components/particle-emitter.js'
import { projectIsometric } from './projection.js'
import type { YSortEntry } from './render-sort.js'
import { reportRejection } from './report-rejection.js'
import type { SceneDrain } from './scene-drains.js'

export interface ParticleRenderContext {
  owner: ParticleVector
  projection: 'isometric' | null
}

export interface ParticleSpawn {
  origin: ParticleVector
  positionSpread: ParticleVector
  velocity: ParticleVector
  velocitySpread: ParticleVector
  gravity: ParticleVector
  space: ParticleSpace
  lifetime: number
  width: number
  height: number
  startScale: number
  endScale: number
  startColor: number
  endColor: number
  startAlpha: number
  endAlpha: number
}

interface ParticleArrays {
  x: Float64Array
  y: Float64Array
  vx: Float64Array
  vy: Float64Array
  gx: Float64Array
  gy: Float64Array
  age: Float64Array
  lifetime: Float64Array
  width: Float64Array
  height: Float64Array
  startScale: Float64Array
  endScale: Float64Array
  startColor: Uint32Array
  endColor: Uint32Array
  startAlpha: Float64Array
  endAlpha: Float64Array
  local: Uint8Array
  ordinal: Float64Array
  renderY: Float64Array
  sortZ: Float64Array
  order: Uint32Array
  entrySlots: Uint32Array
}

function particleArrays(capacity: number): ParticleArrays {
  return {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    vx: new Float64Array(capacity),
    vy: new Float64Array(capacity),
    gx: new Float64Array(capacity),
    gy: new Float64Array(capacity),
    age: new Float64Array(capacity),
    lifetime: new Float64Array(capacity),
    width: new Float64Array(capacity),
    height: new Float64Array(capacity),
    startScale: new Float64Array(capacity),
    endScale: new Float64Array(capacity),
    startColor: new Uint32Array(capacity),
    endColor: new Uint32Array(capacity),
    startAlpha: new Float64Array(capacity),
    endAlpha: new Float64Array(capacity),
    local: new Uint8Array(capacity),
    ordinal: new Float64Array(capacity),
    renderY: new Float64Array(capacity),
    sortZ: new Float64Array(capacity),
    order: new Uint32Array(capacity),
    entrySlots: new Uint32Array(capacity),
  }
}

function finiteAxis(value: unknown, index: number): number {
  if (!Array.isArray(value)) return 0
  const axis: unknown = value[index]
  return typeof axis === 'number' && Number.isFinite(axis) ? axis : 0
}

function numericAt(values: ArrayLike<number>, index: number): number {
  const value = values[index]
  if (value === undefined) throw new Error(`ParticleBatch slot ${index} is outside its capacity`)
  return value
}

function spreadAxis(value: unknown, index: number): number {
  return Math.max(0, finiteAxis(value, index))
}

function finiteNonNegative(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

function alpha(value: number, fallback: number): number {
  return Math.min(1, finiteNonNegative(value, fallback))
}

function color(value: number): number {
  return Number.isFinite(value) ? Math.min(0xffffff, Math.max(0, Math.trunc(value))) : 0xffffff
}

function normalizedSeed(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) >>> 0 : 1
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

function createGeometry(capacity: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(capacity * 12)
  const uvs = new Float32Array(capacity * 8)
  const colors = new Float32Array(capacity * 16)
  const indices = new Uint32Array(capacity * 6)
  for (let slot = 0; slot < capacity; slot += 1) {
    const uv = slot * 8
    uvs.set([0, 0, 1, 0, 1, 1, 0, 1], uv)
    const vertex = slot * 4
    const index = slot * 6
    indices.set([vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3], index)
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.setDrawRange(0, 0)
  return geometry
}

/** Fixed CPU storage and one Three mesh for one Particle Emitter. */
export class ParticleBatch implements SceneDrain {
  readonly material: THREE.MeshBasicMaterial
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  active = 0

  private capacity: number
  private particles: ParticleArrays
  private rngState: number
  private nextOrdinal = 0
  private _layer: number
  private textureRevision = 0
  private drainProjection: 'isometric' | null = null
  private disposed = false

  constructor(
    capacity: number,
    seed: number,
    layer: number,
    blend: ParticleBlend,
    private readonly assets: AssetLoader,
  ) {
    this.capacity = capacity
    this.rngState = normalizedSeed(seed)
    this._layer = Number.isFinite(layer) ? layer : 0
    this.particles = particleArrays(capacity)
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      vertexColors: true,
      depthTest: true,
      depthWrite: true,
      blending: blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.mesh = new THREE.Mesh(createGeometry(capacity), this.material)
    this.mesh.frustumCulled = false
  }

  get layer(): number {
    return this._layer
  }

  setSeed(seed: number): void {
    this.rngState = normalizedSeed(seed)
  }

  setLayer(layer: number): void {
    this._layer = Number.isFinite(layer) ? layer : 0
  }

  setBlend(blend: ParticleBlend): void {
    this.material.blending = blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
    this.material.needsUpdate = true
  }

  setTexture(uri: string, pixelArt: boolean): void {
    this.textureRevision += 1
    const revision = this.textureRevision
    this.material.map?.dispose()
    this.material.map = null
    if (!uri || this.disposed) {
      this.material.needsUpdate = true
      return
    }
    const { texture, settled } = this.assets.texture(uri)
    const filter = pixelArt ? THREE.NearestFilter : THREE.LinearFilter
    texture.minFilter = filter
    texture.magFilter = filter
    this.material.map = texture
    this.material.needsUpdate = true
    reportRejection(settled.then((outcome) => {
      if (
        outcome !== 'failed' ||
        this.disposed ||
        revision !== this.textureRevision ||
        this.material.map !== texture
      ) return
      this.material.map = null
      texture.dispose()
      this.material.needsUpdate = true
    }), 'particle texture settle')
  }

  resize(capacity: number): void {
    if (this.disposed || capacity === this.capacity) return
    const previous = this.mesh.geometry
    this.capacity = capacity
    this.particles = particleArrays(capacity)
    this.active = 0
    this.mesh.geometry = createGeometry(capacity)
    previous.dispose()
  }

  emit(value: number, overflow: ParticleOverflow, spawn: ParticleSpawn): number {
    if (this.disposed || !Number.isFinite(spawn.lifetime) || spawn.lifetime <= 0) return 0
    const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    const accepted = overflow === 'drop-new'
      ? Math.min(count, this.capacity - this.active)
      : Math.min(count, this.capacity)
    if (overflow !== 'drop-new') {
      const replaced = Math.max(0, this.active + accepted - this.capacity)
      for (let index = 0; index < replaced; index += 1) this.removeOldest()
    }
    for (let index = 0; index < accepted; index += 1) this.spawn(spawn)
    return accepted
  }

  detach(context: ParticleRenderContext): void {
    for (let slot = 0; slot < this.active; slot += 1) {
      if (this.particles.local[slot] !== 1) continue
      this.particles.x[slot] = numericAt(this.particles.x, slot) + context.owner[0]
      this.particles.y[slot] = numericAt(this.particles.y, slot) + context.owner[1]
      this.particles.local[slot] = 0
    }
    this.drainProjection = context.projection
    this.sync({ owner: [0, 0], projection: this.drainProjection })
  }

  advanceDrain(dt: number): boolean {
    this.advance(dt, { owner: [0, 0], projection: this.drainProjection })
    return this.active > 0
  }

  advance(dt: number, context: ParticleRenderContext): void {
    let slot = 0
    while (slot < this.active) {
      const vx = numericAt(this.particles.vx, slot) + numericAt(this.particles.gx, slot) * dt
      const vy = numericAt(this.particles.vy, slot) + numericAt(this.particles.gy, slot) * dt
      const age = numericAt(this.particles.age, slot) + dt
      this.particles.vx[slot] = vx
      this.particles.vy[slot] = vy
      this.particles.x[slot] = numericAt(this.particles.x, slot) + vx * dt
      this.particles.y[slot] = numericAt(this.particles.y, slot) + vy * dt
      this.particles.age[slot] = age
      if (age >= numericAt(this.particles.lifetime, slot)) this.remove(slot)
      else slot += 1
    }
    this.sync(context)
  }

  sync(context: ParticleRenderContext): void {
    this.syncGeometry(context)
  }

  ySortEntries(): readonly YSortEntry[] {
    this.sortEntrySlots()
    return Array.from({ length: this.active }, (_, rank) => {
      const slot = this.particles.entrySlots[rank]
      if (slot === undefined) throw new Error(`ParticleBatch has no y-sort slot for rank ${rank}`)
      return { layer: this._layer, y: numericAt(this.particles.renderY, slot) }
    })
  }

  setSortZ(z: number): void {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let slot = 0; slot < this.active; slot += 1) this.writeSortZ(positions, slot, z)
    positions.needsUpdate = true
    this.sortIndices()
  }

  setSortZs(values: readonly number[]): void {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let rank = 0; rank < this.active; rank += 1) {
      const slot = this.particles.entrySlots[rank]
      const z = values[rank]
      if (slot === undefined || z === undefined) {
        throw new Error(`ParticleBatch has no y-sort value for rank ${rank}`)
      }
      this.writeSortZ(positions, slot, z)
    }
    positions.needsUpdate = true
    this.sortIndices()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.textureRevision += 1
    this.active = 0
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.map?.dispose()
    this.material.map = null
    this.material.dispose()
  }

  private random(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0
    let value = this.rngState
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  private spawn(config: ParticleSpawn): void {
    const slot = this.active
    const px = this.random()
    const py = this.random()
    const vx = this.random()
    const vy = this.random()
    const local = config.space === 'local'
    this.particles.x[slot] = (local ? 0 : finiteAxis(config.origin, 0))
      + (this.randomized(finiteAxis(config.positionSpread, 0), px))
    this.particles.y[slot] = (local ? 0 : finiteAxis(config.origin, 1))
      + (this.randomized(finiteAxis(config.positionSpread, 1), py))
    this.particles.vx[slot] = finiteAxis(config.velocity, 0)
      + this.randomized(spreadAxis(config.velocitySpread, 0), vx)
    this.particles.vy[slot] = finiteAxis(config.velocity, 1)
      + this.randomized(spreadAxis(config.velocitySpread, 1), vy)
    this.particles.gx[slot] = finiteAxis(config.gravity, 0)
    this.particles.gy[slot] = finiteAxis(config.gravity, 1)
    this.particles.age[slot] = 0
    this.particles.lifetime[slot] = config.lifetime
    this.particles.width[slot] = finiteNonNegative(config.width, 1)
    this.particles.height[slot] = finiteNonNegative(config.height, 1)
    this.particles.startScale[slot] = finiteNonNegative(config.startScale, 1)
    this.particles.endScale[slot] = finiteNonNegative(config.endScale, 1)
    this.particles.startColor[slot] = color(config.startColor)
    this.particles.endColor[slot] = color(config.endColor)
    this.particles.startAlpha[slot] = alpha(config.startAlpha, 1)
    this.particles.endAlpha[slot] = alpha(config.endAlpha, 0)
    this.particles.local[slot] = local ? 1 : 0
    this.particles.ordinal[slot] = this.nextOrdinal
    this.nextOrdinal += 1
    this.active += 1
  }

  private randomized(spread: number, sample: number): number {
    return (sample * 2 - 1) * Math.max(0, spread)
  }

  private removeOldest(): void {
    if (this.active === 0) return
    let oldest = 0
    for (let slot = 1; slot < this.active; slot += 1) {
      if (
        numericAt(this.particles.ordinal, slot) < numericAt(this.particles.ordinal, oldest)
      ) oldest = slot
    }
    this.remove(oldest)
  }

  private remove(slot: number): void {
    const last = this.active - 1
    if (slot !== last) {
      for (const array of Object.values(this.particles)) array[slot] = array[last] as never
    }
    this.active = last
  }

  private syncGeometry(context: ParticleRenderContext): void {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let slot = 0; slot < this.active; slot += 1) {
      const local = this.particles.local[slot] === 1
      const logicalX = numericAt(this.particles.x, slot) + (local ? context.owner[0] : 0)
      const logicalY = numericAt(this.particles.y, slot) + (local ? context.owner[1] : 0)
      const center = context.projection === 'isometric'
        ? projectIsometric(logicalX, logicalY)
        : { x: logicalX, y: logicalY }
      const progress = Math.min(
        1,
        Math.max(
          0,
          numericAt(this.particles.age, slot) / numericAt(this.particles.lifetime, slot),
        ),
      )
      const scale = lerp(
        numericAt(this.particles.startScale, slot),
        numericAt(this.particles.endScale, slot),
        progress,
      )
      const halfWidth = numericAt(this.particles.width, slot) * scale / 2
      const halfHeight = numericAt(this.particles.height, slot) * scale / 2
      const vertex = slot * 4
      const z = this._layer * 0.01
      this.particles.renderY[slot] = center.y
      this.particles.sortZ[slot] = z
      positions.setXYZ(vertex, center.x - halfWidth, center.y - halfHeight, z)
      positions.setXYZ(vertex + 1, center.x + halfWidth, center.y - halfHeight, z)
      positions.setXYZ(vertex + 2, center.x + halfWidth, center.y + halfHeight, z)
      positions.setXYZ(vertex + 3, center.x - halfWidth, center.y + halfHeight, z)
      const start = numericAt(this.particles.startColor, slot)
      const end = numericAt(this.particles.endColor, slot)
      const red = lerp((start >>> 16) & 0xff, (end >>> 16) & 0xff, progress) / 255
      const green = lerp((start >>> 8) & 0xff, (end >>> 8) & 0xff, progress) / 255
      const blue = lerp(start & 0xff, end & 0xff, progress) / 255
      const opacity = lerp(
        numericAt(this.particles.startAlpha, slot),
        numericAt(this.particles.endAlpha, slot),
        progress,
      )
      for (let corner = 0; corner < 4; corner += 1) {
        colors.setXYZW(vertex + corner, red, green, blue, opacity)
      }
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    this.sortIndices()
    this.mesh.geometry.setDrawRange(0, this.active * 6)
  }

  private writeSortZ(positions: THREE.BufferAttribute, slot: number, z: number): void {
    this.particles.sortZ[slot] = z
    const vertex = slot * 4
    for (let corner = 0; corner < 4; corner += 1) positions.setZ(vertex + corner, z)
  }

  private sortEntrySlots(): void {
    const { entrySlots, ordinal } = this.particles
    for (let slot = 0; slot < this.active; slot += 1) entrySlots[slot] = slot
    for (let rank = 1; rank < this.active; rank += 1) {
      const candidate = entrySlots[rank]
      if (candidate === undefined) continue
      let cursor = rank - 1
      while (cursor >= 0) {
        const previous = entrySlots[cursor]
        if (
          previous === undefined ||
          (ordinal[candidate] ?? Number.POSITIVE_INFINITY) >=
            (ordinal[previous] ?? Number.POSITIVE_INFINITY)
        ) break
        entrySlots[cursor + 1] = previous
        cursor -= 1
      }
      entrySlots[cursor + 1] = candidate
    }
  }

  private sortIndices(): void {
    const { order } = this.particles
    for (let slot = 0; slot < this.active; slot += 1) order[slot] = slot
    for (let index = 1; index < this.active; index += 1) {
      const candidate = order[index]
      if (candidate === undefined) continue
      let cursor = index - 1
      while (cursor >= 0) {
        const previous = order[cursor]
        if (previous === undefined || !this.before(candidate, previous)) break
        order[cursor + 1] = previous
        cursor -= 1
      }
      order[cursor + 1] = candidate
    }
    const index = this.mesh.geometry.index
    if (!index) throw new Error('ParticleBatch geometry has no index')
    for (let rank = 0; rank < this.active; rank += 1) {
      const slot = order[rank]
      if (slot === undefined) continue
      const vertex = slot * 4
      index.setX(rank * 6, vertex)
      index.setX(rank * 6 + 1, vertex + 1)
      index.setX(rank * 6 + 2, vertex + 2)
      index.setX(rank * 6 + 3, vertex)
      index.setX(rank * 6 + 4, vertex + 2)
      index.setX(rank * 6 + 5, vertex + 3)
    }
    index.needsUpdate = true
  }

  private before(left: number, right: number): boolean {
    const { sortZ, renderY, ordinal } = this.particles
    const leftZ = numericAt(sortZ, left)
    const rightZ = numericAt(sortZ, right)
    if (leftZ !== rightZ) return leftZ < rightZ
    const leftY = numericAt(renderY, left)
    const rightY = numericAt(renderY, right)
    if (leftY !== rightY) return leftY > rightY
    return numericAt(ordinal, left) < numericAt(ordinal, right)
  }
}
