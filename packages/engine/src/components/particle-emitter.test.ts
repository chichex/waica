// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import * as engine from '../index.js'
import type {
  ParticleBlend,
  ParticleDestroyMode,
  ParticleOverflow,
  ParticleSpace,
  ParticleVector,
} from '../index.js'
import { authoringDefaults } from '../authoring-defaults.js'
import { SIMULATION_STEP } from '../fixed-step.js'
import { ParticleEmitter } from './particle-emitter.js'
import {
  installParticleTestDom,
  makeParticleGame as makeGame,
  particleCenters as centers,
  particleMeshes,
} from './test-particle-emitter.js'
import type { ParticleMesh } from './test-particle-emitter.js'

beforeEach(installParticleTestDom)

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
  // Issue #78 CA-10: an Emissive emitter is never darkened by the light-map.
  emissive: false,
}

describe('ParticleEmitter public authoring API', () => {
  it('exports ParticleEmitter without changing the Emitter event bus', () => {
    expect(engine).toHaveProperty('ParticleEmitter')
    expect(engine.Emitter.name).toBe('Emitter')
  })

  it('exports the ParticleEmitter property types from the package root (CA-1)', () => {
    expectTypeOf<ParticleVector>().toEqualTypeOf<[number, number]>()
    expectTypeOf<ParticleSpace>().toEqualTypeOf<'world' | 'local'>()
    expectTypeOf<ParticleOverflow>().toEqualTypeOf<'recycle-oldest' | 'drop-new'>()
    expectTypeOf<ParticleDestroyMode>().toEqualTypeOf<'clear' | 'drain'>()
    expectTypeOf<ParticleBlend>().toEqualTypeOf<'normal' | 'additive'>()
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
  const firstCenters = centers(meshes[0] as ParticleMesh)
  expect(firstCenters).toEqual(centers(meshes[1] as ParticleMesh))
  expect(firstCenters).not.toEqual(centers(meshes[2] as ParticleMesh))
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
  expect(centers(changedMesh as ParticleMesh).slice(2)).toEqual(
    centers(freshMesh as ParticleMesh),
  )

  const noOp = game.spawn('NoOp').add(ParticleEmitter, { seed: 1, positionSpread: spread })
  const uninterrupted = game.spawn('Uninterrupted').add(ParticleEmitter, { seed: 1, positionSpread: spread })
  noOp.emit(1)
  noOp.seed = 1
  noOp.emit(1)
  uninterrupted.emit(2)
  const meshes = particleMeshes(game)
  expect(centers(meshes[2] as ParticleMesh)).toEqual(centers(meshes[3] as ParticleMesh))
  game.dispose()
})

it('enforces fixed capacity and both overflow results (CA-4)', () => {
  const game = makeGame()
  const drop = game.spawn('Drop').add(ParticleEmitter, { capacity: 3, overflow: 'drop-new' })
  expect(drop.emit(2)).toBe(2)
  expect(drop.emit(5)).toBe(1)
  expect(drop.active).toBe(3)

  const recycle = game.spawn('Recycle').add(ParticleEmitter, { capacity: 3 })
  expect(recycle.emit(2)).toBe(2)
  expect(recycle.emit(5)).toBe(3)
  expect(recycle.active).toBe(3)
  expect(drop.emit(Number.NaN)).toBe(0)
  game.dispose()
})

it('rebuilds only for normalized capacity changes without resetting samples (CA-4)', () => {
  const game = makeGame()
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
  const geometry = particleMeshes(game)[0]?.geometry
  oversized.capacity = 3
  expect(particleMeshes(game)[0]?.geometry).toBe(geometry)
  oversized.capacity = 4
  exact.capacity = 4
  expect(oversized.active).toBe(0)
  expect(particleMeshes(game)[0]?.geometry).not.toBe(geometry)
  expect(oversized.emit(1)).toBe(1)
  expect(exact.emit(1)).toBe(1)
  const meshes = particleMeshes(game)
  expect(centers(meshes[0] as ParticleMesh)).toEqual(centers(meshes[1] as ParticleMesh))

  oversized.capacity = Number.NaN
  expect(oversized.capacity).toBe(256)
  expect(oversized.active).toBe(0)
  expect(particleMeshes(game)[0]?.geometry.getAttribute('position').count).toBe(256 * 4)
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

it('rejects invalid counts and lifetimes without consuming samples (CA-4)', () => {
  const game = makeGame()
  const props = { seed: 9, positionSpread: [2, 3] as [number, number] }
  const rejected = game.spawn('Rejected').add(ParticleEmitter, { ...props, lifetime: Number.NaN })
  const replay = game.spawn('Replay').add(ParticleEmitter, props)
  expect(rejected.emit(Number.POSITIVE_INFINITY)).toBe(0)
  expect(rejected.emit(1)).toBe(0)
  rejected.lifetime = 1
  expect(rejected.emit(1)).toBe(1)
  expect(replay.emit(1)).toBe(1)
  const [rejectedMesh, replayMesh] = particleMeshes(game)
  expect(centers(rejectedMesh as ParticleMesh)).toEqual(centers(replayMesh as ParticleMesh))
  game.dispose()
})

it('sanitizes malformed authoring values without throwing or writing non-finite geometry (CA-4)', () => {
  const game = makeGame()
  const emitter = game.spawn('Malformed').add(ParticleEmitter)
  emitter.capacity = -5
  emitter.layer = Number.NaN
  emitter.positionSpread = [Number.NaN] as unknown as [number, number]
  emitter.velocity = null as unknown as [number, number]
  emitter.velocitySpread = [-4, Number.POSITIVE_INFINITY]
  emitter.gravity = {} as unknown as [number, number]
  emitter.width = -1
  emitter.height = Number.NaN
  emitter.startScale = -1
  emitter.endScale = Number.POSITIVE_INFINITY
  emitter.startColor = -10
  emitter.endColor = 0x1ffffff
  emitter.startAlpha = -2
  emitter.endAlpha = 3
  expect(emitter.capacity).toBe(1)
  expect(emitter.layer).toBe(0)
  expect(emitter.emit(1)).toBe(1)
  expect(() => emitter.onUpdate?.(0.5)).not.toThrow()
  const mesh = particleMeshes(game)[0] as ParticleMesh
  expect([...mesh.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true)
  game.dispose()
})
