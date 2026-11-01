// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import type { Game } from '../game.js'
import { loadScene } from '../scene.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from '../test-game-3d.js'
import { defined } from '../test-support.js'
import { SpotLight } from './spot-light.js'

use3dTestEnvironment()

const round = (n: number): number => Math.round(n * 1e6) / 1e6 || 0

function spotsOf(game: Game): THREE.SpotLight[] {
  const found: THREE.SpotLight[] = []
  game.scene.traverse((object) => {
    if (object instanceof THREE.SpotLight) found.push(object)
  })
  return found
}

function worldPosition(object: THREE.Object3D): number[] {
  object.updateWorldMatrix(true, false)
  return object.getWorldPosition(new THREE.Vector3()).toArray().map(round)
}

/** The unit direction a spot shines along, in world space. */
function shineOf(light: THREE.SpotLight): number[] {
  light.updateWorldMatrix(true, false)
  light.target.updateWorldMatrix(true, false)
  const from = light.getWorldPosition(new THREE.Vector3())
  const to = light.target.getWorldPosition(new THREE.Vector3())
  return to.sub(from).normalize().toArray().map(round)
}

async function spotGame(): Promise<Game> {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([]), registryOf({ SpotLight }))
  return game
}

describe('SpotLight (CA-1)', () => {
  it('owns a SpotLight at the entity position plus its offset, with its look in three units', async () => {
    const game = await spotGame()
    const entity = game.spawn('Spot')
    entity.position.set(10, 0, 0)

    entity.add(SpotLight, {
      color: 0xffaa55, intensity: 5, distance: 8, decay: 1.5, angle: 45, penumbra: 0.5,
      offsetX: 1, offsetY: 2, offsetZ: 3,
    })

    expect(spotsOf(game)).toHaveLength(1)
    const light = defined(spotsOf(game)[0])
    expect(worldPosition(light)).toEqual([11, 2, 3])
    expect(light.color.getHex()).toBe(0xffaa55)
    expect([light.intensity, light.distance, light.decay, light.penumbra]).toEqual([5, 8, 1.5, 0.5])
    expect(light.angle).toBeCloseTo(Math.PI / 4, 9)
    expect(shineOf(light)).toEqual([0, -1, 0])
  })

  it('updates the light when its props change', async () => {
    const game = await spotGame()
    const entity = game.spawn('Spot')
    const spot = entity.add(SpotLight)
    const light = defined(spotsOf(game)[0])

    spot.color = 0x00ff00
    spot.intensity = 9
    spot.distance = 3
    spot.decay = 1
    spot.angle = 60
    spot.penumbra = 0.1
    spot.direction = [1, 0, 0]
    spot.offsetX = 2
    spot.offsetY = 3
    spot.offsetZ = 4

    expect(light.color.getHex()).toBe(0x00ff00)
    expect([light.intensity, light.distance, light.decay, light.penumbra]).toEqual([9, 3, 1, 0.1])
    expect(light.angle).toBeCloseTo(Math.PI / 3, 9)
    expect(worldPosition(light)).toEqual([2, 3, 4])
    expect(shineOf(light)).toEqual([1, 0, 0])
  })
})

describe('SpotLight, normalized props (CA-1)', () => {
  it('clamps angle to 1..89 degrees and penumbra to 0..1', async () => {
    const game = await spotGame()
    const spot = game.spawn('Spot').add(SpotLight, { angle: 0, penumbra: -1 })
    expect([spot.angle, spot.penumbra]).toEqual([1, 0])
    spot.angle = 120
    spot.penumbra = 2
    expect([spot.angle, spot.penumbra]).toEqual([89, 1])
    spot.angle = Number.NaN
    spot.penumbra = Number.NaN
    expect([spot.angle, spot.penumbra]).toEqual([89, 1])
    expect(defined(spot.light).angle).toBeCloseTo((89 * Math.PI) / 180, 9)
  })

  it('keeps its last direction when given a zero or unreadable vector', async () => {
    const game = await spotGame()
    const spot = game.spawn('Spot').add(SpotLight, { direction: [0, 0, -1] })
    spot.direction = [0, 0, 0]
    spot.direction = [1, Number.NaN, 0] as never
    spot.direction = 'down' as never
    expect(spot.direction).toEqual([0, 0, -1])
    expect(shineOf(defined(spot.light))).toEqual([0, 0, -1])
  })
})

describe('SpotLight, local direction (CA-2)', () => {
  it('aims along direction in the entity frame: a 90° turn in Y turns [0, 0, -1] into [-1, 0, 0]', async () => {
    const game = await spotGame()
    const entity = game.spawn('Spot')
    const spot = entity.add(SpotLight, { direction: [0, 0, -1] })
    entity.node.rotation.set(0, Math.PI / 2, 0)

    expect(shineOf(defined(spot.light))).toEqual([-1, 0, 0])
  })

  it('moves and turns with its entity, offset included', async () => {
    const game = await spotGame()
    const entity = game.spawn('Spot')
    const spot = entity.add(SpotLight, { direction: [0, 0, -1], offsetX: 1 })
    entity.position.set(4, 0, -2)
    entity.node.rotation.set(0, Math.PI, 0)

    expect(worldPosition(defined(spot.light))).toEqual([3, 0, -2])
    expect(shineOf(defined(spot.light))).toEqual([0, 0, 1])
  })
})

describe('SpotLight, lifetime and defaults (CA-1)', () => {
  it('removes its light and target when destroyed and creates nothing in a 2D scene', async () => {
    const game = await spotGame()
    const entity = game.spawn('Spot')
    const spot = entity.add(SpotLight)
    const light = defined(spot.light)
    entity.destroy()
    expect(spotsOf(game)).toHaveLength(0)
    expect(light.target.parent).toBeNull()

    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({ SpotLight }))
    const flat = game.spawn('Spot').add(SpotLight)
    expect(flat.light).toBeNull()
    expect(spotsOf(game)).toHaveLength(0)
  })

  it('has the defaults the spec names', () => {
    expect(SpotLight.componentName).toBe('SpotLight')
    expect(SpotLight.displayName).toBe('Spot light (3D)')
    expect(SpotLight.space).toBe('3d')
    expect(authoringDefaults(SpotLight)).toEqual({
      color: 0xffffff, intensity: 1, distance: 0, decay: 2, angle: 30, penumbra: 0.2, direction: [0, -1, 0],
      offsetX: 0, offsetY: 0, offsetZ: 0,
      castShadows: true, shadowMapSize: null,
      shadowMaxDistance: null, shadowBias: null, shadowNormalBias: null, shadowRadius: null,
    })
    expect(SpotLight.params).toMatchObject({
      color: { kind: 'color' }, angle: { min: 1, max: 89 }, penumbra: { min: 0, max: 1 }, direction: { kind: 'vector3' },
    })
  })
})
