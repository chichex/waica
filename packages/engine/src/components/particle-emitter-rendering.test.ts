// @vitest-environment happy-dom
import { AdditiveBlending, LinearFilter, NearestFilter } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { FakeTextureBackend, flush } from '../assets/test-helpers.js'
import { ParticleEmitter } from './particle-emitter.js'
import {
  installParticleTestDom,
  makeParticleGame,
  particleCenters,
  particleMeshes,
} from './test-particle-emitter.js'
import type { ParticleMesh } from './test-particle-emitter.js'

beforeEach(installParticleTestDom)
afterEach(() => vi.unstubAllGlobals())

interface FixedStorage {
  geometry: ParticleMesh['geometry']
  material: ParticleMesh['material']
  position: ArrayLike<number>
  uv: ArrayLike<number>
  color: ArrayLike<number>
  index: ArrayLike<number> | undefined
}

function expectFixedStorage(mesh: ParticleMesh, storage: FixedStorage): void {
  expect(mesh.geometry).toBe(storage.geometry)
  expect(mesh.material).toBe(storage.material)
  expect(mesh.geometry.getAttribute('position').array).toBe(storage.position)
  expect(mesh.geometry.getAttribute('uv').array).toBe(storage.uv)
  expect(mesh.geometry.getAttribute('color').array).toBe(storage.color)
  expect(mesh.geometry.index?.array).toBe(storage.index)
  expect(mesh.geometry.groups).toEqual([])
  expect(mesh.geometry.drawRange).toEqual({ start: 0, count: 6 })
  expect(storage.position).toHaveLength(2 * 12)
  expect(storage.uv).toHaveLength(2 * 8)
  expect(storage.color).toHaveLength(2 * 16)
  expect(storage.index).toHaveLength(2 * 6)
}

it('keeps one fixed mesh, material and buffers until capacity changes (CA-8)', () => {
  const game = makeParticleGame()
  const emitter = game.spawn('Batch').add(ParticleEmitter, { capacity: 2, lifetime: 2 })
  const mesh = particleMeshes(game)[0] as ParticleMesh
  const storage: FixedStorage = {
    geometry: mesh.geometry,
    material: mesh.material,
    position: mesh.geometry.getAttribute('position').array,
    uv: mesh.geometry.getAttribute('uv').array,
    color: mesh.geometry.getAttribute('color').array,
    index: mesh.geometry.index?.array,
  }

  expect(emitter.emit(1)).toBe(1)
  emitter.layer = 4
  expect(mesh.geometry.getAttribute('position').getZ(0)).toBe(Math.fround(0.04))
  emitter.onUpdate?.(0.25)
  expect(game.entities).toHaveLength(1)
  expect(particleMeshes(game)).toEqual([mesh])
  expectFixedStorage(mesh, storage)

  emitter.capacity = 3
  expect(mesh).toBe(particleMeshes(game)[0])
  expect(mesh.material).toBe(storage.material)
  expect(mesh.geometry).not.toBe(storage.geometry)
  expect(mesh.geometry.getAttribute('position').array).toHaveLength(3 * 12)
  game.dispose()
})

it('keeps transparent sort bounds aligned with the active particle depth (CA-8, CA-9)', () => {
  const game = makeParticleGame()
  const emitter = game.spawn('Sorted batch').add(ParticleEmitter)
  emitter.emit(1)
  const geometry = (particleMeshes(game)[0] as ParticleMesh).geometry
  geometry.computeBoundingSphere()
  expect(geometry.boundingSphere?.center.z).toBe(0)

  emitter.layer = 2
  expect(geometry.boundingSphere?.center.z).toBeCloseTo(0.02)
  emitter.setSortZs([0.015])
  expect(geometry.boundingSphere?.center.z).toBeCloseTo(0.015)
  game.dispose()
})

