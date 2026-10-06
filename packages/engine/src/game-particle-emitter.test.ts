// @vitest-environment happy-dom
import { Mesh, MeshBasicMaterial } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { ParticleEmitter } from './components/particle-emitter.js'
import { Sprite } from './components/sprite.js'
import { SIMULATION_STEP } from './fixed-step.js'
import type { Game } from './game.js'
import { isYSortBatchParticipant } from './render-sort.js'
import { loadScene } from './scene.js'
import {
  installParticleTestDom,
  makeParticleGame as makeGame,
  particleCenters,
  particleMesh,
  particleMeshes,
} from './components/test-particle-emitter.js'

function runFrame(game: Game, steps: number): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(steps)
}

function renderWithoutSimulation(game: Game): void {
  game.simulate = false
  runFrame(game, 0)
}

beforeEach(installParticleTestDom)

afterEach(() => vi.unstubAllGlobals())

it('keeps world particles fixed and local particles translation-only under isometric projection (CA-6)', () => {
  const game = makeGame()
  game.setSceneRender({ projection: 'isometric' })
  const worldOwner = game.spawn('World')
  worldOwner.position.set(2, 1, 0)
  worldOwner.add(ParticleEmitter, { space: 'world' }).emit(1)
  const localOwner = game.spawn('Local')
  localOwner.position.set(2, 1, 0)
  localOwner.add(ParticleEmitter, { space: 'local' }).emit(1)
  expect(particleMeshes(game).map(particleCenters)).toEqual([[1, -1.5], [1, -1.5]])

  worldOwner.position.set(4, 3, 0)
  localOwner.position.set(4, 3, 0)
  localOwner.scale.set(9, 7, 1)
  localOwner.node.rotation.z = Math.PI / 3
  renderWithoutSimulation(game)
  expect(particleMeshes(game).map(particleCenters)).toEqual([[1, -1.5], [1, -3.5]])
  game.dispose()
})

it('globally interleaves particle entries with a Sprite while retaining one batch (CA-9)', () => {
  const game = makeGame()
  game.setSceneRender({ projection: 'isometric', sort: 'y' })
  const emitter = game.spawn('Dust').add(ParticleEmitter, { positionSpread: [0, 2], layer: 0 })
  const spriteOwner = game.spawn('Hero')
  spriteOwner.position.set(0, -1.4, 0)
  spriteOwner.add(Sprite, { layer: 0 })
  emitter.emit(2)
  expect(isYSortBatchParticipant(emitter)).toBe(true)
  renderWithoutSimulation(game)

  const spriteMesh = spriteOwner.node.children[0]
  if (!(spriteMesh instanceof Mesh)) throw new Error('expected Sprite mesh')
  const particles = particleMesh(game)
  const positions = particles.geometry.getAttribute('position')
  expect(positions.getZ(0)).toBeLessThan(spriteMesh.position.z)
  expect(spriteMesh.position.z).toBeLessThan(positions.getZ(4))
  expect(particles.material).toBeInstanceOf(MeshBasicMaterial)
  expect(particles.geometry.groups).toEqual([])
  game.dispose()
})

it('keeps equal-Y particle ties in spawn order after dense recycling (CA-9)', () => {
  const game = makeGame()
  game.setSceneRender({ sort: 'y' })
  const emitter = game.spawn('Ties').add(ParticleEmitter, { capacity: 3, width: 1 })
  emitter.emit(1)
  emitter.width = 2
  emitter.emit(1)
  emitter.width = 3
  emitter.emit(1)
  emitter.width = 4
  emitter.emit(1)
  renderWithoutSimulation(game)

  const positions = particleMesh(game).geometry.getAttribute('position')
  const byDepth = Array.from({ length: 3 }, (_, slot) => ({
    width: positions.getX(slot * 4 + 1) - positions.getX(slot * 4),
    z: positions.getZ(slot * 4),
  })).sort((left, right) => left.z - right.z)
  expect(byDepth.map(({ width }) => width)).toEqual([2, 3, 4])
  game.dispose()
})

