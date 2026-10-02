import { describe, expect, it } from 'vitest'
import { EMITTERS, bulletHell, bulletVelocity } from './bullet-hell.ts'

describe('bulletVelocity', () => {
  it('fires every bullet at the same speed, spread evenly around a ring', () => {
    const speeds = Array.from({ length: 8 }, (_, i) => Math.hypot(...bulletVelocity(3, i, 8)))
    for (const speed of speeds) expect(speed).toBeCloseTo(5, 9)
    const [x0, y0] = bulletVelocity(0, 0, 4)
    const [x1, y1] = bulletVelocity(0, 1, 4)
    expect(x0 * x1 + y0 * y1).toBeCloseTo(0, 9)
  })

  it('rotates the ring from one step to the next, so the pattern spirals', () => {
    expect(bulletVelocity(1, 0, 8)).not.toEqual(bulletVelocity(2, 0, 8))
    expect(bulletVelocity(5, 2, 8)).toEqual(bulletVelocity(5, 2, 8))
  })
})

describe('bulletHell', () => {
  it('places a player and one enemy per emitter, and spawns bullets with a Hitbox aimed at the player', () => {
    const plan = bulletHell(10, 'tex', {})
    expect(plan.scene.entities.map((entity) => entity.name)).toEqual([
      'Player',
      ...EMITTERS.map((_, i) => `Enemy-${i}`),
    ])
    const bullet = plan.registry.prefabs?.['bench/hell-bullet']
    expect(bullet?.components?.map((component) => component.type)).toEqual(['Sprite', 'Hitbox', 'BenchBullet'])
    expect(bullet?.components?.[1]?.props).toMatchObject({ layer: 'bullet', collidesWith: ['player'] })
    expect(plan.textures).toEqual(['tex'])
    expect(plan.perStep).toBeTypeOf('function')
  })
})
