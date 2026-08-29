import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  StateMachine,
  THREE,
  authoringDefaults,
  installArchetype,
  type Component,
  type Entity,
  type Game,
} from '@waica/engine'
import { Health } from './health'
import { IsoMotor } from './iso-motor'
import { ISO_PLAYER_ROLE, ISO_PLAYER_STATE_GRAPH } from './iso-player-states'
import { MeleeAttack } from './melee-attack'
import { Respawnable } from './respawnable'
import { TOPDOWN_PLAYER_STATE_GRAPH } from './topdown-player-states'

beforeEach(() => installArchetype({ roles: { player: ISO_PLAYER_ROLE } }))

const DT = 1 / 60

/**
 * A player running the real StateMachine over the real shared grid graph,
 * with a real IsoMotor under an isometric projection: the seam is what the
 * machine does with an attack press and a hurt signal, not what a stub says.
 */
function makePlayer() {
  const components: Component[] = []
  let pressed = new Set<string>()
  let held: Record<string, number> = {}
  const consumed = new Set<string>()
  const input = {
    axis: (negative = 'left', positive = 'right') => (held[positive] ?? 0) - (held[negative] ?? 0),
    justPressed: (action: string) => pressed.has(action),
    consumed: (action: string) => consumed.has(action),
    consume: (action: string) => consumed.add(action),
  }
  const game = {
    entities: [] as Entity[],
    input,
    projection: 'isometric',
    ui: { show: vi.fn(), hide: vi.fn() },
    stats: { add: vi.fn(), set: vi.fn() },
    events: { emit: vi.fn() },
  } as unknown as Game
  const makeEntity = (name: string, x: number, y: number, list: Component[]): Entity => {
    const entity = {
      name,
      game,
      alive: true,
      node: { visible: true },
      position: new THREE.Vector3(x, y, 0),
      scale: new THREE.Vector3(1, 1, 1),
      destroy: vi.fn(),
      get(Class: new () => Component) {
        return list.find((component) => component instanceof Class)
      },
      has(Class: new () => Component) {
        return list.some((component) => component instanceof Class)
      },
    } as unknown as Entity
    game.entities.push(entity)
    return entity
  }
  const entity = makeEntity('Player', 0, 0, components)
  const add = <T extends Component>(component: T): T => {
    component.entity = entity
    component.game = game
    components.push(component)
    component.onReady?.()
    return component
  }

  const motor = add(new IsoMotor())
  const health = new Health()
  health.max = 3
  health.invulnerability = 1
  add(health)
  const attack = add(new MeleeAttack())
  const strike = vi.spyOn(attack, 'strike')
  add(new Respawnable())
  const machine = new StateMachine()
  machine.role = 'player'
  machine.initial = ISO_PLAYER_STATE_GRAPH.initial
  machine.states = structuredClone(ISO_PLAYER_STATE_GRAPH.states)
  add(machine)

  return {
    entity,
    game,
    machine,
    motor,
    health,
    strike,
    /** One simulation frame in the deterministic order: machine, then health. */
    frame(dt = DT) {
      machine.onUpdate(dt)
      health.onUpdate(dt)
      pressed = new Set()
      consumed.clear()
    },
    press(action: string) {
      pressed = new Set([action])
    },
    hold(actions: Record<string, number>) {
      held = actions
    },
    /** A stub attacker standing at logical (x, y), for hurt knockback. */
    source(x: number, y: number): Entity {
      return makeEntity('Orc', x, y, [])
    },
  }
}

describe('the shared grid player graph', () => {
  it.each([ISO_PLAYER_STATE_GRAPH, TOPDOWN_PLAYER_STATE_GRAPH])(
    'enters attack on the attack press from idle and walk, and leaves it on a timer',
    ({ states }) => {
      const press = (action: string) => (candidate: string) => candidate === action
      const env = (justPressed: (action: string) => boolean, elapsed = 0) => ({
        justPressed,
        elapsed,
        signals: new Set<string>(),
      })
      const edge = (from: string, e: ReturnType<typeof env>) =>
        [...(states[from]?.transitions ?? []), ...(states['*']?.transitions ?? [])].find((t) => {
          const [kind, arg] = t.on.split(':')
          if (kind === 'input') return e.justPressed(arg!)
          if (kind === 'timer') return e.elapsed >= Number(arg)
          return e.signals.has(arg!)
        })
      expect(edge('idle', env(press('attack')))?.to).toBe('attack')
      expect(edge('walk', env(press('attack')))?.to).toBe('attack')
      expect(edge('attack', env(press('attack')))).toBeUndefined()
      expect(edge('attack', env(() => false, 0.29))).toBeUndefined()
      expect(edge('attack', env(() => false, 0.3))?.to).toBe('idle')
      expect(edge('hurt', env(() => false, 0.3))?.to).toBe('idle')
    },
  )

  it.each([ISO_PLAYER_STATE_GRAPH, TOPDOWN_PLAYER_STATE_GRAPH])(
    'lists death before hurt on the from-any-state edges, so a lethal hit wins the race',
    ({ states }) => {
      expect(states['*']?.transitions).toEqual([
        { on: 'signal:death', to: 'dead' },
        { on: 'signal:hurt', to: 'hurt' },
      ])
    },
  )

  it.each([ISO_PLAYER_STATE_GRAPH, TOPDOWN_PLAYER_STATE_GRAPH])(
    'plays the death clip while dead, resolved directionally', ({ states }) => {
      expect(states['dead']?.clip).toBe('death')
    },
  )
})

