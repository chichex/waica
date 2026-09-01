import { describe, expect, it } from 'vitest'
import { ISOMETRIC_PREFABS } from './prefabs'
import { ISOMETRIC_REGISTRY_DATA } from './registry-data'

function componentTypes(ref: string): string[] {
  return ISOMETRIC_PREFABS[ref]!.components.map((component) => component.type)
}

function props(ref: string, type: string): Record<string, unknown> {
  const component = ISOMETRIC_PREFABS[ref]!.components.find((candidate) => candidate.type === type)
  return (component?.props ?? {}) as Record<string, unknown>
}

describe('the isometric prefabs express the genre model', () => {
  it('ships exactly the declared cast, ground and occluding props', () => {
    expect(Object.keys(ISOMETRIC_PREFABS).sort()).toEqual([
      'characters/orc',
      'characters/player',
      'characters/villager',
      'objects/crate',
      'objects/door',
      'objects/rock',
      'objects/tree',
      'tiles/ground',
    ])
  })

  it('drives the player with IsoMotor and no gravity plumbing', () => {
    expect(componentTypes('characters/player')).toContain('IsoMotor')
    expect(props('characters/player', 'StateMachine')).toMatchObject({ role: 'player' })
    for (const ref of Object.keys(ISOMETRIC_PREFABS)) {
      expect(componentTypes(ref), ref).not.toContain('DynamicBody')
      expect(componentTypes(ref), ref).not.toContain('OutOfBounds')
    }
  })

  it('builds the demo cast from existing interaction, patrol and collectible behavior', () => {
    expect(props('characters/villager', 'StateMachine')).toMatchObject({ role: 'npc' })
    expect(componentTypes('characters/villager')).toContain('Interactable')
    expect(componentTypes('characters/orc')).toContain('Patrol')
    expect(props('characters/orc', 'Hazard')).toMatchObject({
      stompable: false,
      contactDamage: 1,
    })
    expect(componentTypes('objects/crate')).toContain('Collectible')
  })

  it('arms the player with a melee attack and a health that feeds the HUD', () => {
    expect(componentTypes('characters/player')).toContain('MeleeAttack')
    expect(props('characters/player', 'Health')).toEqual({ max: 3, invulnerability: 1, stat: 'health' })
  })

  it('makes the orc mortal: two hits, a short window, no HUD stat', () => {
    expect(props('characters/orc', 'Health')).toEqual({ max: 2, invulnerability: 0.3 })
    expect(props('characters/orc', 'StateMachine')).toMatchObject({
      role: 'patroller',
      states: expect.objectContaining({ hurt: expect.anything(), dead: expect.anything() }),
    })
  })

  it('gives the orc directional clips only, walking south-east from the start', () => {
    const sprite = props('characters/orc', 'AnimatedSprite') as {
      clips: Record<string, unknown>
      initialClip: string
    }
    expect(Object.keys(sprite.clips).filter((clip) => !clip.includes('-'))).toEqual([])
    expect(sprite.initialClip).toBe('walk-se')
    for (const state of ['walk', 'hurt', 'death']) {
      expect(sprite.clips[`${state}-se`], state).toBeDefined()
    }
  })

  it('leaves the villager peaceful: directional poses, but no attack clips', () => {
    const sprite = props('characters/villager', 'AnimatedSprite') as { clips: Record<string, unknown> }
    expect(Object.keys(sprite.clips).filter((clip) => clip.startsWith('attack'))).toEqual([])
    expect(sprite.clips['hurt-s']).toBeDefined()
    expect(sprite.clips['idle']).toBeDefined()
  })

  it('uses one Tilemap for ground and anchors every tall prop at its footprint', () => {
    expect(componentTypes('tiles/ground')).toEqual(['Tilemap'])
    for (const ref of ['objects/tree', 'objects/rock', 'objects/crate']) {
      expect(props(ref, 'Sprite')['anchorY'], ref).toBe(0)
    }
    for (const ref of ['objects/tree', 'objects/rock']) {
      expect(componentTypes(ref), ref).toContain('Solid')
    }
  })

  it('ships no west, north-west or south-west directional clips', () => {
    for (const [ref, prefab] of Object.entries(ISOMETRIC_PREFABS)) {
      for (const component of prefab.components) {
        if (component.type !== 'AnimatedSprite') continue
        const clips = Object.keys(
          ((component.props ?? {}) as { clips?: Record<string, unknown> }).clips ?? {},
        )
        expect(clips.filter((clip) => /-(w|nw|sw)$/.test(clip)), ref).toEqual([])
      }
    }
  })

  it('registers every prefab component plus the reusable character behaviors', () => {
    const required = new Set([
      ...Object.values(ISOMETRIC_PREFABS).flatMap((prefab) =>
        prefab.components.map((component) => component.type),
      ),
      'Chaser',
      'Lifetime',
    ])
    for (const component of required) {
      expect(ISOMETRIC_REGISTRY_DATA.components[component], component).toBeDefined()
    }
  })
})
