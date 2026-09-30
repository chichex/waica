import * as THREE from 'three'
import { reportRejection } from './report-rejection.js'
import type { AssetLoader } from './assets/asset-loader.js'
import type { ParticleBlend, ParticleOverflow } from './components/particle-emitter.js'
import {
  ParticlePool,
  particleValueAt,
  type ParticleArrays,
  type ParticleSpawn,
} from './particle-pool.js'
import { projectIsometric } from './projection.js'
import { refreshParticleSortBounds } from './particle-sort-bounds.js'
import type { YSortEntry } from './render-sort.js'
import type { SceneDrain } from './scene-drains.js'

export type { ParticleSpawn } from './particle-pool.js'

export interface ParticleRenderContext {
  owner: readonly [number, number]
  projection: 'isometric' | null
}

interface ParticleBatchOptions {
  capacity: number
  seed: number
  layer: number
  blend: ParticleBlend
  assets: AssetLoader
}

interface SyncSlotOptions {
  positions: THREE.BufferAttribute
  colors: THREE.BufferAttribute
  slot: number
  context: ParticleRenderContext
}

interface WriteColorOptions {
  colors: THREE.BufferAttribute
  vertex: number
  slot: number
  progress: number
  arrays: ParticleArrays
}

function createGeometry(capacity: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const uvs = new Float32Array(capacity * 8)
  const indices = new Uint32Array(capacity * 6)
  for (let slot = 0; slot < capacity; slot += 1) {
    uvs.set([0, 0, 1, 0, 1, 1, 0, 1], slot * 8)
    const vertex = slot * 4
    indices.set([vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3], slot * 6)
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 12), 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 16), 4))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.setDrawRange(0, 0)
  return geometry
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

/** Fixed Three resources around one dense CPU particle pool. */
export class ParticleBatch implements SceneDrain {
  readonly material: THREE.MeshBasicMaterial
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

  private readonly pool: ParticlePool
  private readonly assets: AssetLoader
  private _layer: number
  private textureRevision = 0
  private drainProjection: 'isometric' | null = null
  private disposed = false

  constructor({ capacity, seed, layer, blend, assets }: ParticleBatchOptions) {
    this.pool = new ParticlePool(capacity, seed)
    this.assets = assets
    this._layer = Number.isFinite(layer) ? layer : 0
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

  get active(): number {
    return this.pool.active
  }

  get layer(): number {
    return this._layer
  }

  setSeed(seed: number): void {
    this.pool.setSeed(seed)
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
    reportRejection(settled.then((outcome) => this.settleTexture(outcome, revision, texture)), 'particle texture settle')
  }

  resize(capacity: number): void {
    if (this.disposed || !this.pool.resize(capacity)) return
    const previous = this.mesh.geometry
    this.mesh.geometry = createGeometry(capacity)
    previous.dispose()
  }

  emit(value: number, overflow: ParticleOverflow, spawn: ParticleSpawn): number {
    if (this.disposed) return 0
    return this.pool.emit(value, overflow, spawn)
  }

  detach(context: ParticleRenderContext): void {
    this.pool.detach(context.owner)
    this.drainProjection = context.projection
    this.sync({ owner: [0, 0], projection: this.drainProjection })
  }

  advanceDrain(dt: number): boolean {
    this.advance(dt, { owner: [0, 0], projection: this.drainProjection })
    return this.active > 0
  }

  advance(dt: number, context: ParticleRenderContext): void {
    this.pool.advance(dt)
    this.sync(context)
  }

  sync(context: ParticleRenderContext): void {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let slot = 0; slot < this.active; slot += 1) {
      this.syncSlot({ positions, colors, slot, context })
    }
    refreshParticleSortBounds(this.mesh.geometry, this.active, this._layer * 0.01)
    positions.needsUpdate = true
    colors.needsUpdate = true
    this.sortIndices()
    this.mesh.geometry.setDrawRange(0, this.active * 6)
  }

  ySortEntries(): readonly YSortEntry[] {
    this.sortEntrySlots()
    const { entrySlots, renderY } = this.pool.arrays
    return Array.from({ length: this.active }, (_, rank) => {
      const slot = particleValueAt(entrySlots, rank)
      return { layer: this._layer, y: particleValueAt(renderY, slot) }
    })
  }

