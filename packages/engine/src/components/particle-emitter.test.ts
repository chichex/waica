// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    readonly domElement: HTMLCanvasElement
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setViewport(): void {}
    setScissor(): void {}
    setScissorTest(): void {}
    setClearColor(): void {}
    clear(): void {}
    render(): void {}
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import * as THREE from 'three'
import * as engine from '../index.js'
import { authoringDefaults } from '../authoring-defaults.js'
import { FakeTextureBackend, flush } from '../assets/test-helpers.js'
import type { TextureBackend } from '../assets/texture-backend.js'
import { SIMULATION_STEP } from '../fixed-step.js'
import { Game } from '../game.js'
import { ParticleEmitter } from './particle-emitter.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(textures?: TextureBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas, ...(textures ? { textures } : {}) })
}

function particleMeshes(game: Game): Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>> {
  return game.scene.children.filter(
    (child): child is THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> =>
      child instanceof THREE.Mesh,
  )
}

function centers(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>): number[] {
  const positions = mesh.geometry.getAttribute('position')
  const result: number[] = []
  for (let slot = 0; slot < mesh.geometry.drawRange.count / 6; slot += 1) {
    const first = slot * 4
    result.push(
      (positions.getX(first) + positions.getX(first + 1) + positions.getX(first + 2) + positions.getX(first + 3)) / 4,
      (positions.getY(first) + positions.getY(first + 1) + positions.getY(first + 2) + positions.getY(first + 3)) / 4,
    )
  }
  return result
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const EXPECTED_DEFAULTS = {
  rate: 0,
  emitting: true,
  lifetime: 1,
  positionSpread: [0, 0],
  velocity: [0, 0],
  velocitySpread: [0, 0],
  gravity: [0, 0],
  space: 'world',
  seed: 1,
  capacity: 256,
  overflow: 'recycle-oldest',
  destroyMode: 'clear',
  width: 1,
  height: 1,
  startScale: 1,
  endScale: 1,
  startColor: 0xffffff,
  endColor: 0xffffff,
  startAlpha: 1,
  endAlpha: 0,
  texture: '',
  pixelArt: false,
  blend: 'normal',
  layer: 0,
}

describe('ParticleEmitter public authoring API', () => {
  it('exports ParticleEmitter without changing the Emitter event bus', () => {
    expect(engine).toHaveProperty('ParticleEmitter')
    expect(engine.Emitter.name).toBe('Emitter')
  })

  it('exposes only the confirmed authoring defaults and generic param metadata (CA-1)', () => {
    expect(authoringDefaults(ParticleEmitter)).toEqual(EXPECTED_DEFAULTS)
    expect(ParticleEmitter.params).toMatchObject({
      positionSpread: { kind: 'vector2' },
      velocity: { kind: 'vector2' },
      velocitySpread: { kind: 'vector2' },
      gravity: { kind: 'vector2' },
      startColor: { kind: 'color' },
      endColor: { kind: 'color' },
      texture: { kind: 'texture' },
      space: { options: ['world', 'local'] },
      overflow: { options: ['recycle-oldest', 'drop-new'] },
      destroyMode: { options: ['clear', 'drain'] },
      blend: { options: ['normal', 'additive'] },
    })
  })
})

describe('ParticleEmitter emission', () => {
  it('starts empty, accumulates continuous rate by Simulation Step, and lets bursts bypass pause (CA-2)', () => {
    const game = makeGame()
    const emitter = game.spawn('Smoke').add(ParticleEmitter, { rate: 30 })

    expect(emitter.inspectState?.()).toEqual({ active: 0, capacity: 256, emitting: true })
    emitter.onUpdate?.(SIMULATION_STEP)
    expect(emitter.inspectState?.()).toEqual({ active: 0, capacity: 256, emitting: true })

    emitter.emitting = false
    expect(emitter.emit(2)).toBe(2)
    emitter.onUpdate?.(SIMULATION_STEP)
    expect(emitter.active).toBe(2)

    emitter.emitting = true
    emitter.onUpdate?.(SIMULATION_STEP)
    expect(emitter.active).toBe(3)

    const sixty = game.spawn('Sparks').add(ParticleEmitter, { rate: 60 })
    sixty.onUpdate?.(SIMULATION_STEP)
    expect(sixty.active).toBe(1)
    game.dispose()
  })

  it('samples deterministic Mulberry32 position spreads without Math.random (CA-3)', () => {
    const random = vi.spyOn(Math, 'random')
    const game = makeGame()
    const props = { seed: 1, positionSpread: [2, 3] as [number, number] }
    const first = game.spawn('First').add(ParticleEmitter, props)
    const replay = game.spawn('Replay').add(ParticleEmitter, props)
    const different = game.spawn('Different').add(ParticleEmitter, { ...props, seed: 2 })
    // Three assigns UUIDs while constructing Object3D instances; particle sampling begins here.
    random.mockClear()

    expect(first.emit(2)).toBe(2)
    expect(replay.emit(2)).toBe(2)
    expect(different.emit(2)).toBe(2)

    const meshes = particleMeshes(game)
    expect(meshes).toHaveLength(3)
    const firstCenters = centers(meshes[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>)
    expect(firstCenters).toEqual(centers(meshes[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>))
    expect(firstCenters).not.toEqual(centers(meshes[2] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>))
    expect(firstCenters[0]).toBe(
      (Math.fround(0.5082957624 - 0.5) + Math.fround(0.5082957624 + 0.5)) / 2,
    )
    expect(firstCenters[1]).toBe(
      (Math.fround(-2.9835856729 - 0.5) + Math.fround(-2.9835856729 + 0.5)) / 2,
    )
    expect(random).not.toHaveBeenCalled()
    game.dispose()
  })

  it('restarts only future samples when seed changes and keeps the sequence on a no-op assignment (CA-3)', () => {
    const game = makeGame()
    const spread: [number, number] = [2, 3]
    const changed = game.spawn('Changed').add(ParticleEmitter, { seed: 1, positionSpread: spread })
    const fresh = game.spawn('Fresh').add(ParticleEmitter, { seed: 2, positionSpread: spread })
    expect(changed.emit(1)).toBe(1)
    changed.seed = 2
    expect(changed.emit(1)).toBe(1)
    expect(fresh.emit(1)).toBe(1)

    const [changedMesh, freshMesh] = particleMeshes(game)
    expect(centers(changedMesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).slice(2)).toEqual(
      centers(freshMesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>),
    )

    const noOp = game.spawn('NoOp').add(ParticleEmitter, { seed: 1, positionSpread: spread })
    const uninterrupted = game.spawn('Uninterrupted').add(ParticleEmitter, { seed: 1, positionSpread: spread })
    noOp.emit(1)
    noOp.seed = 1
    noOp.emit(1)
    uninterrupted.emit(2)
    const meshes = particleMeshes(game)
    expect(centers(meshes[2] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>)).toEqual(
      centers(meshes[3] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>),
    )
    game.dispose()
  })

  it('enforces fixed capacity, overflow results, and capacity rebuild semantics (CA-4)', () => {
    const game = makeGame()
    const drop = game.spawn('Drop').add(ParticleEmitter, {
      capacity: 3,
      overflow: 'drop-new',
      positionSpread: [2, 3],
    })
    expect(drop.emit(2)).toBe(2)
    expect(drop.emit(5)).toBe(1)
    expect(drop.active).toBe(3)

    const recycle = game.spawn('Recycle').add(ParticleEmitter, { capacity: 3 })
    expect(recycle.emit(2)).toBe(2)
    expect(recycle.emit(5)).toBe(3)
    expect(recycle.active).toBe(3)

    const [dropMesh, recycleMesh] = particleMeshes(game)
    const sameGeometry = recycleMesh?.geometry
    recycle.capacity = 3
    expect(recycle.active).toBe(3)
    expect(recycleMesh?.geometry).toBe(sameGeometry)
    recycle.capacity = 4
    expect(recycle.active).toBe(0)
    expect(recycleMesh?.geometry).not.toBe(sameGeometry)

    const oversized = game.spawn('Oversized').add(ParticleEmitter, {
      capacity: 3,
      positionSpread: [2, 3],
    })
    const exact = game.spawn('Exact').add(ParticleEmitter, {
      capacity: 3,
      positionSpread: [2, 3],
    })
    expect(oversized.emit(50)).toBe(3)
    expect(exact.emit(3)).toBe(3)
    oversized.capacity = 4
    exact.capacity = 4
    expect(oversized.emit(1)).toBe(1)
    expect(exact.emit(1)).toBe(1)
    const meshes = particleMeshes(game)
    expect(centers(meshes[2] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>)).toEqual(
      centers(meshes[3] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>),
    )

    expect(drop.emit(Number.NaN)).toBe(0)
    drop.capacity = Number.NaN
    expect(drop.capacity).toBe(256)
    expect(drop.active).toBe(0)
    expect(dropMesh?.geometry.getAttribute('position').count).toBe(256 * 4)
    game.dispose()
  })

  it('consumes rejected continuous requests without carrying backlog (CA-2)', () => {
    const game = makeGame()
    const emitter = game.spawn('No backlog').add(ParticleEmitter, {
      capacity: 1,
      overflow: 'drop-new',
      lifetime: 100,
      rate: 2,
    })

    emitter.onUpdate?.(0.75)
    expect(emitter.active).toBe(1)
    emitter.onUpdate?.(0.25)
    expect(emitter.active).toBe(1)
    emitter.capacity = 2
    emitter.onUpdate?.(0.25)
    expect(emitter.active).toBe(0)
    emitter.onUpdate?.(0.25)
    expect(emitter.active).toBe(1)
    game.dispose()
  })

  it('sanitizes malformed authoring values and rejects invalid counts/lifetimes without samples (CA-4, CA-14)', () => {
    const game = makeGame()
    const rejected = game.spawn('Rejected').add(ParticleEmitter, {
      seed: 9,
      lifetime: Number.NaN,
      positionSpread: [2, 3],
    })
    const replay = game.spawn('Replay').add(ParticleEmitter, {
      seed: 9,
      positionSpread: [2, 3],
    })

    expect(rejected.emit(Number.POSITIVE_INFINITY)).toBe(0)
    expect(rejected.emit(1)).toBe(0)
    rejected.lifetime = 1
    expect(rejected.emit(1)).toBe(1)
    expect(replay.emit(1)).toBe(1)
    const [rejectedMesh, replayMesh] = particleMeshes(game)
    expect(centers(rejectedMesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>)).toEqual(
      centers(replayMesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>),
    )

    rejected.capacity = -5
    rejected.layer = Number.NaN
    rejected.positionSpread = [Number.NaN] as unknown as [number, number]
    rejected.velocity = null as unknown as [number, number]
    rejected.velocitySpread = [-4, Number.POSITIVE_INFINITY]
    rejected.gravity = {} as unknown as [number, number]
    rejected.width = -1
    rejected.height = Number.NaN
    rejected.startScale = -1
    rejected.endScale = Number.POSITIVE_INFINITY
    rejected.startColor = -10
    rejected.endColor = 0x1ffffff
    rejected.startAlpha = -2
    rejected.endAlpha = 3
    expect(rejected.capacity).toBe(1)
    expect(rejected.layer).toBe(0)
    expect(rejected.emit(1)).toBe(1)
    expect(() => rejected.onUpdate?.(0.5)).not.toThrow()
    const values = rejectedMesh?.geometry.getAttribute('position').array ?? []
    expect([...values].every(Number.isFinite)).toBe(true)
    game.dispose()
  })

  it('keeps one fixed mesh and fixed buffers until capacity changes (CA-8)', () => {
    const game = makeGame()
    const emitter = game.spawn('Batch').add(ParticleEmitter, { capacity: 2, lifetime: 2 })
    const mesh = particleMeshes(game)[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
    const geometry = mesh.geometry
    const material = mesh.material
    const positionArray = geometry.getAttribute('position').array
    const uvArray = geometry.getAttribute('uv').array
    const colorArray = geometry.getAttribute('color').array
    const indexArray = geometry.index?.array

    expect(emitter.emit(1)).toBe(1)
    emitter.layer = 4
    expect(geometry.getAttribute('position').getZ(0)).toBe(Math.fround(0.04))
    emitter.onUpdate?.(0.25)
    expect(game.entities).toHaveLength(1)
    expect(particleMeshes(game)).toEqual([mesh])
    expect(mesh.geometry).toBe(geometry)
    expect(mesh.material).toBe(material)
    expect(mesh.geometry.getAttribute('position').array).toBe(positionArray)
    expect(mesh.geometry.getAttribute('uv').array).toBe(uvArray)
    expect(mesh.geometry.getAttribute('color').array).toBe(colorArray)
    expect(mesh.geometry.index?.array).toBe(indexArray)
    expect(mesh.geometry.groups).toEqual([])
    expect(mesh.geometry.drawRange).toEqual({ start: 0, count: 6 })
    expect(positionArray).toHaveLength(2 * 12)
    expect(uvArray).toHaveLength(2 * 8)
    expect(colorArray).toHaveLength(2 * 16)
    expect(indexArray).toHaveLength(2 * 6)

    emitter.capacity = 3
    expect(mesh).toBe(particleMeshes(game)[0])
    expect(mesh.material).toBe(material)
    expect(mesh.geometry).not.toBe(geometry)
    expect(mesh.geometry.getAttribute('position').array).toHaveLength(3 * 12)
    game.dispose()
  })

  it('reactively replaces texture/filter/blend resources without clearing particles (CA-10)', async () => {
    const backend = new FakeTextureBackend()
    backend.hold('/held.png')
    backend.failUrl('/broken.png')
    const game = makeGame(backend)
    const emitter = game.spawn('Textured').add(ParticleEmitter)
    const mesh = particleMeshes(game)[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
    const material = mesh.material
    emitter.emit(2)

    expect(backend.loadCalls).toEqual([])
    expect(material.map).toBeNull()

    emitter.texture = '/first.png'
    const first = material.map
    if (!first) throw new Error('expected first texture clone')
    expect(first.minFilter).toBe(THREE.LinearFilter)
    expect(first.magFilter).toBe(THREE.LinearFilter)
    const disposeFirst = vi.spyOn(first, 'dispose')

    emitter.pixelArt = true
    const nearest = material.map
    if (!nearest) throw new Error('expected nearest texture clone')
    expect(nearest).not.toBe(first)
    expect(disposeFirst).toHaveBeenCalledTimes(1)
    expect(nearest.minFilter).toBe(THREE.NearestFilter)
    expect(nearest.magFilter).toBe(THREE.NearestFilter)

    emitter.texture = '/held.png'
    const held = material.map
    emitter.texture = '/current.png'
    const current = material.map
    backend.release('/held.png')
    await flush()
    expect(material.map).toBe(current)
    expect(material.map).not.toBe(held)

    emitter.texture = '/broken.png'
    const broken = material.map
    if (!broken) throw new Error('expected failed texture clone before settlement')
    const disposeBroken = vi.spyOn(broken, 'dispose')
    await flush()
    expect(material.map).toBeNull()
    expect(disposeBroken).toHaveBeenCalledTimes(1)

    emitter.blend = 'additive'
    expect(material.blending).toBe(THREE.AdditiveBlending)
    expect(mesh.material).toBe(material)
    expect(emitter.active).toBe(2)
    game.dispose()
  })

  it('simulates snapshots with semi-implicit Euler and interpolates the quad at half life (CA-5, CA-7)', () => {
    const game = makeGame()
    const emitter = game.spawn('Trail').add(ParticleEmitter, {
      lifetime: 2,
      velocity: [4, 0],
      gravity: [2, -2],
      width: 2,
      height: 4,
      startScale: 1,
      endScale: 3,
      startColor: 0x000000,
      endColor: 0xffffff,
      startAlpha: 1,
      endAlpha: 0,
    })
    expect(emitter.emit(1)).toBe(1)

    emitter.velocity = [100, 100]
    emitter.gravity = [100, 100]
    emitter.lifetime = 10
    emitter.width = 100
    emitter.endScale = 10
    emitter.endColor = 0xff0000
    emitter.endAlpha = 1
    emitter.onUpdate?.(1)

    const mesh = particleMeshes(game)[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
    expect(centers(mesh)).toEqual([6, -2])
    const positions = mesh.geometry.getAttribute('position')
    expect(positions.getX(1) - positions.getX(0)).toBe(4)
    expect(positions.getY(2) - positions.getY(1)).toBe(8)
    const colors = mesh.geometry.getAttribute('color')
    expect([colors.getX(0), colors.getY(0), colors.getZ(0), colors.getW(0)]).toEqual([
      0.5,
      0.5,
      0.5,
      0.5,
    ])

    expect(emitter.emit(1)).toBe(1)
    emitter.onUpdate?.(1)
    expect(emitter.active).toBe(1)
    game.dispose()
  })
})
