import { beforeEach, describe, expect, it } from 'vitest'
import {
  defineStates,
  Hitbox,
  resetRegistries,
  Solid,
  StateMachine,
  type Component,
  type ComponentClass,
  type Entity,
  type Game,
} from '@waica/engine'
import { Projectile } from './projectile'

/**
 * A Game is not constructible under vitest (its renderer needs WebGL), and
 * the example does not depend on three to mock it. Projectile only reaches
 * entity positions, components and `game.entities`, so a plain world is
 * enough — and keeps this a test of the project code, not of the engine.
 */
interface TestEntity {
  name: string
  game: Game
  alive: boolean
  position: { x: number; y: number; z: number }
  components: Component[]
  get<T extends Component>(Class: ComponentClass<T>): T | undefined
  destroy(): void
  add<T extends Component>(Class: ComponentClass<T>, props?: Partial<T>): T
}

function makeWorld(): { entities: TestEntity[]; spawn(name: string): TestEntity } {
  const entities: TestEntity[] = []
  const game = { entities } as unknown as Game

  const spawn = (name: string): TestEntity => {
    const entity: TestEntity = {
      name,
      game,
      alive: true,
      position: { x: 0, y: 0, z: 0 },
      components: [],
      get: <T extends Component>(Class: ComponentClass<T>) =>
        entity.components.find((c) => c instanceof Class) as T | undefined,
      destroy: () => {
        if (!entity.alive) return
        entity.alive = false
        const index = entities.indexOf(entity)
        if (index !== -1) entities.splice(index, 1)
      },
      add: <T extends Component>(Class: ComponentClass<T>, props?: Partial<T>) => {
        const component = new Class()
        component.entity = entity as unknown as Entity
        component.game = game
        if (props) Object.assign(component, props)
        entity.components.push(component)
        component.onReady?.()
        return component
      },
    }
    entities.push(entity)
    return entity
  }

  return { entities, spawn }
}

/** A wall centered on x, matching the example's 2-wide side walls. */
function addWall(world: ReturnType<typeof makeWorld>, x: number): TestEntity {
  const wall = world.spawn('Wall')
  wall.position.x = x
  wall.add(Solid, { width: 2, height: 12 })
  return wall
}

/** A bullet carrying the prefab's hitbox, fired to the right. */
function addBullet(world: ReturnType<typeof makeWorld>, x: number): TestEntity {
  const bullet = world.spawn('Bullet')
  bullet.position.x = x
  bullet.add(Hitbox, { width: 0.35, height: 0.18 })
  bullet.add(Projectile, { speed: 18, direction: 1 })
  return bullet
}

beforeEach(() => resetRegistries())

describe('Projectile', () => {
  it('destroys a bullet fired point-blank into a wall instead of flying through it', () => {
    // resolveSolidAxis ignores solids the body already overlaps (the
    // spawn-inside-wall bail), so a muzzle inside the wall used to buy the
    // bullet a free pass for its entire flight.
    const world = makeWorld()
    const wall = addWall(world, 25.5) // spans 24.5 … 26.5
    const bullet = addBullet(world, 24.6) // hitbox 24.425 … 24.775: inside it

    expect(bullet.alive).toBe(false)
    expect(world.entities).not.toContain(bullet)
    expect(wall.alive).toBe(true)
  })

  it('keeps a bullet that spawns clear of every Solid', () => {
    const world = makeWorld()
    addWall(world, 25.5)
    const bullet = addBullet(world, 0)

    expect(bullet.alive).toBe(true)
  })

  it('stops at a Solid it reaches in flight rather than crossing it', () => {
    const world = makeWorld()
    addWall(world, 25.5)
    const bullet = addBullet(world, 24) // clear: hitbox ends at 24.175

    bullet.get(Projectile)?.onUpdate(0.1) // 1.8 units: well past the wall face

    expect(bullet.alive).toBe(false)
    expect(bullet.position.x).toBeLessThan(24.5)
  })

  it('flies straight with no vertical drift when nothing blocks it', () => {
    const world = makeWorld()
    const bullet = addBullet(world, 0)

    bullet.get(Projectile)?.onUpdate(0.1)

    expect(bullet.position.x).toBeCloseTo(1.8)
    expect(bullet.position.y).toBe(0)
  })

  it('destroys a patroller it hits, and itself with it', () => {
    defineStates('patroller', {})
    const world = makeWorld()
    const bullet = addBullet(world, 0)
    const slime = world.spawn('Slime')
    slime.add(StateMachine, { role: 'patroller' })

    bullet.get(Projectile)?.onCollide(slime as unknown as Entity)

    expect(slime.alive).toBe(false)
    expect(bullet.alive).toBe(false)
  })

  it('passes through anything that is not a patroller or chaser', () => {
    defineStates('player', {})
    const world = makeWorld()
    const bullet = addBullet(world, 0)
    const player = world.spawn('Player')
    player.add(StateMachine, { role: 'player' })

    bullet.get(Projectile)?.onCollide(player as unknown as Entity)

    expect(player.alive).toBe(true)
    expect(bullet.alive).toBe(true)
  })
})
