import type { ParticleOverflow, ParticleSpace } from './components/particle-emitter.js'

export interface ParticleSpawn {
  origin: readonly number[]
  positionSpread: unknown
  velocity: unknown
  velocitySpread: unknown
  gravity: unknown
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

export interface ParticleArrays {
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

export function particleValueAt(values: ArrayLike<number>, index: number): number {
  const value = values[index]
  if (value === undefined) throw new Error(`Particle slot ${index} is outside its capacity`)
  return value
}

function finiteAxis(value: unknown, index: number): number {
  if (!Array.isArray(value)) return 0
  const axis: unknown = value[index]
  return typeof axis === 'number' && Number.isFinite(axis) ? axis : 0
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

function stateArrays(arrays: ParticleArrays): Array<Float64Array | Uint32Array | Uint8Array> {
  return [
    arrays.x, arrays.y, arrays.vx, arrays.vy, arrays.gx, arrays.gy,
    arrays.age, arrays.lifetime, arrays.width, arrays.height,
    arrays.startScale, arrays.endScale, arrays.startColor, arrays.endColor,
    arrays.startAlpha, arrays.endAlpha, arrays.local, arrays.ordinal,
    arrays.renderY, arrays.sortZ,
  ]
}

/** Dense, fixed-capacity CPU state and deterministic sampling for one particle batch. */
export class ParticlePool {
  active = 0
  arrays: ParticleArrays

  private rngState: number
  private nextOrdinal = 0

  constructor(private capacity: number, seed: number) {
    this.arrays = particleArrays(capacity)
    this.rngState = normalizedSeed(seed)
  }

  setSeed(seed: number): void {
    this.rngState = normalizedSeed(seed)
  }

  resize(capacity: number): boolean {
    if (capacity === this.capacity) return false
    this.capacity = capacity
    this.arrays = particleArrays(capacity)
    this.active = 0
    return true
  }

  clear(): void {
    this.active = 0
  }

  emit(value: number, overflow: ParticleOverflow, spawn: ParticleSpawn): number {
    if (!Number.isFinite(spawn.lifetime) || spawn.lifetime <= 0) return 0
    const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    const accepted = overflow === 'drop-new'
      ? Math.min(count, this.capacity - this.active)
      : Math.min(count, this.capacity)
    if (overflow !== 'drop-new') this.recycleFor(accepted)
    for (let index = 0; index < accepted; index += 1) this.spawn(spawn)
    return accepted
  }

  detach(owner: readonly [number, number]): void {
    const { local, x, y } = this.arrays
    for (let slot = 0; slot < this.active; slot += 1) {
      if (local[slot] !== 1) continue
      x[slot] = particleValueAt(x, slot) + owner[0]
      y[slot] = particleValueAt(y, slot) + owner[1]
      local[slot] = 0
    }
  }

  advance(dt: number): void {
    let slot = 0
    while (slot < this.active) {
      const age = this.advanceSlot(slot, dt)
      if (age >= particleValueAt(this.arrays.lifetime, slot)) this.remove(slot)
      else slot += 1
    }
  }

  private advanceSlot(slot: number, dt: number): number {
    const { vx, vy, gx, gy, x, y, age } = this.arrays
    const nextVx = particleValueAt(vx, slot) + particleValueAt(gx, slot) * dt
    const nextVy = particleValueAt(vy, slot) + particleValueAt(gy, slot) * dt
    const nextAge = particleValueAt(age, slot) + dt
    vx[slot] = nextVx
    vy[slot] = nextVy
    x[slot] = particleValueAt(x, slot) + nextVx * dt
    y[slot] = particleValueAt(y, slot) + nextVy * dt
    age[slot] = nextAge
    return nextAge
  }

  private random(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0
    let value = this.rngState
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  private spawn(config: ParticleSpawn): void {
    const positionX = this.random()
    const positionY = this.random()
    const velocityX = this.random()
    const velocityY = this.random()
    const slot = this.active
    const local = config.space === 'local'
    const { x, y, vx, vy, gx, gy } = this.arrays
    x[slot] = (local ? 0 : finiteAxis(config.origin, 0))
      + this.randomized(finiteAxis(config.positionSpread, 0), positionX)
    y[slot] = (local ? 0 : finiteAxis(config.origin, 1))
      + this.randomized(finiteAxis(config.positionSpread, 1), positionY)
    vx[slot] = finiteAxis(config.velocity, 0)
      + this.randomized(finiteAxis(config.velocitySpread, 0), velocityX)
    vy[slot] = finiteAxis(config.velocity, 1)
      + this.randomized(finiteAxis(config.velocitySpread, 1), velocityY)
    gx[slot] = finiteAxis(config.gravity, 0)
    gy[slot] = finiteAxis(config.gravity, 1)
    this.writeSpawnSnapshot(slot, config, local)
    this.active += 1
  }

  private writeSpawnSnapshot(slot: number, config: ParticleSpawn, local: boolean): void {
    const arrays = this.arrays
    arrays.age[slot] = 0
    arrays.lifetime[slot] = config.lifetime
    arrays.width[slot] = finiteNonNegative(config.width, 1)
    arrays.height[slot] = finiteNonNegative(config.height, 1)
    arrays.startScale[slot] = finiteNonNegative(config.startScale, 1)
    arrays.endScale[slot] = finiteNonNegative(config.endScale, 1)
    arrays.startColor[slot] = color(config.startColor)
    arrays.endColor[slot] = color(config.endColor)
    arrays.startAlpha[slot] = alpha(config.startAlpha, 1)
    arrays.endAlpha[slot] = alpha(config.endAlpha, 0)
    arrays.local[slot] = local ? 1 : 0
    arrays.ordinal[slot] = this.nextOrdinal
    this.nextOrdinal += 1
  }

  private randomized(spread: number, sample: number): number {
    return (sample * 2 - 1) * Math.max(0, spread)
  }

  private recycleFor(accepted: number): void {
    const replaced = Math.max(0, this.active + accepted - this.capacity)
    for (let index = 0; index < replaced; index += 1) this.removeOldest()
  }

  private removeOldest(): void {
    if (this.active === 0) return
    let oldest = 0
    for (let slot = 1; slot < this.active; slot += 1) {
      if (particleValueAt(this.arrays.ordinal, slot) < particleValueAt(this.arrays.ordinal, oldest)) {
        oldest = slot
      }
    }
    this.remove(oldest)
  }

  private remove(slot: number): void {
    const last = this.active - 1
    if (slot !== last) {
      for (const array of stateArrays(this.arrays)) array[slot] = particleValueAt(array, last)
    }
    this.active = last
  }
}
