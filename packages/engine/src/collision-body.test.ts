import { describe, expect, it } from 'vitest'
import type { Component } from './component'
import { collisionBody } from './collision-body'
import { Hitbox } from './components/hitbox'
import { Solid } from './components/solid'
import { Entity } from './entity'
import type { Game } from './game'

function makeEntity(name = 'Owner'): Entity {
  const entities: Entity[] = []
  const game = {
    entities,
    applyParamOverrides: () => {},
    removeEntity(entity: Entity) {
      const index = entities.indexOf(entity)
      if (index >= 0) entities.splice(index, 1)
    },
  } as unknown as Game
  const entity = new Entity(game, name)
  entities.push(entity)
  return entity
}

function mount<T extends Component>(entity: Entity, component: T): T {
  component.entity = entity
  component.game = entity.game
  entity.components.push(component)
  return component
}

describe('collisionBody', () => {
  it('resolves identical owner-relative geometry for Hitbox and Solid', () => {
    const owner = makeEntity()
    owner.position.set(3, -4, 9)
    const points: Array<[number, number]> = [
      [-0.5, -0.25],
      [0.5, -0.25],
      [0, 0.5],
    ]
    const hitbox = mount(owner, new Hitbox())
    const solid = mount(owner, new Solid())
    for (const component of [hitbox, solid]) {
      component.offsetX = 0.75
      component.offsetY = -1.25
      component.width = -6
      component.height = 2
      component.shape = 'polygon'
      component.points = points
    }

    expect(collisionBody(hitbox)).toEqual({
      x: 3.75,
      y: -5.25,
      width: -6,
      height: 2,
      shape: 'polygon',
      points,
    })
    expect(collisionBody(solid)).toEqual(collisionBody(hitbox))
  })

  it('reads the owner transform live on every conversion', () => {
    const owner = makeEntity()
    const hitbox = owner.add(Hitbox, { offsetX: 2, offsetY: -3 })

    expect(collisionBody(hitbox)).toMatchObject({ x: 2, y: -3 })
    owner.position.set(5, 7, 0)
    expect(collisionBody(hitbox)).toMatchObject({ x: 7, y: 4 })
  })
})
