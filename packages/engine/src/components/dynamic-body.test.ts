import { describe, expect, it } from 'vitest'
import { collisionOverlap, type CollisionBody, type CollisionPoint } from '../collision-shape'
import { Component, type ComponentClass, type SolidContact } from '../component'
import { Entity } from '../entity'
import type { Game } from '../game'
import { DynamicBody } from './dynamic-body'
import { Hitbox } from './hitbox'
import { Solid } from './solid'

interface TestWorld {
  game: Game
  spawn(name: string, x?: number, y?: number): Entity
  addSolid(
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): { entity: Entity; solid: Solid }
}

class ContactProbe extends Component {
  readonly contacts: SolidContact[] = []

  override onContact(contact: SolidContact): void {
    this.contacts.push(contact)
  }
}

function makeWorld(): TestWorld {
  const entities: Entity[] = []
  const game = {
    entities,
    applyParamOverrides: () => {},
    removeEntity(entity: Entity) {
      const index = entities.indexOf(entity)
      if (index !== -1) entities.splice(index, 1)
    },
  } as unknown as Game

  const spawn = (name: string, x = 0, y = 0): Entity => {
    const entity = new Entity(game, name)
    entity.position.set(x, y, 0)
    entities.push(entity)
    return entity
  }

  return {
    game,
    spawn,
    addSolid(name, x, y, width, height) {
      const entity = spawn(name, x, y)
      const solid = entity.add(Solid, { width, height })
      return { entity, solid }
    },
  }
}

function bodyShape(body: DynamicBody): CollisionBody {
  return {
    x: body.entity.position.x + body.offsetX,
    y: body.entity.position.y + body.offsetY,
    width: body.width,
    height: body.height,
    shape: body.shape,
    points: body.points,
  }
}

function solidShape(solid: Solid): CollisionBody {
  return {
    x: solid.entity.position.x + solid.offsetX,
    y: solid.entity.position.y + solid.offsetY,
    width: solid.width,
    height: solid.height,
    shape: solid.shape,
    points: solid.points,
  }
}

function expectClear(body: DynamicBody, solids: Solid[]): void {
  for (const solid of solids) {
    expect(collisionOverlap(bodyShape(body), solidShape(solid))).toBe(false)
  }
}

describe('DynamicBody velocity and Solid resolution', () => {
  it('integrates both public velocity components exactly when unobstructed (CA-1)', () => {
    const world = makeWorld()
    const entity = world.spawn('Mover')
    const body = entity.add(DynamicBody, { vx: 3, vy: -4 })

    body.onUpdate(0.25)

    expect(entity.position.x).toBe(0.75)
    expect(entity.position.y).toBe(-1)
  })

  it.each([
    {
      face: 'left',
      start: [-2, 0] as const,
      velocity: [10, 2] as const,
      axis: 'x' as const,
      contact: -1,
    },
    {
      face: 'right',
      start: [2, 0] as const,
      velocity: [-10, 2] as const,
      axis: 'x' as const,
      contact: 1,
    },
    {
      face: 'bottom',
      start: [0, -2] as const,
      velocity: [2, 10] as const,
      axis: 'y' as const,
      contact: -1,
    },
    {
      face: 'top',
      start: [0, 2] as const,
      velocity: [2, -10] as const,
      axis: 'y' as const,
      contact: 1,
    },
  ])(
    'stops at the Solid $face face, zeroing only the blocked velocity (CA-2)',
    ({ start, velocity, axis, contact }) => {
      const world = makeWorld()
      const entity = world.spawn('Mover', ...start)
      const body = entity.add(DynamicBody, { vx: velocity[0], vy: velocity[1] })
      const span: readonly [number, number] = axis === 'x' ? [1, 4] : [4, 1]
      const { solid } = world.addSolid('Blocker', 0, 0, span[0], span[1])

      body.onUpdate(0.2)

      expect(entity.position[axis]).toBeCloseTo(contact, 3)
      if (axis === 'x') {
        expect(body.vx).toBe(0)
        expect(body.vy).toBe(velocity[1])
      } else {
        expect(body.vx).toBe(velocity[0])
        expect(body.vy).toBe(0)
      }
      expectClear(body, [solid])
    },
  )

  it('cannot tunnel through a Solid thinner than one-frame displacement (CA-3)', () => {
    const world = makeWorld()
    const entity = world.spawn('Fast mover')
    const body = entity.add(DynamicBody, { vx: 100, width: 1, height: 1 })
    const { solid } = world.addSolid('Thin wall', 5, 0, 0.05, 4)

    body.onUpdate(0.1)

    expect(entity.position.x).toBeCloseTo(4.475, 3)
    expect(entity.position.x).toBeLessThan(5)
    expect(body.vx).toBe(0)
    expectClear(body, [solid])
  })
})