it('reactively replaces filtering and blending without clearing particles (CA-10)', () => {
  const backend = new FakeTextureBackend()
  const game = makeParticleGame(backend)
  const emitter = game.spawn('Textured').add(ParticleEmitter)
  const mesh = particleMeshes(game)[0] as ParticleMesh
  const material = mesh.material
  emitter.emit(2)

  expect(backend.loadCalls).toEqual([])
  expect(material.map).toBeNull()
  emitter.texture = '/first.png'
  const first = material.map
  if (!first) throw new Error('expected first texture clone')
  expect(first.minFilter).toBe(LinearFilter)
  expect(first.magFilter).toBe(LinearFilter)
  const disposeFirst = vi.spyOn(first, 'dispose')

  emitter.pixelArt = true
  const nearest = material.map
  if (!nearest) throw new Error('expected nearest texture clone')
  expect(nearest).not.toBe(first)
  expect(disposeFirst).toHaveBeenCalledTimes(1)
  expect(nearest.minFilter).toBe(NearestFilter)
  expect(nearest.magFilter).toBe(NearestFilter)
  emitter.blend = 'additive'
  expect(material.blending).toBe(AdditiveBlending)
  expect(mesh.material).toBe(material)
  expect(emitter.active).toBe(2)
  game.dispose()
})

it('ignores replaced settlements and falls back after a current texture failure (CA-10)', async () => {
  const backend = new FakeTextureBackend()
  backend.hold('/held.png')
  backend.failUrl('/broken.png')
  const game = makeParticleGame(backend)
  const emitter = game.spawn('Textured').add(ParticleEmitter)
  const material = (particleMeshes(game)[0] as ParticleMesh).material

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
  game.dispose()
})

it('does not let a late texture settlement resurrect a destroyed emitter (CA-10)', async () => {
  const backend = new FakeTextureBackend()
  backend.hold('/held.png')
  const game = makeParticleGame(backend)
  const entity = game.spawn('Destroyed texture')
  entity.add(ParticleEmitter, { texture: '/held.png' })
  const material = (particleMeshes(game)[0] as ParticleMesh).material
  const texture = material.map
  if (!texture) throw new Error('expected held texture clone')
  const disposeTexture = vi.spyOn(texture, 'dispose')

  entity.destroy()
  expect(material.map).toBeNull()
  expect(disposeTexture).toHaveBeenCalledTimes(1)
  backend.release('/held.png')
  await flush()

  expect(material.map).toBeNull()
  expect(disposeTexture).toHaveBeenCalledTimes(1)
  game.dispose()
})

function changeFutureSpawnProps(emitter: ParticleEmitter): void {
  emitter.velocity = [100, 100]
  emitter.gravity = [100, 100]
  emitter.lifetime = 10
  emitter.width = 100
  emitter.endScale = 10
  emitter.endColor = 0xff0000
  emitter.endAlpha = 1
}

function expectMidpointQuad(mesh: ParticleMesh): void {
  expect(particleCenters(mesh)).toEqual([6, -2])
  const positions = mesh.geometry.getAttribute('position')
  expect(positions.getX(1) - positions.getX(0)).toBe(4)
  expect(positions.getY(2) - positions.getY(1)).toBe(8)
  const colors = mesh.geometry.getAttribute('color')
  expect([colors.getX(0), colors.getY(0), colors.getZ(0), colors.getW(0)]).toEqual([
    0.5, 0.5, 0.5, 0.5,
  ])
}

it('uses spawn snapshots, semi-implicit Euler and midpoint interpolation (CA-5, CA-7)', () => {
  const game = makeParticleGame()
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
  changeFutureSpawnProps(emitter)
  emitter.onUpdate?.(1)

  const mesh = particleMeshes(game)[0] as ParticleMesh
  expectMidpointQuad(mesh)

  expect(emitter.emit(1)).toBe(1)
  emitter.onUpdate?.(1)
  expect(emitter.active).toBe(1)
  game.dispose()
})
