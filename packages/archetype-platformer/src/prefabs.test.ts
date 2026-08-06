import { describe, expect, it } from 'vitest'
import { PLATFORMER_PREFABS } from './prefabs.js'
import { PLATFORMER_REGISTRY_DATA } from './registry-data.js'

function componentTypes(ref: string): string[] {
  return PLATFORMER_PREFABS[ref]!.components.map((component) => component.type)
}

function props(ref: string, type: string): Record<string, unknown> | undefined {
  return PLATFORMER_PREFABS[ref]!.components.find((component) => component.type === type)?.props
}

describe('the platformer prefabs express the damage model', () => {
  it('gives the player health, a world floor, and a spawn to come back to', () => {
    expect(componentTypes('characters/player')).toEqual([
      'AnimatedSprite',
      'PlatformerMotor',
      'StateMachine',
      'Hitbox',
      'Respawnable',
      'Health',
      'OutOfBounds',
    ])
    expect(props('characters/player', 'Health')).toEqual({ max: 3, invulnerability: 1 })
    expect(props('characters/player', 'OutOfBounds')).toEqual({ minY: -12 })
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
    expect(props('characters/slime', 'Health')).toEqual({ max: 1 })
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
