import { describe, expect, it, vi } from 'vitest'
import { StateMachine, THREE, type ComponentClass, type Entity, type Game } from '@waica/engine'
import { Chaser } from './chaser'

function makePlayer(game: Game, name: string, x: number): Entity {
  const machine = { role: 'player' }
  return {
    name,
    game,
    alive: true,
    position: new THREE.Vector3(x, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    get(component: ComponentClass) {
      return component === StateMachine ? machine : undefined
    },
  } as unknown as Entity
}

describe('Chaser target contract', () => {
  it('keeps the first live player instead of switching to a closer later player', () => {
    const entities: Entity[] = []
    const nearest = vi.fn(() => {
      throw new Error('Chaser must not use the generic nearest query')
    })
    const game = {
      entities,
      query: { nearest },
    } as unknown as Game
    const chaserEntity = {
      name: 'Chaser',
      game,
      alive: true,
      position: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      get: () => undefined,
    } as unknown as Entity
    const firstPlayer = makePlayer(game, 'First player', 5)
    entities.push(chaserEntity, firstPlayer)
    const chaser = new Chaser()
    chaser.entity = chaserEntity
    chaser.game = game
    chaser.mode = 'ghost'
    chaser.range = 10
    chaser.speed = 1

    chaser.step(1)
    const laterCloserPlayer = makePlayer(game, 'Later closer player', -0.5)
    entities.push(laterCloserPlayer)
    chaser.step(1)

    expect(chaserEntity.position.x).toBe(2)
    expect(nearest).not.toHaveBeenCalled()
  })
})
