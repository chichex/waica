import { describe, expect, expectTypeOf, it } from 'vitest'
import { Hitbox } from './components/hitbox.js'
import { Entity } from './entity.js'
import { Game, type ParamOverrides } from './game.js'
import { resolveEntityComponents, type PrefabJson } from './scene.js'

type ParamOverrideValue = ParamOverrides[string][string][string]

describe('Hitbox string-list authoring', () => {
  it('accepts only scalar or string-list parameter override values', () => {
    expectTypeOf<ParamOverrideValue>().toEqualTypeOf<
      number | boolean | string | string[]
    >()
  })

  it('preserves authored arrays, including an empty instance override', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'character',
      components: [
        {
          type: 'Hitbox',
          props: { layer: 'player', collidesWith: ['enemy', 'collectible'] },
        },
      ],
    }
    const resolved = resolveEntityComponents(
      {
        name: 'Hero',
        prefab: 'characters/hero',
        overrides: { Hitbox: { collidesWith: [] } },
      },
      { 'characters/hero': prefab },
    )

    expect(resolved[0]?.props).toEqual({ layer: 'player', collidesWith: [] })

    const emptyMask: string[] = []
    const paramOverrides: ParamOverrides = {
      Hero: { Hitbox: { layer: 'player', collidesWith: emptyMask } },
    }
    const entities: Entity[] = []
    const game = {
      entities,
      projection: null,
      paramOverrides,
      applyParamOverrides: Game.prototype.applyParamOverrides,
      removeEntity(entity: Entity) {
        const index = entities.indexOf(entity)
        if (index >= 0) entities.splice(index, 1)
      },
    } as unknown as Game
    const entity = new Entity(game, 'Hero')
    entities.push(entity)
    const hitbox = entity.add(Hitbox)

    expect(hitbox.layer).toBe('player')
    expect(hitbox.collidesWith).toBe(emptyMask)
    expect(hitbox.collidesWith).toEqual([])
  })
})