  setSortZ(z: number): void {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let slot = 0; slot < this.active; slot += 1) this.writeSortZ(positions, slot, z)
    refreshParticleSortBounds(this.mesh.geometry, this.active, this._layer * 0.01)
    positions.needsUpdate = true
    this.sortIndices()
  }

  setSortZs(values: readonly number[]): void {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let rank = 0; rank < this.active; rank += 1) {
      const slot = particleValueAt(this.pool.arrays.entrySlots, rank)
      const z = values[rank]
      if (z === undefined) throw new Error(`ParticleBatch has no y-sort value for rank ${rank}`)
      this.writeSortZ(positions, slot, z)
    }
    refreshParticleSortBounds(this.mesh.geometry, this.active, this._layer * 0.01)
    positions.needsUpdate = true
    this.sortIndices()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.textureRevision += 1
    this.pool.clear()
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.map?.dispose()
    this.material.map = null
    this.material.dispose()
  }

  private settleTexture(outcome: 'loaded' | 'failed', revision: number, texture: THREE.Texture): void {
    if (
      outcome !== 'failed' || this.disposed || revision !== this.textureRevision
      || this.material.map !== texture
    ) return
    this.material.map = null
    texture.dispose()
    this.material.needsUpdate = true
  }

  private syncSlot({ positions, colors, slot, context }: SyncSlotOptions): void {
    const arrays = this.pool.arrays
    const local = arrays.local[slot] === 1
    const logicalX = particleValueAt(arrays.x, slot) + (local ? context.owner[0] : 0)
    const logicalY = particleValueAt(arrays.y, slot) + (local ? context.owner[1] : 0)
    const center = context.projection === 'isometric'
      ? projectIsometric(logicalX, logicalY)
      : { x: logicalX, y: logicalY }
    const progress = Math.min(1, Math.max(0,
      particleValueAt(arrays.age, slot) / particleValueAt(arrays.lifetime, slot),
    ))
    const scale = lerp(
      particleValueAt(arrays.startScale, slot),
      particleValueAt(arrays.endScale, slot),
      progress,
    )
    const halfWidth = particleValueAt(arrays.width, slot) * scale / 2
    const halfHeight = particleValueAt(arrays.height, slot) * scale / 2
    const vertex = slot * 4
    const z = this._layer * 0.01
    arrays.renderY[slot] = center.y
    arrays.sortZ[slot] = z
    positions.setXYZ(vertex, center.x - halfWidth, center.y - halfHeight, z)
    positions.setXYZ(vertex + 1, center.x + halfWidth, center.y - halfHeight, z)
    positions.setXYZ(vertex + 2, center.x + halfWidth, center.y + halfHeight, z)
    positions.setXYZ(vertex + 3, center.x - halfWidth, center.y + halfHeight, z)
    this.writeColor({ colors, vertex, slot, progress, arrays })
  }

  private writeColor({ colors, vertex, slot, progress, arrays }: WriteColorOptions): void {
    const start = particleValueAt(arrays.startColor, slot)
    const end = particleValueAt(arrays.endColor, slot)
    const red = lerp((start >>> 16) & 0xff, (end >>> 16) & 0xff, progress) / 255
    const green = lerp((start >>> 8) & 0xff, (end >>> 8) & 0xff, progress) / 255
    const blue = lerp(start & 0xff, end & 0xff, progress) / 255
    const opacity = lerp(
      particleValueAt(arrays.startAlpha, slot),
      particleValueAt(arrays.endAlpha, slot),
      progress,
    )
    for (let corner = 0; corner < 4; corner += 1) {
      colors.setXYZW(vertex + corner, red, green, blue, opacity)
    }
  }

  private writeSortZ(positions: THREE.BufferAttribute, slot: number, z: number): void {
    this.pool.arrays.sortZ[slot] = z
    const vertex = slot * 4
    for (let corner = 0; corner < 4; corner += 1) positions.setZ(vertex + corner, z)
  }

  private sortEntrySlots(): void {
    const { entrySlots, ordinal } = this.pool.arrays
    for (let slot = 0; slot < this.active; slot += 1) entrySlots[slot] = slot
    for (let rank = 1; rank < this.active; rank += 1) {
      const candidate = particleValueAt(entrySlots, rank)
      let cursor = rank - 1
      while (cursor >= 0) {
        const previous = particleValueAt(entrySlots, cursor)
        if (particleValueAt(ordinal, candidate) >= particleValueAt(ordinal, previous)) break
        entrySlots[cursor + 1] = previous
        cursor -= 1
      }
      entrySlots[cursor + 1] = candidate
    }
  }

  private sortIndices(): void {
    const { order } = this.pool.arrays
    for (let slot = 0; slot < this.active; slot += 1) order[slot] = slot
    for (let rank = 1; rank < this.active; rank += 1) this.insertIndex(rank, order)
    const index = this.mesh.geometry.index
    if (!index) throw new Error('ParticleBatch geometry has no index')
    for (let rank = 0; rank < this.active; rank += 1) {
      const vertex = particleValueAt(order, rank) * 4
      index.setX(rank * 6, vertex)
      index.setX(rank * 6 + 1, vertex + 1)
      index.setX(rank * 6 + 2, vertex + 2)
      index.setX(rank * 6 + 3, vertex)
      index.setX(rank * 6 + 4, vertex + 2)
      index.setX(rank * 6 + 5, vertex + 3)
    }
    index.needsUpdate = true
  }

  private insertIndex(rank: number, order: Uint32Array): void {
    const candidate = particleValueAt(order, rank)
    let cursor = rank - 1
    while (cursor >= 0) {
      const previous = particleValueAt(order, cursor)
      if (!this.before(candidate, previous)) break
      order[cursor + 1] = previous
      cursor -= 1
    }
    order[cursor + 1] = candidate
  }

  private before(left: number, right: number): boolean {
    const { sortZ, renderY, ordinal } = this.pool.arrays
    const leftZ = particleValueAt(sortZ, left)
    const rightZ = particleValueAt(sortZ, right)
    if (leftZ !== rightZ) return leftZ < rightZ
    const leftY = particleValueAt(renderY, left)
    const rightY = particleValueAt(renderY, right)
    if (leftY !== rightY) return leftY > rightY
    return particleValueAt(ordinal, left) < particleValueAt(ordinal, right)
  }
}