it('clears and disposes its resources synchronously by default (CA-11)', () => {
  const game = makeGame()
  const entity = game.spawn('Clear')
  const emitter = entity.add(ParticleEmitter)
  emitter.emit(1)
  const mesh = particleMesh(game)
  const geometry = vi.spyOn(mesh.geometry, 'dispose')
  const material = vi.spyOn(mesh.material, 'dispose')

  entity.destroy()
  expect(emitter.emit(1)).toBe(0)
  expect(mesh.parent).toBeNull()
  expect(geometry).toHaveBeenCalledTimes(1)
  expect(material).toHaveBeenCalledTimes(1)
  game.dispose()
})

it('transfers a drain batch to scene ownership until expiry (CA-11)', () => {
  const game = makeGame()
  const entity = game.spawn('Drain')
  entity.position.set(3, 4, 0)
  const emitter = entity.add(ParticleEmitter, {
    destroyMode: 'drain',
    space: 'local',
    lifetime: SIMULATION_STEP * 2,
  })
  emitter.emit(1)
  const mesh = particleMesh(game)
  const geometry = vi.spyOn(mesh.geometry, 'dispose')
  const frozenCenter = particleCenters(mesh)

  entity.destroy()
  entity.position.set(100, 100, 0)
  expect(game.entities).toEqual([])
  expect(emitter.emit(1)).toBe(0)
  expect(mesh.parent).toBe(game.scene)
  runFrame(game, 1)
  expect(particleCenters(mesh)).toEqual(frozenCenter)
  expect(mesh.parent).toBe(game.scene)
  runFrame(game, 1)
  expect(mesh.parent).toBeNull()
  expect(geometry).toHaveBeenCalledTimes(1)
  game.dispose()
})

it('disposes a paused drain immediately when its scene unloads (CA-11)', () => {
  const game = makeGame()
  const entity = game.spawn('Paused drain')
  const emitter = entity.add(ParticleEmitter, { destroyMode: 'drain', lifetime: 10 })
  emitter.emit(1)
  const mesh = particleMesh(game)
  const geometry = vi.spyOn(mesh.geometry, 'dispose')
  entity.destroy()
  game.simulate = false
  runFrame(game, 0)
  expect(mesh.parent).toBe(game.scene)

  game.unloadScene()
  expect(mesh.parent).toBeNull()
  expect(geometry).toHaveBeenCalledTimes(1)
  game.dispose()
})

it('disposes every drain when a new scene replaces the current one (CA-11)', () => {
  const game = makeGame()
  const registry = { components: { ParticleEmitter } }
  loadScene(game, {
    waicaScene: 3,
    entities: [{
      name: 'Scene drain',
      components: [{ type: 'ParticleEmitter', props: { destroyMode: 'drain', lifetime: 10 } }],
    }],
  }, registry)
  const entity = game.find('Scene drain')
  const emitter = entity?.get(ParticleEmitter)
  if (!entity || !emitter) throw new Error('expected loaded ParticleEmitter')
  emitter.emit(1)
  const mesh = particleMesh(game)
  const geometry = vi.spyOn(mesh.geometry, 'dispose')
  entity.destroy()

  loadScene(game, { waicaScene: 3, entities: [] }, registry)

  expect(mesh.parent).toBeNull()
  expect(geometry).toHaveBeenCalledTimes(1)
  game.dispose()
})

it('disposes every drain when the Game is disposed (CA-11)', () => {
  const game = makeGame()
  const entity = game.spawn('Game drain')
  const emitter = entity.add(ParticleEmitter, { destroyMode: 'drain', lifetime: 10 })
  emitter.emit(1)
  const mesh = particleMesh(game)
  const geometry = vi.spyOn(mesh.geometry, 'dispose')
  const material = vi.spyOn(mesh.material, 'dispose')
  entity.destroy()

  game.dispose()

  expect(mesh.parent).toBeNull()
  expect(geometry).toHaveBeenCalledTimes(1)
  expect(material).toHaveBeenCalledTimes(1)
})
