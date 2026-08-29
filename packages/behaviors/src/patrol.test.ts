import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Hitbox,
  StateMachine,
  THREE,
  installArchetype,
  installDirectionalAnimation,
  isAnimationFacingProvider,
  resetRegistries,
  type Component,
  type DirectionalAnimation,
  type Entity,
  type Game,
} from '@waica/engine'
import { Health } from './health'
import { MeleeAttack } from './melee-attack'
import { PATROLLER_ROLE, PATROLLER_STATE_GRAPH, Patrol, type PatrolAxis } from './patrol'

const EIGHT_WAY: DirectionalAnimation = {
  directions: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'],
  fallbacks: { w: { dir: 'e', flip: true }, nw: { dir: 'ne', flip: true }, sw: { dir: 'se', flip: true } },
  contract: { required: ['idle'], fallbacks: { walk: 'idle' } },
}

function makePatrol(axis: PatrolAxis, x = 0, y = 0, projection: 'isometric' | null = null): Patrol {
  const patrol = new Patrol()
  patrol.game = { projection } as unknown as Game
  patrol.entity = {
    position: { x, y },
    scale: { x: 1, y: 1 },
  } as unknown as Entity
  patrol.axis = axis
  patrol.distance = 2
  patrol.speed = 2
  patrol.onReady()
  return patrol
}

afterEach(() => installDirectionalAnimation(null))

describe('Patrol', () => {
  it('walks sideways and turns around at the rail ends', () => {
    const patrol = makePatrol('horizontal', 5)
    patrol.step(0.5) // +1
    expect(patrol.entity.position.x).toBeCloseTo(6)
    expect(patrol.entity.scale.x).toBe(1)
    patrol.step(1) // clamps at origin + distance, turns
    expect(patrol.entity.position.x).toBeCloseTo(7)
    patrol.step(0.5) // now walking back
    expect(patrol.entity.position.x).toBeCloseTo(6)
    expect(patrol.entity.scale.x).toBe(-1)
    expect(patrol.entity.position.y).toBe(0)
  })

  it('floats up and down on the vertical axis, without flipping the sprite', () => {
    const patrol = makePatrol('vertical', 0, 3)
    patrol.step(0.5) // +1
    expect(patrol.entity.position.y).toBeCloseTo(4)
    patrol.step(1) // clamps at origin + distance, turns
    expect(patrol.entity.position.y).toBeCloseTo(5)
    patrol.step(0.5) // now moving down
    expect(patrol.entity.position.y).toBeCloseTo(4)
    expect(patrol.entity.position.x).toBe(0)
    expect(patrol.entity.scale.x).toBe(1)
  })

  it('turns back at the bottom end of a vertical rail', () => {
    const patrol = makePatrol('vertical', 0, 0)
    patrol.step(1.5) // past the top: clamp at +2, turn
    patrol.step(2.5) // past the bottom: clamp at -2, turn
    expect(patrol.entity.position.y).toBeCloseTo(-2)
    patrol.step(0.5)
    expect(patrol.entity.position.y).toBeCloseTo(-1)
  })
})

describe('Patrol facing', () => {
  it('is the explicit seam the StateMachine resolves directional clips through', () => {
    expect(isAnimationFacingProvider(new Patrol())).toBe(true)
  })

  it('reports the rail direction as seen on screen without a projection', () => {
    const horizontal = makePatrol('horizontal')
    expect(horizontal.getAnimationFacing()).toBe('e')
    horizontal.step(1.5) // turns at the end
    expect(horizontal.getAnimationFacing()).toBe('w')

    const vertical = makePatrol('vertical')
    expect(vertical.getAnimationFacing()).toBe('n')
    vertical.step(1.5)
    expect(vertical.getAnimationFacing()).toBe('s')
  })

  it('reports the projected rail under the isometric projection: x runs SE/NW, y runs SW/NE', () => {
    const horizontal = makePatrol('horizontal', 0, 0, 'isometric')
    expect(horizontal.getAnimationFacing()).toBe('se')
    horizontal.step(1.5)
    expect(horizontal.getAnimationFacing()).toBe('nw')

    const vertical = makePatrol('vertical', 0, 0, 'isometric')
    expect(vertical.getAnimationFacing()).toBe('sw')
    vertical.step(1.5)
    expect(vertical.getAnimationFacing()).toBe('ne')
  })

  it('leaves the scale alone when a directional contract does the mirroring', () => {
    installDirectionalAnimation(EIGHT_WAY)
    const patrol = makePatrol('horizontal', 0, 0, 'isometric')

    patrol.step(1.5)
    patrol.step(0.5)

    expect(patrol.entity.position.x).toBeCloseTo(1)
    expect(patrol.entity.scale.x).toBe(1)
    expect(patrol.getAnimationFacing()).toBe('nw')
  })
})

