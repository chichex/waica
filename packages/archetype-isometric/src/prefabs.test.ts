import { describe, expect, it } from 'vitest'
import { ISOMETRIC_CAVE_MAP_HEIGHT, ISOMETRIC_CAVE_MAP_WIDTH, ISOMETRIC_PREFABS } from './prefabs'
import { ISOMETRIC_REGISTRY_DATA } from './registry-data'
import { defined, match } from '../../engine/src/test-support'

function componentTypes(ref: string): string[] {
  return defined(ISOMETRIC_PREFABS[ref]).components.map((component) => component.type)
}

function props(ref: string, type: string): Record<string, unknown> {
  const component = defined(ISOMETRIC_PREFABS[ref]).components.find((candidate) => candidate.type === type)
  return (component?.props ?? {}) as Record<string, unknown>
}

describe('the isometric prefabs express the genre model', () => {
  it('assigns the shipped directional collision taxonomy', () => {
    expect(props('characters/player', 'Hitbox')).toMatchObject({
      layer: 'player',
      collidesWith: ['*'],
    })
    expect(props('characters/orc', 'Hitbox')).toMatchObject({
      layer: 'enemy',
      collidesWith: ['player'],
    })
    expect(props('objects/crate', 'Hitbox')).toMatchObject({
      layer: 'collectible',
      collidesWith: ['player'],
    })
    expect(props('objects/door', 'Hitbox')).toMatchObject({
      layer: 'scene-transition',
      collidesWith: ['player'],
    })
  })

  it('ships exactly the declared cast, ground, occluding props and particle effects', () => {
    expect(Object.keys(ISOMETRIC_PREFABS).sort()).toEqual([
      'characters/orc',
      'characters/player',
      'characters/villager',
      'objects/cave-dust',
      'objects/crate',
      'objects/door',
      'objects/hurt-smoke',
      'objects/rock',
      // Issue #78 CA-14: the dungeon's torch.
      'objects/torch',
      'objects/tree',
      'objects/wind',
      'tiles/ground',
    ])
  })

  it('gives the player a sword-spark emitter that SwingSparks bursts on attack', () => {
    const types = componentTypes('characters/player')
    expect(types.slice(-2)).toEqual(['ParticleEmitter', 'SwingSparks'])
    expect(types.indexOf('StateMachine')).toBeLessThan(types.indexOf('SwingSparks'))
    expect(props('characters/player', 'SwingSparks')).toEqual({ state: 'attack', count: 18 })
    expect(props('characters/player', 'ParticleEmitter')).toMatchObject({ rate: 0, space: 'world', layer: 1 })
  })

  it('ships the ambient and hurt effects as sprite-less emitter objects', () => {
    expect(componentTypes('objects/wind')).toEqual(['ParticleEmitter'])
    expect(props('objects/wind', 'ParticleEmitter')).toMatchObject({ space: 'world', layer: 0 })
    expect(Number(props('objects/wind', 'ParticleEmitter')['rate'])).toBeGreaterThan(0)
    expect(componentTypes('objects/hurt-smoke')).toEqual(['ParticleEmitter', 'DamagePuff'])
    expect(props('objects/hurt-smoke', 'ParticleEmitter')).toMatchObject({ rate: 0, space: 'world' })
    expect(componentTypes('objects/cave-dust')).toEqual(['ParticleEmitter'])
    expect(Number(props('objects/cave-dust', 'ParticleEmitter')['rate'])).toBeGreaterThan(0)
    // Placed at the cave's center, the motes stay inside its border ring.
    expect(props('objects/cave-dust', 'ParticleEmitter')['positionSpread']).toEqual([
      ISOMETRIC_CAVE_MAP_WIDTH / 2 - 1,
      ISOMETRIC_CAVE_MAP_HEIGHT / 2 - 1,
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
    expect(props('characters/player', 'Health')).toEqual({
      max: 3,
      invulnerability: 1,
      stat: 'health',
      hurtSound: 'waica:iso-hurt',
    })
  })

  it('makes the orc mortal: two hits, a short window, no HUD stat', () => {
    expect(props('characters/orc', 'Health')).toEqual({
      max: 2,
      invulnerability: 0.3,
      hurtSound: 'waica:iso-hit',
      damageNumber: 'damage-number',
      healthBar: 'health-bar',
    })
    expect(props('characters/orc', 'StateMachine')).toMatchObject({
      role: 'patroller',
      states: match.objectContaining({ hurt: match.anything(), dead: match.anything() }),
    })
  })

  it('gives the player and the orc their own configured swing/hurt sounds (CA-12)', () => {
    expect(props('characters/player', 'MeleeAttack')).toEqual({
      swingSound: 'waica:iso-sword-swing',
    })
    const playerHurtSound = props('characters/player', 'Health')['hurtSound']
    const orcHurtSound = props('characters/orc', 'Health')['hurtSound']
    expect(playerHurtSound).toBeTruthy()
    expect(orcHurtSound).toBeTruthy()
    // The spec requires these to be audibly distinct (CA-12).
    expect(playerHurtSound).not.toBe(orcHurtSound)
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
