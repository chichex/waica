import { describe, expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { fallingBoxes } from './falling-boxes.ts'

const BOX_NAME = /^Box-\d+$/

const boxesOf = (entities: readonly SceneEntityJson[]): SceneEntityJson[] => entities.filter((entity) => BOX_NAME.test(entity.name))

const componentTypes = (entity: SceneEntityJson | undefined): string[] => (entity?.components ?? []).map((component) => component.type)

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

  it('starts every box above the floor and apart from the others, so the first step moves nothing sideways', () => {
    const boxes = boxesOf(fallingBoxes(1000).scene.entities)
    const keys = new Set(boxes.map((box) => (box.position ?? []).join(',')))
    expect(keys.size).toBe(boxes.length)
    expect(boxes.every((box) => (box.position?.[1] ?? 0) > 0.5)).toBe(true)
    const lowest = Math.min(...boxes.map((box) => box.position?.[1] ?? 0))
    expect(lowest).toBeGreaterThan(1)
  })

  it('registers exactly the components it uses', () => {
    expect(Object.keys(fallingBoxes(200).registry.components).sort()).toEqual(['Collider', 'Model', 'RigidBody', 'Sun'])
  })

  it('is deterministic: the same size gives the same plan', () => {
    expect(fallingBoxes(200).scene).toEqual(fallingBoxes(200).scene)
  })
})
