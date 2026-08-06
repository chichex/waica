import { describe, expect, it, vi } from 'vitest'
import { StateMachine, THREE, type Component, type Entity, type Game } from '@waica/engine'
import { Hazard } from './hazard'
import { Health } from './health'
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

function playerMachine(): StateMachine {
  const machine = new StateMachine()
  machine.role = 'player'
  return machine
}

/**
 * A slime at the origin and a player above it. `stomping` picks which of the
 * two contacts resolveHazardTouch will report: falling from above squashes,
 * anything else hurts.
 */
function scene(stomping: boolean) {
  const game = makeGame()
  const hazardEntity = makeEntity(game, 'Slime', 0, 0)
  const hazard = new Hazard()
  hazardEntity.addStub(hazard)

  const player = makeEntity(game, 'Player', 0, stomping ? 1 : -1)
  player.addStub(playerMachine())
  const motor = new PlatformerMotor()
  motor.vy = stomping ? -5 : 1
  player.addStub(motor)

  return { game, hazardEntity, hazard, player, motor }
}

function withHealth(entity: StubEntity, max: number): Health {
  const health = new Health()
  health.max = max
  entity.addStub(health)
  health.onReady()
  return health
}

describe('Hazard stomp', () => {
  it('damages the hazard that can be hurt instead of destroying it outright', () => {
    const { hazardEntity, hazard, motor } = scene(true)
    const health = withHealth(hazardEntity, 3)
    hazard.stompDamage = 2

    hazard.onCollide(hazardEntity.game.entities[1] as Entity)

    expect(health.current).toBe(1)
    expect(hazardEntity.destroy).not.toHaveBeenCalled()
    expect(motor.vy).toBe(hazard.bounce)
  })

  it('kills a one-health hazard in a single stomp, as the archetype expects', () => {
    const { hazardEntity, hazard, player } = scene(true)
    const health = withHealth(hazardEntity, 1)

    hazard.onCollide(player)

    expect(health.current).toBe(0)
    expect(hazardEntity.destroy).toHaveBeenCalledOnce()
  })

  it('keeps destroying a hazard with no Health — the legacy path is unchanged', () => {
    const { hazardEntity, hazard, player, motor } = scene(true)
    hazard.bounce = 12

    hazard.onCollide(player)

    expect(hazardEntity.destroy).toHaveBeenCalledOnce()
    expect(motor.vy).toBe(12)
  })

  it('bounces the player either way, Health or not', () => {
    const stompable = scene(true)
    withHealth(stompable.hazardEntity, 5)
    stompable.hazard.bounce = 9

    stompable.hazard.onCollide(stompable.player)

    expect(stompable.motor.vy).toBe(9)
  })

  it('does not hurt the stomper on the next overlapping frame when the hazard survives', () => {
    // The bounce sets motor.vy to +bounce, so the very next collision check
    // (hitboxes still overlapping — nothing has moved apart yet) reads as
    // 'hurt' by resolveHazardTouch's own rules (vy is no longer < 0). Before
    // this PR the hazard always destroyed itself on a stomp, so the pair
    // could never collide again; now a survivor must remember it was just
    // stomped instead of hurting the player it's still bouncing away from.
    const { hazardEntity, hazard, player, motor } = scene(true)
    withHealth(hazardEntity, 3)
    const playerHealth = withHealth(player, 3)
    hazard.stompDamage = 1

    hazard.onCollide(player)
    expect(motor.vy).toBe(hazard.bounce)

    hazard.onCollide(player)

    expect(playerHealth.current).toBe(3)
  })
})

describe('Hazard contact', () => {
  it('damages a player that can be hurt, naming itself as the source', () => {
    const { hazardEntity, hazard, player } = scene(false)
    const health = withHealth(player, 3)
    hazard.contactDamage = 2

    hazard.onCollide(player)

    expect(health.current).toBe(1)
    expect(player.game.events.emit).toHaveBeenCalledWith('damage', {
      entity: player,
      amount: 2,
      current: 1,
      source: hazardEntity,
    })
  })

  it('respawns a player with no Health — the legacy path is unchanged', () => {
    const { hazard, player } = scene(false)
    const respawnable = new Respawnable()
    const respawn = vi.spyOn(respawnable, 'respawn').mockImplementation(() => {})
    player.addStub(respawnable)

    hazard.onCollide(player)

    expect(respawn).toHaveBeenCalledOnce()
  })

  it('does not respawn a player that took the damage instead', () => {
    const { hazard, player } = scene(false)
    withHealth(player, 3)
    const respawnable = new Respawnable()
    const respawn = vi.spyOn(respawnable, 'respawn').mockImplementation(() => {})
    player.addStub(respawnable)

    hazard.onCollide(player)

    expect(respawn).not.toHaveBeenCalled()
  })

  it('leaves the hazard itself untouched when it only hurts', () => {
    const { hazardEntity, hazard, player } = scene(false)
    withHealth(hazardEntity, 3)
    withHealth(player, 3)

    hazard.onCollide(player)

    expect(hazardEntity.get(Health)!.current).toBe(3)
    expect(hazardEntity.destroy).not.toHaveBeenCalled()
  })
})

describe('Hazard damage amounts', () => {
  it('deals one point per hit by default, on both halves of the interaction', () => {
    const hazard = new Hazard()

    expect(hazard.stompDamage).toBe(1)
    expect(hazard.contactDamage).toBe(1)
  })

  it('exposes both amounts to the inspector', () => {
    expect(Object.keys(Hazard.params ?? {}).sort()).toEqual([
      'bounce',
      'contactDamage',
      'stompDamage',
      'stompable',
    ])
  })
})
