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
import { ParticleEmitter } from './components/particle-emitter.js'
import { Sprite } from './components/sprite.js'
import { SIMULATION_STEP } from './fixed-step.js'
import { Game } from './game.js'
import { isYSortBatchParticipant } from './render-sort.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
}

function runFrame(game: Game, steps: number): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(steps)
}

function renderWithoutSimulation(game: Game): void {
  game.simulate = false
  runFrame(game, 0)
}

function meshCenters(game: Game): Array<[number, number]> {
  return game.scene.children
    .filter((child): child is THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> =>
      child instanceof THREE.Mesh)
    .map((mesh) => {
      const positions = mesh.geometry.getAttribute('position')
      return [
        (positions.getX(0) + positions.getX(1) + positions.getX(2) + positions.getX(3)) / 4,
        (positions.getY(0) + positions.getY(1) + positions.getY(2) + positions.getY(3)) / 4,
      ]
    })
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ParticleEmitter integration', () => {
  it('keeps world particles fixed and local particles translation-only under isometric projection (CA-6)', () => {
    const game = makeGame()
    game.setSceneRender({ projection: 'isometric' })
    const worldOwner = game.spawn('World')
    worldOwner.position.set(2, 1, 0)
    worldOwner.add(ParticleEmitter, { space: 'world' }).emit(1)
    const localOwner = game.spawn('Local')
    localOwner.position.set(2, 1, 0)
    localOwner.add(ParticleEmitter, { space: 'local' }).emit(1)

    expect(meshCenters(game)).toEqual([[1, -1.5], [1, -1.5]])

    worldOwner.position.set(4, 3, 0)
    localOwner.position.set(4, 3, 0)
    localOwner.scale.set(9, 7, 1)
    localOwner.node.rotation.z = Math.PI / 3
    renderWithoutSimulation(game)

    expect(meshCenters(game)).toEqual([[1, -1.5], [1, -3.5]])
    game.dispose()
  })

  it('globally interleaves particle entries with a Sprite while retaining one batch (CA-9)', () => {
    const game = makeGame()
    game.setSceneRender({ projection: 'isometric', sort: 'y' })
    const emitter = game.spawn('Dust').add(ParticleEmitter, {
      positionSpread: [0, 2],
      layer: 0,
    })
    const spriteOwner = game.spawn('Hero')
    spriteOwner.position.set(0, -1.4, 0)
    spriteOwner.add(Sprite, { layer: 0 })
    emitter.emit(2)

    expect(isYSortBatchParticipant(emitter)).toBe(true)
    renderWithoutSimulation(game)

    const particleMesh = game.scene.children.find(
      (child): child is THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> =>
        child instanceof THREE.Mesh,
    )
    if (!particleMesh) throw new Error('expected ParticleEmitter mesh')
    const spriteMesh = spriteOwner.node.children[0]
    if (!(spriteMesh instanceof THREE.Mesh)) throw new Error('expected Sprite mesh')
    const positions = particleMesh.geometry.getAttribute('position')
    expect(positions.getZ(0)).toBeLessThan(spriteMesh.position.z)
    expect(spriteMesh.position.z).toBeLessThan(positions.getZ(4))
    expect(particleMesh.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(particleMesh.geometry.groups).toEqual([])
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

    const mesh = game.scene.children.find((child) => child instanceof THREE.Mesh)
    if (!(mesh instanceof THREE.Mesh)) throw new Error('expected particle mesh')
    const positions = mesh.geometry.getAttribute('position')
    const byDepth = Array.from({ length: 3 }, (_, slot) => ({
      width: positions.getX(slot * 4 + 1) - positions.getX(slot * 4),
      z: positions.getZ(slot * 4),
    })).sort((left, right) => left.z - right.z)
    expect(byDepth.map(({ width }) => width)).toEqual([2, 3, 4])
    game.dispose()
  })

  it('clears by default and transfers drain batches to scene ownership until expiry (CA-11)', () => {
    const clearGame = makeGame()
    const clearEntity = clearGame.spawn('Clear')
    const clearEmitter = clearEntity.add(ParticleEmitter)
    clearEmitter.emit(1)
    const clearMesh = clearGame.scene.children.find((child) => child instanceof THREE.Mesh)
    if (!(clearMesh instanceof THREE.Mesh)) throw new Error('expected clear particle mesh')
    const clearGeometry = vi.spyOn(clearMesh.geometry, 'dispose')
    const clearMaterial = vi.spyOn(clearMesh.material, 'dispose')

    clearEntity.destroy()

    expect(clearEmitter.emit(1)).toBe(0)
    expect(clearMesh.parent).toBeNull()
    expect(clearGeometry).toHaveBeenCalledTimes(1)
    expect(clearMaterial).toHaveBeenCalledTimes(1)
    clearGame.dispose()

    const drainGame = makeGame()
    const drainEntity = drainGame.spawn('Drain')
    drainEntity.position.set(3, 4, 0)
    const drainEmitter = drainEntity.add(ParticleEmitter, {
      destroyMode: 'drain',
      space: 'local',
      lifetime: SIMULATION_STEP * 2,
    })
    drainEmitter.emit(1)
    const drainMesh = drainGame.scene.children.find((child) => child instanceof THREE.Mesh)
    if (!(drainMesh instanceof THREE.Mesh)) throw new Error('expected drain particle mesh')
    const drainGeometry = vi.spyOn(drainMesh.geometry, 'dispose')
    const frozenCenter = meshCenters(drainGame)[0]

    drainEntity.destroy()
    drainEntity.position.set(100, 100, 0)

    expect(drainGame.entities).toEqual([])
    expect(drainEmitter.emit(1)).toBe(0)
    expect(drainMesh.parent).toBe(drainGame.scene)
    runFrame(drainGame, 1)
    expect(meshCenters(drainGame)[0]).toEqual(frozenCenter)
    expect(drainMesh.parent).toBe(drainGame.scene)
    runFrame(drainGame, 1)
    expect(drainMesh.parent).toBeNull()
    expect(drainGeometry).toHaveBeenCalledTimes(1)
    drainGame.dispose()
  })

  it('disposes a paused drain immediately when its scene unloads (CA-11)', () => {
    const game = makeGame()
    const entity = game.spawn('Paused drain')
    const emitter = entity.add(ParticleEmitter, {
      destroyMode: 'drain',
      lifetime: 10,
    })
    emitter.emit(1)
    const mesh = game.scene.children.find((child) => child instanceof THREE.Mesh)
    if (!(mesh instanceof THREE.Mesh)) throw new Error('expected drain particle mesh')
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
})
