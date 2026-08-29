import { describe, expect, it, vi } from 'vitest'
import { Hitbox, THREE, authoringDefaults, type Component, type Entity, type Game } from '@waica/engine'
import { Health } from './health'
import { MeleeAttack } from './melee-attack'

interface StubEntity extends Entity {
  addStub(component: Component): void
}

function makeGame(projection: 'isometric' | null = 'isometric'): Game {
  return {
    entities: [],
    projection,
    stats: { add: vi.fn(), set: vi.fn() },
    events: { emit: vi.fn() },
  } as unknown as Game
}

function makeEntity(game: Game, name: string, x = 0, y = 0): StubEntity {
  const components: Component[] = []
  const entity = {
    name,
    game,
    alive: true,
    node: { visible: true },
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
      component.onReady?.()
    },
  } as unknown as StubEntity
  game.entities.push(entity)
  return entity
}

function withHitbox(entity: StubEntity, width: number, height: number): void {
  const hitbox = new Hitbox()
  hitbox.width = width
  hitbox.height = height
  entity.addStub(hitbox)
}

function withHealth(entity: StubEntity, max: number): Health {
  const health = new Health()
  health.max = max
  entity.addStub(health)
  return health
}

/** The attacker at the origin plus one orc-shaped target (hitbox 0.8×0.7, 2 HP). */
function arena(orcX: number, orcY: number, projection: 'isometric' | null = 'isometric') {
  const game = makeGame(projection)
  const player = makeEntity(game, 'Player')
  withHitbox(player, 0.8, 0.8)
  const playerHealth = withHealth(player, 3)
  const attack = new MeleeAttack()
  player.addStub(attack)
  const orc = makeEntity(game, 'Orc', orcX, orcY)
  withHitbox(orc, 0.8, 0.7)
  const orcHealth = withHealth(orc, 2)
  return { game, player, playerHealth, attack, orc, orcHealth }
}

// Screen-east is the logical (+x, −y) diagonal under the isometric projection,
// the same mapping IsoMotor moves the player along.
const IN_FRONT = { x: 0.6, y: -0.6 }

describe('MeleeAttack.strike', () => {
  it('damages the target standing in front of the facing and reports it', () => {
    const { attack, orc, orcHealth } = arena(IN_FRONT.x, IN_FRONT.y)

    const struck = attack.strike('e')

    expect(orcHealth.current).toBe(1)
    expect(struck).toEqual([orc])
  })

  it('names the attacker as the damage source', () => {
    const { game, attack, player, orc } = arena(IN_FRONT.x, IN_FRONT.y)

    attack.strike('e')

    expect(game.events.emit).toHaveBeenCalledWith('damage', {
      entity: orc,
      amount: 1,
      current: 1,
      source: player,
    })
  })

  it('misses a target behind the attacker', () => {
    const { attack, orcHealth } = arena(-IN_FRONT.x, -IN_FRONT.y)

    expect(attack.strike('e')).toEqual([])
    expect(orcHealth.current).toBe(2)
  })

  it('misses a target beyond its range', () => {
    const { attack, orcHealth } = arena(1.3, -1.3)

    expect(attack.strike('e')).toEqual([])
    expect(orcHealth.current).toBe(2)
  })

  it('reaches further when range grows', () => {
    const { attack, orcHealth } = arena(1.3, -1.3)
    attack.range = 2.5

    attack.strike('e')

    expect(orcHealth.current).toBe(1)
  })

  it('follows the facing: the same target is hit facing south-east under projection', () => {
    // Logical +x is screen south-east; the orc sits down the x axis, off the
    // screen-east diagonal.
    const { attack, orcHealth } = arena(1.3, 0.6)

    expect(attack.strike('e')).toEqual([])
    attack.strike('se')

    expect(orcHealth.current).toBe(1)
  })

  it('uses plain axes when the scene has no projection', () => {
    const { attack, orc, orcHealth } = arena(0.9, 0, null)

    expect(attack.strike('e')).toEqual([orc])
    expect(orcHealth.current).toBe(1)
  })

  it('never hurts the attacker, even though it has a hitbox and health', () => {
    const { attack, playerHealth } = arena(IN_FRONT.x, IN_FRONT.y)

    attack.strike('e')

    expect(playerHealth.current).toBe(3)
  })

  it('ignores things that have a hitbox but no Health, like crates and villagers', () => {
    const { game, attack } = arena(IN_FRONT.x, IN_FRONT.y)
    const crate = makeEntity(game, 'Crate', IN_FRONT.x, IN_FRONT.y)
    withHitbox(crate, 0.6, 0.6)

    const struck = attack.strike('e')

    expect(struck).not.toContain(crate)
    expect(crate.destroy).not.toHaveBeenCalled()
  })

  it('ignores targets that are no longer alive', () => {
    const { attack, orc, orcHealth } = arena(IN_FRONT.x, IN_FRONT.y)
    ;(orc as { alive: boolean }).alive = false

    expect(attack.strike('e')).toEqual([])
    expect(orcHealth.current).toBe(2)
  })

  it('deals exactly one hit per call, whatever the overlap', () => {
    const { attack, orcHealth } = arena(0.2, -0.2)

    attack.strike('e')

    expect(orcHealth.current).toBe(1)
  })

  it('does not report a target whose invulnerability swallowed the hit', () => {
    const { attack, orc, orcHealth } = arena(IN_FRONT.x, IN_FRONT.y)
    orcHealth.invulnerability = 1

    expect(attack.strike('e')).toEqual([orc])
    expect(attack.strike('e')).toEqual([])
    expect(orcHealth.current).toBe(1)
  })

  it('does nothing for a facing the eight-way table does not know', () => {
    const { attack, orcHealth } = arena(IN_FRONT.x, IN_FRONT.y)

    expect(attack.strike('sideways')).toEqual([])
    expect(orcHealth.current).toBe(2)
  })

  it('applies its damage amount', () => {
    const { attack, orcHealth } = arena(IN_FRONT.x, IN_FRONT.y)
    attack.damage = 2

    attack.strike('e')

    expect(orcHealth.current).toBe(0)
  })
})

describe('MeleeAttack authoring surface', () => {
  it('is a passive component: no update of its own, no schedule constraint', () => {
    expect(MeleeAttack.prototype.onUpdate).toBeUndefined()
    expect(MeleeAttack.updateAfter).toBeUndefined()
  })

  it('exposes damage, range and width with the documented defaults', () => {
    expect(Object.keys(MeleeAttack.params ?? {}).sort()).toEqual(['damage', 'range', 'width'])
    expect(authoringDefaults(MeleeAttack)).toEqual({ damage: 1, range: 1, width: 1 })
  })
})
