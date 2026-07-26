import { describe, expect, it } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import {
  appearanceKind,
  behaviourTypes,
  componentRole,
  missingDriver,
  newPrefabComponents,
  setAppearanceShape,
  setAppearanceTexture,
  setCollisionEnabled,
  splitComponents,
  switchRole,
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
    expect(componentRole('StateMachine')).toBe('behaviour')
    expect(componentRole('Patrol')).toBe('behaviour')
  })
})

describe('behaviourTypes', () => {
  it('filters out the core components', () => {
    expect(
      behaviourTypes(['Sprite', 'Solid', 'Patrol', 'Hitbox', 'StateMachine', 'Hazard']),
    ).toEqual(['Patrol', 'StateMachine', 'Hazard'])
  })
})

describe('missingDriver', () => {
  const machine = (role: string) => ({ type: 'StateMachine', props: { role } })

  it('flags a player without the Motor', () => {
    expect(missingDriver([{ type: 'AnimatedSprite' }, machine('player')])).toEqual({
      role: 'player',
      driver: 'PlatformerMotor',
    })
  })

  it('is satisfied once the driver is present', () => {
    expect(missingDriver([machine('player'), { type: 'PlatformerMotor' }])).toBeNull()
    expect(missingDriver([machine('patroller'), { type: 'Patrol' }])).toBeNull()
  })

  it('flags a patroller without Patrol', () => {
    expect(missingDriver([machine('patroller')])).toEqual({
      role: 'patroller',
      driver: 'Patrol',
    })
  })

  it('suggests switching role when the other driver is already there', () => {
    expect(missingDriver([machine('player'), { type: 'Patrol' }])).toEqual({
      role: 'player',
      driver: 'PlatformerMotor',
      alternative: { role: 'patroller', driver: 'Patrol' },
    })
  })

  it('stays quiet on unknown roles and without a machine', () => {
    expect(missingDriver([machine('my-own-brain')])).toBeNull()
    expect(missingDriver([{ type: 'Sprite' }])).toBeNull()
    expect(missingDriver([{ type: 'StateMachine' }])).toBeNull()
  })
})

describe('switchRole', () => {
  const player = () => [
    { type: 'AnimatedSprite' },
    {
      type: 'StateMachine',
      props: { role: 'player', initial: 'idle', states: { idle: {}, run: {} } },
    },
    { type: 'PlatformerMotor', props: { moveSpeed: 12 } },
    { type: 'Hitbox' },
    { type: 'Hazard' },
  ]

  it('swaps the whole package: graph replaced, driver swapped', () => {
    const next = switchRole(player(), 'patroller')
    expect(next.map((c) => c.type)).toEqual([
      'AnimatedSprite',
      'StateMachine',
      'Patrol',
      'Hitbox',
      'Hazard',
    ])
    const machine = next.find((c) => c.type === 'StateMachine')
    expect(machine?.props?.role).toBe('patroller')
    expect(machine?.props?.initial).toBe('walk')
    expect(Object.keys((machine?.props?.states as object) ?? {})).toEqual(['walk'])
  })

  it('round-trips back to player with its starter graph', () => {
    const back = switchRole(switchRole(player(), 'patroller'), 'player')
    expect(back.map((c) => c.type)).toEqual([
      'AnimatedSprite',
      'StateMachine',
      'PlatformerMotor',
      'Hitbox',
      'Hazard',
    ])
    const machine = back.find((c) => c.type === 'StateMachine')
    expect(machine?.props?.initial).toBe('idle')
  })

  it('only renames on roles the registry does not know', () => {
    const next = switchRole(player(), 'my-own-role')
    expect(next.map((c) => c.type)).toEqual(player().map((c) => c.type))
    const machine = next.find((c) => c.type === 'StateMachine')
    expect(machine?.props?.role).toBe('my-own-role')
    expect(Object.keys((machine?.props?.states as object) ?? {})).toEqual(['idle', 'run'])
  })

  it('does not duplicate an already-present driver', () => {
    const next = switchRole(switchRole(player(), 'player'), 'player')
    expect(next.filter((c) => c.type === 'PlatformerMotor')).toHaveLength(1)
  })

  it('is a no-op without a machine and does not mutate its input', () => {
    const bare = [{ type: 'Sprite' }]
    expect(switchRole(bare, 'player')).toBe(bare)
    const before = player()
    const snapshot = structuredClone(before)
    switchRole(before, 'patroller')
    expect(before).toEqual(snapshot)
  })
})

