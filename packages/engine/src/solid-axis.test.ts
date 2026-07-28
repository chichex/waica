import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Solid } from './components/solid'
import type { Entity } from './entity'
import type { Game } from './game'
import { resolveSolidAxis } from './solid-axis'

function solidEntity(game: Game, x: number, width: number): Entity {
  const solid = new Solid()
  const entity = {
    game,
    position: new THREE.Vector3(x, 0, 0),
    get(Class: unknown) {
      return Class === Solid ? solid : undefined
    },
  } as unknown as Entity
  solid.entity = entity
  solid.game = game
  solid.width = width
  solid.height = 4
  return entity
}

describe('resolveSolidAxis', () => {
  it('substeps a large displacement and converges on the first thin Solid', () => {
    const game = { entities: [] as Entity[] } as unknown as Game
    const entity = {
      game,
      position: new THREE.Vector3(0, 0, 0),
    } as unknown as Entity
    game.entities.push(entity, solidEntity(game, 1, 0.1))
    entity.position.x = 2.2

    const collided = resolveSolidAxis({
      entity,
      axis: 'x',
      previous: 0,
      body: () => ({
        x: entity.position.x,
        y: entity.position.y,
        width: 0.9,
        height: 0.95,
        shape: 'rectangle',
      }),
    })

    expect(collided).toBe(true)
    expect(entity.position.x).toBeCloseTo(0.5, 3)
  })
})
