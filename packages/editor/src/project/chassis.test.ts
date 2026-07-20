import { describe, expect, it } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import {
  behaviourTypes,
  componentRole,
  newPrefabComponents,
  setCollisionEnabled,
  splitComponents,
  toggleAnimated,
} from './chassis'

function objectPrefab(components: PrefabJson['components']): PrefabJson {
  return { waicaPrefab: 1, type: 'object', components }
}

describe('componentRole', () => {
  it('classifies core and behaviour components', () => {
    expect(componentRole('Sprite')).toBe('appearance')
    expect(componentRole('AnimatedSprite')).toBe('appearance')
    expect(componentRole('Solid')).toBe('collision')
    expect(componentRole('Hitbox')).toBe('collision')
    expect(componentRole('Patrol')).toBe('behaviour')
    expect(componentRole('HudCounter')).toBe('behaviour')
  })
})

describe('behaviourTypes', () => {
  it('filters out the core components', () => {
    expect(behaviourTypes(['Sprite', 'Solid', 'Patrol', 'Hitbox', 'Hazard'])).toEqual([
      'Patrol',
      'Hazard',
    ])
  })
})

describe('splitComponents', () => {
  it('buckets appearance, collision and behaviours', () => {
    const split = splitComponents([
      { type: 'AnimatedSprite' },
      { type: 'Hitbox' },
      { type: 'Patrol' },
      { type: 'Hazard' },
    ])
    expect(split.appearance?.type).toBe('AnimatedSprite')
    expect(split.collision?.type).toBe('Hitbox')
    expect(split.behaviours.map((c) => c.type)).toEqual(['Patrol', 'Hazard'])
    expect(split.extras).toEqual([])
  })

  it('sends duplicate core components to extras', () => {
    const split = splitComponents([
      { type: 'Sprite' },
      { type: 'AnimatedSprite' },
      { type: 'Solid' },
      { type: 'Hitbox' },
    ])
    expect(split.appearance?.type).toBe('Sprite')
    expect(split.collision?.type).toBe('Solid')
    expect(split.extras.map((c) => c.type)).toEqual(['AnimatedSprite', 'Hitbox'])
  })
})

describe('newPrefabComponents', () => {
  it('builds each chassis', () => {
    expect(newPrefabComponents('character').map((c) => c.type)).toEqual([
      'AnimatedSprite',
      'Hitbox',
    ])
    expect(newPrefabComponents('object').map((c) => c.type)).toEqual(['Sprite', 'Hitbox'])
    expect(newPrefabComponents('tile').map((c) => c.type)).toEqual(['Sprite', 'Solid'])
    expect(newPrefabComponents('ui').map((c) => c.type)).toEqual(['HudCounter'])
  })

  it('clones the character sprite so prefabs never share clip objects', () => {
    const a = newPrefabComponents('character')[0]?.props as { clips: Record<string, unknown> }
    const b = newPrefabComponents('character')[0]?.props as { clips: Record<string, unknown> }
    expect(a.clips).not.toBe(b.clips)
  })
})

describe('toggleAnimated', () => {
  it('round-trips preserving shared props and dropping clips', () => {
    const prefab = objectPrefab([
      {
        type: 'AnimatedSprite',
        props: {
          texture: 'waica:coin',
          cols: 4,
          rows: 1,
          width: 0.6,
          height: 0.6,
          clips: { spin: { frames: [0, 1, 2, 3], fps: 8 } },
          initialClip: 'spin',
        },
      },
      { type: 'Hitbox', props: { width: 0.5, height: 0.5 } },
    ])
    const toStatic = toggleAnimated(prefab)
    expect(toStatic?.components[0]).toEqual({
      type: 'Sprite',
      props: { width: 0.6, height: 0.6, texture: 'waica:coin' },
    })
    const back = toggleAnimated(toStatic as PrefabJson)
    expect(back?.components[0]).toEqual({
      type: 'AnimatedSprite',
      props: { width: 0.6, height: 0.6, texture: 'waica:coin', cols: 1, rows: 1, clips: {} },
    })
    expect(back?.components[1]).toEqual(prefab.components[1])
  })

  it('adds a color when a texture-less object goes static', () => {
    const prefab = objectPrefab([
      { type: 'AnimatedSprite', props: { width: 1, height: 1, cols: 1, rows: 1, clips: {} } },
    ])
    const next = toggleAnimated(prefab)
    expect(next?.components[0]?.props).toEqual({ width: 1, height: 1, color: 0x8ecae6 })
  })

  it('refuses on non-switchable types', () => {
    const tile: PrefabJson = {
      waicaPrefab: 1,
      type: 'tile',
      components: [{ type: 'Sprite', props: {} }],
    }
    expect(toggleAnimated(tile)).toBeNull()
  })
})

describe('setCollisionEnabled', () => {
  const tile: PrefabJson = {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Sprite', props: { width: 3, height: 0.5, color: 0x2a9d8f } },
      { type: 'Solid', props: { width: 3, height: 0.5 } },
    ],
  }

  it('removes the collision core when disabling', () => {
    const next = setCollisionEnabled(tile, false)
    expect(next.components.map((c) => c.type)).toEqual(['Sprite'])
  })

  it('inserts after the appearance with its size when enabling', () => {
    const decor = setCollisionEnabled(tile, false)
    const next = setCollisionEnabled(decor, true)
    expect(next.components[1]).toEqual({ type: 'Solid', props: { width: 3, height: 0.5 } })
  })

  it('is a no-op when the state already matches or the chassis forbids it', () => {
    expect(setCollisionEnabled(tile, true)).toBe(tile)
    const character: PrefabJson = {
      waicaPrefab: 1,
      type: 'character',
      components: [{ type: 'AnimatedSprite' }, { type: 'Hitbox' }],
    }
    expect(setCollisionEnabled(character, false)).toBe(character)
    const ui: PrefabJson = { waicaPrefab: 1, type: 'ui', components: [{ type: 'HudCounter' }] }
    expect(setCollisionEnabled(ui, false)).toBe(ui)
  })

  it('does not mutate its input', () => {
    const before = structuredClone(tile)
    setCollisionEnabled(tile, false)
    expect(tile).toEqual(before)
  })
})