describe('the patroller role takes hits and dies', () => {
  beforeEach(() => installArchetype({ roles: { patroller: PATROLLER_ROLE } }))
  afterEach(() => resetRegistries())

  const DT = 1 / 60

  /** A real machine over the real patroller graph, a Health of 2 and a striker in front. */
  function makeOrc() {
    const game = {
      entities: [] as Entity[],
      projection: 'isometric',
      input: { justPressed: () => false, consumed: () => false, consume: vi.fn(), axis: () => 0 },
      stats: { add: vi.fn(), set: vi.fn() },
      events: { emit: vi.fn() },
    } as unknown as Game
    const makeEntity = (name: string, x: number, y: number) => {
      const list: Component[] = []
      const entity = {
        name,
        game,
        alive: true,
        node: { visible: true },
        position: new THREE.Vector3(x, y, 0),
        scale: new THREE.Vector3(1, 1, 1),
        // Like Entity.destroy: idempotent, and the game stops updating it.
        destroy: vi.fn(() => {
          entity.alive = false
        }),
        get(Class: new () => Component) {
          return list.find((component) => component instanceof Class)
        },
        has(Class: new () => Component) {
          return list.some((component) => component instanceof Class)
        },
        add<T extends Component>(component: T): T {
          component.entity = entity as unknown as Entity
          component.game = game
          list.push(component)
          component.onReady?.()
          return component
        },
      }
      game.entities.push(entity as unknown as Entity)
      return entity
    }

    const orc = makeEntity('Orc', 0, 0)
    const hitbox = orc.add(new Hitbox())
    hitbox.width = 0.8
    hitbox.height = 0.7
    const patrol = orc.add(new Patrol())
    patrol.axis = 'horizontal'
    patrol.distance = 2
    patrol.speed = 2
    const health = new Health()
    health.max = 2
    health.invulnerability = 0.3
    orc.add(health)
    const machine = new StateMachine()
    machine.role = 'patroller'
    machine.initial = PATROLLER_STATE_GRAPH.initial
    machine.states = structuredClone(PATROLLER_STATE_GRAPH.states)
    orc.add(machine)

    // The striker stands screen-west of the orc: logical (−x, +y).
    const player = makeEntity('Player', -0.5, 0.5)
    const attack = player.add(new MeleeAttack())

    return {
      orc,
      health,
      machine,
      attack,
      frame(dt = DT) {
        if (!orc.alive) return
        machine.onUpdate(dt)
        health.onUpdate(dt)
      },
      frames(seconds: number) {
        for (let t = 0; t < seconds - 1e-9; t += DT) this.frame()
      },
    }
  }

  it('declares walk, hurt and dead with the hurt and death edges from any state', () => {
    expect(PATROLLER_STATE_GRAPH).toEqual({
      initial: 'walk',
      states: {
        walk: {},
        hurt: { transitions: [{ on: 'timer:0.25', to: 'walk' }] },
        dead: { clip: 'death' },
        '*': {
          transitions: [
            { on: 'signal:death', to: 'dead' },
            { on: 'signal:hurt', to: 'hurt' },
          ],
        },
      },
    })
  })

  it('stops the rail while hurt and resumes walking after the beat', () => {
    const orc = makeOrc()
    orc.frames(0.1)
    const walked = orc.orc.position.x
    expect(walked).toBeGreaterThan(0)

    expect(orc.attack.strike('e')).toEqual([orc.orc])
    // The signal lands on the next update: walk steps once more, then the
    // machine moves to hurt for the rest of the beat.
    orc.frame()
    expect(orc.machine.current).toBe('hurt')
    expect(orc.health.current).toBe(1)
    const flinchedAt = orc.orc.position.x
    orc.frames(0.2)
    expect(orc.orc.position.x).toBe(flinchedAt)

    orc.frames(0.1)
    expect(orc.machine.current).toBe('walk')
    orc.frame()
    expect(orc.orc.position.x).toBeGreaterThan(flinchedAt)
  })

  it('takes two strikes to die, then disappears half a second later', () => {
    const orc = makeOrc()

    orc.attack.strike('e')
    orc.frames(0.35)
    expect(orc.machine.current).toBe('walk')
    orc.attack.strike('e')
    orc.frame()

    expect(orc.health.current).toBe(0)
    expect(orc.machine.current).toBe('dead')
    orc.frames(0.4)
    expect(orc.orc.destroy).not.toHaveBeenCalled()
    orc.frames(0.15)
    expect(orc.orc.destroy).toHaveBeenCalledOnce()
  })

  it('counts two strikes on the same instant once — the invulnerability window', () => {
    const orc = makeOrc()

    orc.attack.strike('e')
    orc.attack.strike('e')
    orc.frame()

    expect(orc.health.current).toBe(1)
    expect(orc.machine.current).toBe('hurt')
  })
})
