import { describe, expect, it, vi } from 'vitest'
import { StateMachine, THREE, type Component, type Entity, type Game } from '@waica/engine'
import { Chaser } from './chaser'
import { Collectible } from './collectible'
import { Hazard } from './hazard'
import { PlatformerMotor } from './platformer-motor'
import { Respawnable } from './respawnable'

interface StubEntity extends Entity {
  addStub(component: Component): void
}

function makeGame(): Game {
  return {
    entities: [],
    stats: { add: vi.fn() },
    events: { emit: vi.fn() },
  } as unknown as Game
}

function makeEntity(game: Game, name: string, x = 0, y = 0): StubEntity {
  const components: Component[] = []
  const entity = {
    name,
    game,
    alive: true,
    position: new THREE.Vector3(x, y, 0),
    scale: new THREE.Vector3(1, 1, 1),
    destroy: vi.fn(),
    get(Class: new () => Component) {
      return components.find((component) => component instanceof Class)
    },
    has(Class: new () => Component) {
      return components.some((component) => component instanceof Class)
    },
    addStub(component: Component) {
      component.entity = entity as unknown as Entity
      component.game = game
      components.push(component)
    },
  } as unknown as StubEntity
  game.entities.push(entity)
  return entity
}

function machine(role: string): StateMachine {
  const stateMachine = new StateMachine()
  stateMachine.role = role
  return stateMachine
}

describe('driver-agnostic player identity', () => {
  it('collects for role=player without requiring a PlatformerMotor', () => {
    const game = makeGame()
    const coinEntity = makeEntity(game, 'Coin')
    const coin = new Collectible()
    coin.entity = coinEntity
    coin.game = game
    const player = makeEntity(game, 'Player')
    player.addStub(machine('player'))

    coin.onCollide(player)

    expect(coinEntity.destroy).toHaveBeenCalledOnce()
    expect(game.events.emit).toHaveBeenCalledWith('collect', 1)
  })

  it('routes generic hazard hurt to role=player without a motor', () => {
    const game = makeGame()
    const hazardEntity = makeEntity(game, 'Hazard')
    const hazard = new Hazard()
    hazard.entity = hazardEntity
    hazard.game = game
    const player = makeEntity(game, 'Player')
    player.addStub(machine('player'))
    const respawnable = new Respawnable()
    const respawn = vi.spyOn(respawnable, 'respawn').mockImplementation(() => {})
    player.addStub(respawnable)

    hazard.onCollide(player)

    expect(respawn).toHaveBeenCalledOnce()
    expect(hazardEntity.destroy).not.toHaveBeenCalled()
  })

  it('keeps stomp math gated on the platformer motor', () => {
    const game = makeGame()
    const hazardEntity = makeEntity(game, 'Hazard', 0, 0)
    const hazard = new Hazard()
    hazard.entity = hazardEntity
    hazard.game = game
    hazard.bounce = 12
    const player = makeEntity(game, 'Player', 0, 1)
    player.addStub(machine('player'))
    const motor = new PlatformerMotor()
    motor.vy = -5
    player.addStub(motor)

    hazard.onCollide(player)

    expect(hazardEntity.destroy).toHaveBeenCalledOnce()
    expect(motor.vy).toBe(12)
  })

  it('makes Chaser pursue role=player even when another motor appears first', () => {
    const game = makeGame()
    const chaserEntity = makeEntity(game, 'Chaser')
    const chaser = new Chaser()
    chaser.entity = chaserEntity
    chaser.game = game
    chaser.mode = 'ghost'
    chaser.range = 10
    chaser.speed = 2

    const motorNpc = makeEntity(game, 'Motor NPC', -4, 0)
    motorNpc.addStub(machine('npc'))
    motorNpc.addStub(new PlatformerMotor())
    const player = makeEntity(game, 'Player', 4, 0)
    player.addStub(machine('player'))

    chaser.step(0.5)

    expect(chaserEntity.position.x).toBeCloseTo(1)
  })

  it('rejects motor-bearing entities whose role is not player across all three behaviors', () => {
    const game = makeGame()
    const motorNpc = makeEntity(game, 'Motor NPC', 4, 0)
    motorNpc.addStub(machine('npc'))
    motorNpc.addStub(new PlatformerMotor())
    const respawnable = new Respawnable()
    const respawn = vi.spyOn(respawnable, 'respawn').mockImplementation(() => {})
    motorNpc.addStub(respawnable)

    const coinEntity = makeEntity(game, 'Coin')
    const coin = new Collectible()
    coin.entity = coinEntity
    coin.game = game
    coin.onCollide(motorNpc)

    const hazardEntity = makeEntity(game, 'Hazard')
    const hazard = new Hazard()
    hazard.stompable = false
    hazard.entity = hazardEntity
    hazard.game = game
    hazard.onCollide(motorNpc)

    const chaserEntity = makeEntity(game, 'Chaser')
    const chaser = new Chaser()
    chaser.entity = chaserEntity
    chaser.game = game
    chaser.mode = 'ghost'
    chaser.range = 10
    chaser.step(0.5)

    expect(coinEntity.destroy).not.toHaveBeenCalled()
    expect(respawn).not.toHaveBeenCalled()
    expect(chaserEntity.position.x).toBe(0)
  })
})