describe('DynamicBody initial overlap recovery', () => {
  it('uses the documented -X, +X, -Y, +Y tie order (CA-4)', () => {
    const world = makeWorld()
    const entity = world.spawn('Embedded')
    const body = entity.add(DynamicBody)
    const { solid } = world.addSolid('Blocker', 0, 0, 1, 1)

    body.onUpdate(0)

    expect(entity.position.x).toBeCloseTo(-1, 6)
    expect(entity.position.y).toBe(0)
    expectClear(body, [solid])
  })

  it('chooses the smallest cardinal translation that clears multiple blockers deterministically (CA-4)', () => {
    const outcomes: Array<[number, number]> = []

    for (let run = 0; run < 5; run++) {
      const world = makeWorld()
      const entity = world.spawn('Embedded')
      const body = entity.add(DynamicBody)
      const first = world.addSolid('First', 0, 0, 1, 1).solid
      const second = world.addSolid('Second', -0.75, 0, 1, 1).solid

      body.onUpdate(0)

      outcomes.push([entity.position.x, entity.position.y])
      expect(entity.position.x).toBeCloseTo(1, 6)
      expect(entity.position.y).toBe(0)
      expectClear(body, [first, second])
    }

    expect(outcomes.every(([x, y]) => x === outcomes[0]?.[0] && y === outcomes[0]?.[1])).toBe(
      true,
    )
  })
})

describe('DynamicBody physical contacts and shape ownership', () => {
  it('reports distinct blockers with entity, Solid, axis and unit normal (CA-5)', () => {
    const world = makeWorld()
    const entity = world.spawn('Mover', -2, -2)
    const body = entity.add(DynamicBody, { vx: 10, vy: 10 })
    const probe = entity.add(ContactProbe)
    const vertical = world.addSolid('Vertical wall', 0, -1, 1, 6)
    const horizontal = world.addSolid('Horizontal wall', -1, 0, 6, 1)

    body.onUpdate(0.2)

    expect(probe.contacts).toEqual([
      {
        entity: vertical.entity,
        solid: vertical.solid,
        axis: 'x',
        normal: { x: -1, y: 0 },
      },
      {
        entity: horizontal.entity,
        solid: horizontal.solid,
        axis: 'y',
        normal: { x: 0, y: -1 },
      },
    ])
    expect(new Set(probe.contacts.map(({ solid }) => solid)).size).toBe(2)
  })

  it('collides with an offset rectangle without requiring a Hitbox (CA-7)', () => {
    const world = makeWorld()
    const entity = world.spawn('Rectangle')
    const body = entity.add(DynamicBody, {
      vx: 10,
      width: 0.5,
      height: 0.75,
      offsetX: 0.25,
      offsetY: -0.1,
    })
    const { solid } = world.addSolid('Wall', 1, -0.1, 0.5, 3)

    body.onUpdate(0.2)

    expect(entity.has(Hitbox as ComponentClass<Hitbox>)).toBe(false)
    expect(body.vx).toBe(0)
    expectClear(body, [solid])
  })

  it('uses its own polygon points and offsets without requiring a Hitbox (CA-7)', () => {
    const points: CollisionPoint[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    const world = makeWorld()
    const entity = world.spawn('Polygon')
    const body = entity.add(DynamicBody, {
      vx: 10,
      shape: 'polygon',
      width: 0.8,
      height: 0.6,
      offsetX: 0.2,
      offsetY: 0.3,
      points,
    })
    const { solid } = world.addSolid('Wall', 1, 0.3, 0.4, 3)

    body.onUpdate(0.2)

    expect(entity.has(Hitbox as ComponentClass<Hitbox>)).toBe(false)
    expect(body.points).toBe(points)
    expect(body.vx).toBe(0)
    expectClear(body, [solid])
  })
})