describe('splitComponents', () => {
  it('buckets appearance, collision and behaviours', () => {
    const split = splitComponents([
      { type: 'AnimatedSprite' },
      { type: 'Hitbox' },
      { type: 'StateMachine' },
      { type: 'Patrol' },
      { type: 'Hazard' },
    ])
    expect(split.appearance?.type).toBe('AnimatedSprite')
    expect(split.collision?.type).toBe('Hitbox')
    expect(split.behaviours.map((c) => c.type)).toEqual(['StateMachine', 'Patrol', 'Hazard'])
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
  it('builds each chassis — characters born whole, driver included', () => {
    expect(newPrefabComponents('character').map((c) => c.type)).toEqual([
      'Sprite',
      'StateMachine',
      'PlatformerMotor',
      'Hitbox',
    ])
    expect(newPrefabComponents('object').map((c) => c.type)).toEqual(['Sprite', 'Hitbox'])
    expect(newPrefabComponents('tile').map((c) => c.type)).toEqual(['Sprite', 'Solid'])
  })

  it('installs the chosen role: graph and driver', () => {
    const player = newPrefabComponents('character', 'player')[1]
    expect(player?.props?.role).toBe('player')
    expect(player?.props?.initial).toBe('idle')
    const patroller = newPrefabComponents('character', 'patroller')
    expect(patroller.map((c) => c.type)).toEqual(['Sprite', 'StateMachine', 'Patrol', 'Hitbox'])
    expect(patroller[1]?.props?.role).toBe('patroller')
    expect(patroller[1]?.props?.initial).toBe('walk')
  })

  it('births unknown roles machine-only, with an empty graph', () => {
    const custom = newPrefabComponents('character', 'my-own-role')
    expect(custom.map((c) => c.type)).toEqual(['Sprite', 'StateMachine', 'Hitbox'])
    expect(custom[1]?.props?.role).toBe('my-own-role')
  })

  it('starts character appearance as a plain shape, not archetype art', () => {
    const sprite = newPrefabComponents('character')[0]
    expect(sprite?.props?.texture).toBeUndefined()
    expect(sprite ? appearanceKind(sprite) : null).toBe('shape')
  })

  it('layers characters over objects over tiles by default', () => {
    expect(newPrefabComponents('character')[0]?.props?.layer).toBe(2)
    expect(newPrefabComponents('object')[0]?.props?.layer).toBe(1)
    expect(newPrefabComponents('tile')[0]?.props?.layer).toBeUndefined()
  })

  it('clones the state graph so prefabs never share objects', () => {
    const a = newPrefabComponents('character')
    const b = newPrefabComponents('character')
    expect(a[0]?.props).not.toBe(b[0]?.props)
    expect((a[1]?.props as { states: object }).states).not.toBe(
      (b[1]?.props as { states: object }).states,
    )
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

  it('works on every prefab type — appearance is uniform', () => {
    const tile: PrefabJson = {
      waicaPrefab: 1,
      type: 'tile',
      components: [{ type: 'Sprite', props: { texture: 'src/art/brick.png', width: 1, height: 1 } }],
    }
    const next = toggleAnimated(tile)
    expect(next?.components[0]).toEqual({
      type: 'AnimatedSprite',
      props: { texture: 'src/art/brick.png', width: 1, height: 1, cols: 1, rows: 1, clips: {} },
    })
  })

  it('refuses only when there is no appearance component', () => {
    const bare: PrefabJson = { waicaPrefab: 1, type: 'object', components: [{ type: 'Hitbox' }] }
    expect(toggleAnimated(bare)).toBeNull()
  })
})

describe('appearanceKind', () => {
  it('reads animated and textured sprites as images', () => {
    expect(appearanceKind({ type: 'AnimatedSprite' })).toBe('image')
    expect(appearanceKind({ type: 'Sprite', props: { texture: 'waica:dog' } })).toBe('image')
  })

  it('reads texture-less sprites as shapes', () => {
    expect(appearanceKind({ type: 'Sprite' })).toBe('shape')
    expect(appearanceKind({ type: 'Sprite', props: { color: 0x123456 } })).toBe('shape')
  })
})

describe('setAppearanceTexture', () => {
  it('points a shape at a texture and drops its color', () => {
    const prefab = objectPrefab([
      { type: 'Sprite', props: { width: 2, height: 1, color: 0x123456 } },
    ])
    const next = setAppearanceTexture(prefab, 'src/art/crate.png')
    expect(next.components[0]).toEqual({
      type: 'Sprite',
      props: { width: 2, height: 1, texture: 'src/art/crate.png' },
    })
  })

  it('swaps the sheet of an animated appearance, keeping grid and clips', () => {
    const prefab = objectPrefab([
      {
        type: 'AnimatedSprite',
        props: { texture: 'waica:coin', cols: 4, rows: 1, clips: { spin: { frames: [0], fps: 8 } } },
      },
    ])
    const next = setAppearanceTexture(prefab, 'src/art/gem.png')
    expect(next.components[0]?.props).toEqual({
      texture: 'src/art/gem.png',
      cols: 4,
      rows: 1,
      clips: { spin: { frames: [0], fps: 8 } },
    })
  })

  it('does not mutate its input', () => {
    const prefab = objectPrefab([{ type: 'Sprite', props: { color: 1 } }])
    const before = structuredClone(prefab)
    setAppearanceTexture(prefab, 'src/art/crate.png')
    expect(prefab).toEqual(before)
  })
})

describe('setAppearanceShape', () => {
  it('turns an animated image into a color quad, dropping sheet and clips', () => {
    const character: PrefabJson = {
      waicaPrefab: 1,
      type: 'character',
      components: [
        {
          type: 'AnimatedSprite',
          props: {
            texture: 'waica:dog',
            cols: 6,
            rows: 4,
            width: 1.4,
            height: 1.4,
            pixelArt: true,
            clips: { idle: { frames: [0], fps: 6 } },
          },
        },
        { type: 'StateMachine' },
        { type: 'Hitbox' },
      ],
    }
    const next = setAppearanceShape(character)
    expect(next.components[0]).toEqual({
      type: 'Sprite',
      props: { width: 1.4, height: 1.4, color: 0x8ecae6 },
    })
    expect(next.components.slice(1)).toEqual(character.components.slice(1))
  })

  it('keeps an existing color', () => {
    const prefab = objectPrefab([
      { type: 'Sprite', props: { width: 1, height: 1, texture: 'waica:coin', color: 0x123456 } },
    ])
    expect(setAppearanceShape(prefab).components[0]?.props).toEqual({
      width: 1,
      height: 1,
      color: 0x123456,
    })
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
  })

  it('does not mutate its input', () => {
    const before = structuredClone(tile)
    setCollisionEnabled(tile, false)
    expect(tile).toEqual(before)
  })
})