describe('the attack state', () => {
  it('enters on the press, halts the body and strikes once along the current facing', () => {
    const player = makePlayer()
    player.hold({ right: 1 })
    for (let i = 0; i < 10; i++) player.frame()
    expect(player.motor.facing).toBe('e')
    expect(player.motor.speed()).toBeGreaterThan(0)

    player.press('attack')
    player.frame()

    expect(player.machine.current).toBe('attack')
    expect(player.strike).toHaveBeenCalledExactlyOnceWith('e')
    expect(player.motor.vx).toBe(0)
    expect(player.motor.vy).toBe(0)
  })

  it('ignores movement input for the whole swing, then hands control back to idle', () => {
    const player = makePlayer()
    player.press('attack')
    player.frame()
    const frozen = player.entity.position.clone()
    player.hold({ right: 1 }) // screen east: logical (+x, −y)

    for (let i = 0; i < 17; i++) player.frame()
    expect(player.machine.current).toBe('attack')
    expect(player.entity.position).toEqual(frozen)

    player.frame()
    expect(player.machine.current).not.toBe('attack')
    for (let i = 0; i < 5; i++) player.frame()
    expect(player.entity.position.x).toBeGreaterThan(frozen.x)
  })

  it('does not restart on a second press while already swinging', () => {
    const player = makePlayer()
    player.press('attack')
    player.frame()

    player.press('attack')
    player.frame()
    player.frame()

    expect(player.machine.current).toBe('attack')
    expect(player.strike).toHaveBeenCalledOnce()
    expect(player.machine.elapsed).toBeGreaterThan(DT * 1.5)
  })

  it('spends the press, so it cannot fire another input transition the same frame', () => {
    const player = makePlayer()
    player.press('attack')
    player.frame()

    expect(player.game.input.consumed('attack')).toBe(false) // cleared by the frame
    expect(player.machine.current).toBe('attack')
  })
})

describe('the hurt state', () => {
  it('enters on a survivable hit and pushes the body away from whoever dealt it', () => {
    const player = makePlayer()
    const orc = player.source(1, 0)

    player.health.damage(1, orc)
    player.frame()

    expect(player.machine.current).toBe('hurt')
    expect(player.motor.vx).toBeCloseTo(-player.motor.knockbackSpeed)
    expect(player.motor.vy).toBeCloseTo(0)
    for (let i = 0; i < 5; i++) player.frame()
    expect(player.entity.position.x).toBeLessThan(0)
  })

  it('ignores input while stunned and stops dead when the stun ends', () => {
    const player = makePlayer()
    player.health.damage(1, player.source(1, 0))
    player.frame()
    player.hold({ right: 1, down: 1 }) // screen south-east: logical +x

    for (let i = 0; i < 16; i++) player.frame()
    expect(player.machine.current).toBe('hurt')
    expect(player.motor.vx).toBeLessThan(0)
    const pushed = player.entity.position.x

    player.frame()
    player.frame()
    expect(player.machine.current).toBe('idle')
    expect(player.entity.position.x).toBeLessThanOrEqual(pushed + 0.05)
  })

  it('pushes backwards from the facing when the hit has no source', () => {
    const player = makePlayer()
    player.hold({ right: 1 })
    for (let i = 0; i < 5; i++) player.frame()
    player.hold({})
    expect(player.motor.facing).toBe('e')

    player.health.damage(1)
    player.frame()

    // Screen-east is logical (+x, −y); its reverse is (−x, +y).
    expect(player.machine.current).toBe('hurt')
    expect(player.motor.vx).toBeLessThan(0)
    expect(player.motor.vy).toBeGreaterThan(0)
  })

  it('is interrupted by death: a lethal hit while stunned enters dead', () => {
    const player = makePlayer()
    player.health.invulnerability = 0
    player.health.damage(1, player.source(1, 0))
    player.frame()
    expect(player.machine.current).toBe('hurt')

    player.health.damage(Infinity, player.source(1, 0))
    player.frame()

    expect(player.machine.current).toBe('dead')
    expect(player.entity.destroy).not.toHaveBeenCalled()
  })

  it('leaves the knockback speed on the motor as an authorable default', () => {
    expect(authoringDefaults(IsoMotor)).toMatchObject({ knockbackSpeed: 8 })
    expect(IsoMotor.params?.['knockbackSpeed']).toBeDefined()
  })
})
