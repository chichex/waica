import { describe, expect, it } from 'vitest'
import { PLATFORMER_PREFABS } from './prefabs.js'
import { PLATFORMER_REGISTRY_DATA } from './registry-data.js'
import { defined } from '../../engine/src/test-support'

function componentTypes(ref: string): string[] {
  return defined(PLATFORMER_PREFABS[ref]).components.map((component) => component.type)
}

function props(ref: string, type: string): Record<string, unknown> | undefined {
  return defined(PLATFORMER_PREFABS[ref]).components.find((component) => component.type === type)?.props
}

describe('the platformer prefabs express the damage model', () => {
  it('assigns the shipped directional collision taxonomy', () => {
    expect(props('characters/player', 'Hitbox')).toMatchObject({
      layer: 'player',
      collidesWith: ['*'],
    })
    expect(props('characters/slime', 'Hitbox')).toMatchObject({
      layer: 'enemy',
      collidesWith: ['player'],
    })
    expect(props('objects/coin', 'Hitbox')).toMatchObject({
      layer: 'collectible',
      collidesWith: ['player'],
    })
  })

  it('gives the player health, a world floor, and a spawn to come back to', () => {
    expect(componentTypes('characters/player')).toEqual([
      'AnimatedSprite',
      'PlatformerMotor',
      'StateMachine',
      'Hitbox',
      'Respawnable',
      'Health',
      'OutOfBounds',
      'ParticleEmitter',
      'DustPuffs',
    ])
    expect(props('characters/player', 'Health')).toEqual({ max: 3, invulnerability: 1 })
    expect(props('characters/player', 'OutOfBounds')).toEqual({ minY: -8 })
  })

  it('gives the player a burst-only dust emitter that DustPuffs fires on takeoff and landing', () => {
    expect(props('characters/player', 'DustPuffs')).toEqual({ jumpCount: 5, landCount: 12 })
    expect(props('characters/player', 'ParticleEmitter')).toMatchObject({ rate: 0, space: 'world', layer: -1 })
  })

  it('leaves the player Respawnable with no orphan kill height', () => {
    expect(props('characters/player', 'Respawnable') ?? {}).toEqual({})
  })

  it('gives the slime one point of health, so a stomp still kills it in one hit', () => {
    expect(componentTypes('characters/slime')).toEqual([
      'AnimatedSprite',
      'Patrol',
      'StateMachine',
      'Hitbox',
      'Hazard',
      'Health',
    ])
    expect(props('characters/slime', 'Health')).toEqual({ max: 1, damageNumber: 'damage-number' })
  })

  it('declares no killY anywhere — the param is gone, not merely unused', () => {
    const declared = Object.values(PLATFORMER_PREFABS).flatMap((prefab) =>
      prefab.components.flatMap((component) => Object.keys(component.props ?? {})),
    )

    expect(declared).not.toContain('killY')
  })

  it('registers every component the prefabs name', () => {
    const registered = new Set(Object.keys(PLATFORMER_REGISTRY_DATA.components))
    const used = Object.values(PLATFORMER_PREFABS).flatMap((prefab) =>
      prefab.components.map((component) => component.type),
    )

    for (const type of used) expect(registered).toContain(type)
  })
})
