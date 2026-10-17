import { describe, expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { shadowScene } from './shadow-scenes.ts'

const propsOf = (entity: SceneEntityJson | undefined, type: string): Record<string, unknown> | undefined =>
  entity?.components?.find((component) => component.type === type)?.props

describe('paired shadow workloads (issue #203 CA-19)', () => {
  it.each([50, 200])('authors a Sun pair with %i casters, differing only in scene shadow quality', (n) => {
    const off = shadowScene(n, 'sun', false)
    const on = shadowScene(n, 'sun', true)

    expect(off.scene.render?.shadows).toEqual({ quality: 'off', maxDistance: 40 })
    expect(on.scene.render?.shadows).toEqual({ quality: 'medium', maxDistance: 40 })
    expect({ ...off.scene, render: { ...off.scene.render, shadows: { ...off.scene.render?.shadows, quality: 'medium' } } }).toEqual(on.scene)
    expect(off.scene.render?.lighting).toEqual(on.scene.render?.lighting)
    expect(off.registry).toEqual(on.registry)
    expect(off.preload).toEqual(on.preload)
    expect(on.preload).toHaveLength(1)
    expect(on.preload[0]).toMatch(/rig.*\.glb/)
    expect(on.steps).toBe(60)
    expect(on.warmupFrames).toBe(5)
    expect(on.perStep).toBeUndefined()
    expect(off.shadow).toEqual({ composition: 'sun', enabled: false, quality: 'off', casters: n, lights: 1, warmupFrames: 5, measuredFrames: 60 })
    expect(on.shadow).toEqual({ composition: 'sun', enabled: true, quality: 'medium', casters: n, lights: 1, warmupFrames: 5, measuredFrames: 60 })
    const casters = on.scene.entities.filter((entity) => propsOf(entity, 'Model')?.castShadows === true)
    expect(casters).toHaveLength(n)
    expect(casters.filter((entity) => propsOf(entity, 'Model')?.shape === 'box')).toHaveLength(n - 1)
    const walkers = casters.filter((entity) => propsOf(entity, 'Animator')?.initialClip === 'walk')
    expect(walkers).toHaveLength(1)
    expect(propsOf(walkers[0], 'Model')?.src).toBe(on.preload[0])
    const receiver = on.scene.entities.find((entity) => propsOf(entity, 'Model')?.shape === 'plane')
    expect(receiver).toBeDefined()
    expect(propsOf(receiver, 'Model')).toMatchObject({ castShadows: false, receiveShadows: true })
    const suns = on.scene.entities.filter((entity) => propsOf(entity, 'Sun'))
    expect(suns).toHaveLength(1)
    expect(propsOf(suns[0], 'Sun')).toMatchObject({ castShadows: true, intensity: 3 })
  })
})

describe('point-light shadow controls', () => {
  it.each([
    ['point', 50, [[0, 5, 0]]],
    ['point', 200, [[0, 5, 0]]],
    ['four-point', 50, [[-5, 5, -3], [5, 5, -3], [-5, 5, 3], [5, 5, 3]]],
    ['four-point', 200, [[-5, 5, -3], [5, 5, -3], [-5, 5, 3], [5, 5, 3]]],
  ] as const)('keeps every %s light illuminating %i casters in both controls', (composition, n, positions) => {
    const off = shadowScene(n, composition, false)
    const on = shadowScene(n, composition, true)
    expect({ ...off.scene, render: { ...off.scene.render, shadows: { ...off.scene.render?.shadows, quality: 'medium' } } }).toEqual(on.scene)
    for (const plan of [off, on]) {
      const lights = plan.scene.entities.filter((entity) => propsOf(entity, 'PointLight'))
      expect(lights.map((entity) => entity.position)).toEqual(positions)
      expect(plan.scene.entities.some((entity) => propsOf(entity, 'Sun'))).toBe(false)
      expect(plan.shadow).toEqual({ composition, enabled: plan === on, quality: plan === on ? 'medium' : 'off', casters: n, lights: positions.length, warmupFrames: 5, measuredFrames: 60 })
      for (const light of lights) {
        expect(propsOf(light, 'PointLight')).toMatchObject({ castShadows: true, distance: 30, decay: 2 })
        expect(propsOf(light, 'PointLight')?.intensity).toBeGreaterThan(0)
      }
      expect(plan.scene.entities.filter((entity) => propsOf(entity, 'Model')?.castShadows === true)).toHaveLength(n)
      expect(plan.scene.entities.filter((entity) => propsOf(entity, 'Animator')?.initialClip === 'walk')).toHaveLength(1)
    }
    expect(off.registry).toEqual(on.registry)
    expect(off.preload).toEqual(on.preload)
    expect(off.steps).toBe(on.steps)
    expect(off.warmupFrames).toBe(on.warmupFrames)
    expect(off.perStep).toBe(on.perStep)
  })
})
