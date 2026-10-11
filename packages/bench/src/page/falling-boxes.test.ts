import { describe, expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { fallingBoxes } from './falling-boxes.ts'

const BOX_NAME = /^Box-\d+$/

const boxesOf = (entities: readonly SceneEntityJson[]): SceneEntityJson[] => entities.filter((entity) => BOX_NAME.test(entity.name))

const componentTypes = (entity: SceneEntityJson | undefined): string[] => (entity?.components ?? []).map((component) => component.type)

type Centre = [x: number, z: number]

/** The x/z centres of the boxes, grouped by the height they start at (one group per layer). */
function centresByLayer(boxes: readonly SceneEntityJson[]): Map<number, Centre[]> {
  const layers = new Map<number, Centre[]>()
  for (const box of boxes) {
    const [x = 0, y = 0, z = 0] = box.position ?? []
    layers.set(y, [...(layers.get(y) ?? []), [x, z]])
  }
  return layers
}

/** The smallest distance between two box centres of the same layer. */
function closestWithinLayers(boxes: readonly SceneEntityJson[]): number {
  let closest = Infinity
  for (const centres of centresByLayer(boxes).values()) {
    centres.forEach(([ax, az], i) => {
      for (const [bx, bz] of centres.slice(i + 1)) closest = Math.min(closest, Math.hypot(ax - bx, az - bz))
    })
  }
  return closest
}

describe('fallingBoxes (issue #159 CA-24)', () => {
  it('is a 3D scene under a perspective camera, run for 300 Simulation Steps with no texture', () => {
    const plan = fallingBoxes(200)

    expect(plan.scene.render?.space).toBe('3d')
    expect(plan.scene.camera?.kind).toBe('perspective')
    expect(plan.steps).toBe(300)
    expect(plan.textures).toEqual([])
    expect(plan.perStep).toBeUndefined()
  })

  it('holds a static floor Collider and `n` dynamic boxes, each with a box Model', () => {
    for (const n of [200, 1000]) {
      const { entities } = fallingBoxes(n).scene
      const floor = entities.find((entity) => entity.name === 'Floor')
      expect(componentTypes(floor)).toEqual(['Collider'])
      const boxes = boxesOf(entities)
      expect(boxes).toHaveLength(n)
      for (const box of boxes) {
        expect(componentTypes(box)).toEqual(['Model', 'Collider', 'RigidBody'])
        expect(box.components?.[0]?.props).toMatchObject({ shape: 'box' })
        expect(box.components?.[2]?.props ?? {}).not.toHaveProperty('type', 'kinematic')
      }
    }
  })

  it('starts every box above the floor and at least a box width from the others of its layer, so the first step moves nothing sideways', () => {
    const boxes = boxesOf(fallingBoxes(1000).scene.entities)
    const keys = new Set(boxes.map((box) => (box.position ?? []).join(',')))
    expect(keys.size).toBe(boxes.length)
    const lowest = Math.min(...boxes.map((box) => box.position?.[1] ?? 0))
    expect(lowest).toBeGreaterThan(1)
    expect(centresByLayer(boxes).size).toBe(10)
    expect(closestWithinLayers(boxes)).toBeGreaterThanOrEqual(1)
  })
})

describe('fallingBoxes towers (PR #164 finding 1)', () => {
  it('nudges and turns each layer differently, so the towers the boxes fall into are not aligned', () => {
    const boxes = boxesOf(fallingBoxes(1000).scene.entities)
    // The ten boxes of one tower: same column and row, one per layer.
    const tower = boxes.filter((_, index) => index % 100 === 0)
    expect(tower).toHaveLength(10)
    expect(new Set(tower.map((box) => box.position?.[0])).size).toBeGreaterThan(2)
    expect(new Set(tower.map((box) => box.position?.[2])).size).toBeGreaterThan(2)
    expect(new Set(tower.map((box) => box.rotation?.[1])).size).toBeGreaterThan(2)
    expect(boxes.every((box) => Math.abs(box.rotation?.[1] ?? 0) <= 15)).toBe(true)
  })

  it('registers exactly the components it uses', () => {
    expect(Object.keys(fallingBoxes(200).registry.components).sort()).toEqual(['Collider', 'Model', 'RigidBody', 'Sun'])
  })

  it('is deterministic: the same size gives the same plan', () => {
    expect(fallingBoxes(200).scene).toEqual(fallingBoxes(200).scene)
  })
})
