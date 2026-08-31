import { describe, expect, it, vi } from 'vitest'
import { THREE, type Component, type Entity, type Game, type StateContext } from '@waica/engine'
import { ClickToMove, driveClickToMove } from './click-to-move'
import { Health } from './health'
import { Interactable } from './interactable'
import { IsoMotor } from './iso-motor'
import { MeleeAttack } from './melee-attack'

/**
 * A lightweight fake Game/Entity, same shape grid-player-role.test.ts uses:
 * real motor/component classes (the seam under test), fake plumbing around
 * them. No Tilemap/Solid anywhere, so buildNavigationGrid falls back to its
 * AABB mode — exercised on its own in navigation-grid.test.ts.
 */
function makeWorld() {
  const injectAction = vi.fn(() => true)
  const game = {
    entities: [] as Entity[],
    input: { injectAction, axis: () => 0, justPressed: () => false, consumed: () => false, consume: () => {} },
    projection: 'isometric',
    ui: { show: vi.fn(), hide: vi.fn(), isVisible: () => false },
    stats: { set: vi.fn(), get: vi.fn(), add: vi.fn() },
    events: { emit: vi.fn() },
  } as unknown as Game

  const makeEntity = (name: string, x: number, y: number, components: Component[]): Entity => {
    let alive = true
    const entity = {
      name,
      game,
      get alive() {
        return alive
      },
      node: { visible: true },
      position: new THREE.Vector3(x, y, 0),
      scale: new THREE.Vector3(1, 1, 1),
      components,
      destroy: vi.fn(() => {
        alive = false
      }),
      get(Class: new () => Component) {
        return components.find((c) => c instanceof Class)
      },
      has(Class: new () => Component) {
        return components.some((c) => c instanceof Class)
      },
    } as unknown as Entity
    game.entities.push(entity)
    return entity
  }

  const mount = <T extends Component>(entity: Entity, component: T): T => {
    component.entity = entity
    component.game = game
    component.onReady?.()
    return component
  }

  const makePlayer = (x: number, y: number) => {
    const components: Component[] = []
    const entity = makeEntity('Player', x, y, components)
    const motor = mount(entity, new IsoMotor())
    components.push(motor)
    const attack = mount(entity, new MeleeAttack())
    components.push(attack)
    const clickToMove = mount(entity, new ClickToMove())
    components.push(clickToMove)
    return { entity, motor, attack, clickToMove }
  }

  const ctx = (entity: Entity): StateContext =>
    ({ entity, game, fsm: undefined }) as unknown as StateContext

  return { game, makeEntity, mount, makePlayer, ctx, injectAction }
}

describe('driveClickToMove — attack order facing (review finding #2)', () => {
  it('faces the target before swinging when the order starts already inside range', () => {
    const { makePlayer, makeEntity, mount, ctx, injectAction } = makeWorld()
    const { entity, motor, clickToMove } = makePlayer(0, 0)
    motor.facing = 'n' // deliberately wrong/stale — the target is screen-south.

    const targetComponents: Component[] = []
    const target = makeEntity('Target', 0.5, 0.5, targetComponents)
    const health = mount(target, new Health())
    targetComponents.push(health)

    // Already inside MeleeAttack's default range (1) — no waypoints needed.
    clickToMove.order = { kind: 'attack', target, waypoints: [], lastPlannedTarget: { x: 0.5, y: 0.5 } }

    driveClickToMove(ctx(entity), motor)

    expect(motor.facing).toBe('s')
    expect(injectAction).toHaveBeenCalledWith('attack', 'press')
  })
})

describe('driveClickToMove — attack order death check (review finding #3)', () => {
  it('cancels instead of re-attacking a target whose graph kept it alive at 0 health', () => {
    const { makePlayer, makeEntity, mount, ctx, injectAction } = makeWorld()
    const { entity, motor, clickToMove } = makePlayer(0, 0)

    const targetComponents: Component[] = []
    // Alive (its own state graph handles death without destroying it) but dead.
    const target = makeEntity('Target', 0.5, 0.5, targetComponents)
    const health = mount(target, new Health())
    targetComponents.push(health)
    health.current = 0

    clickToMove.order = { kind: 'attack', target, waypoints: [], lastPlannedTarget: { x: 0.5, y: 0.5 } }

    driveClickToMove(ctx(entity), motor)

    expect(clickToMove.order).toBeNull()
    expect(injectAction).not.toHaveBeenCalled()
  })

  it('cancels when the target has no Health at all', () => {
    const { makePlayer, makeEntity, ctx, injectAction } = makeWorld()
    const { entity, motor, clickToMove } = makePlayer(0, 0)
    const target = makeEntity('Target', 0.5, 0.5, [])

    clickToMove.order = { kind: 'attack', target, waypoints: [], lastPlannedTarget: { x: 0.5, y: 0.5 } }

    driveClickToMove(ctx(entity), motor)

    expect(clickToMove.order).toBeNull()
    expect(injectAction).not.toHaveBeenCalled()
  })
})

describe('driveClickToMove — NPC order re-planning (review finding #7)', () => {
  it('re-plans toward the NPC current position once it has moved past the threshold', () => {
    const { makePlayer, makeEntity, mount, ctx } = makeWorld()
    const { entity, motor, clickToMove } = makePlayer(0, 0)

    const npcComponents: Component[] = []
    const npc = makeEntity('Npc', 20, 20, npcComponents)
    const interactable = mount(npc, new Interactable())
    npcComponents.push(interactable)
    interactable.radius = 0.5

    const staleWaypoint = { x: 0, y: 100 }
    clickToMove.order = {
      kind: 'npc',
      target: npc,
      waypoints: [staleWaypoint],
      lastPlannedTarget: { x: 5, y: 5 }, // where the NPC was when this last planned
    }

    driveClickToMove(ctx(entity), motor)

    const order = clickToMove.order
    expect(order?.kind).toBe('npc')
    expect((order as { waypoints: unknown[] }).waypoints).not.toEqual([staleWaypoint])
    expect((order as { lastPlannedTarget: { x: number; y: number } }).lastPlannedTarget).toEqual({ x: 20, y: 20 })
  })
})
