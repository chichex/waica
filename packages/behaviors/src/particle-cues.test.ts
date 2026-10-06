// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @waica/engine resolves its own nested `three` copy, so the mock has to
// target that exact module — same technique as scene-transition.test.ts.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { defineStates, Game, ParticleEmitter, resetRegistries, StateMachine, type Entity } from '@waica/engine'
import { DamagePuff } from './damage-puff'
import { DustPuffs } from './dust-puffs'
import { DustTrail } from './dust-trail'
import { Health } from './health'
import { PlatformerMotor } from './platformer-motor'
import { SwingSparks } from './swing-sparks'
import { defined } from '../../engine/src/test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const games: Game[] = []

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  const game = new Game({ canvas })
  games.push(game)
  return game
}

/** An emitter that never loses a particle during a test: long-lived, no continuous rate. */
const BURST_ONLY = { rate: 0, lifetime: 100, capacity: 256 }

/** A state machine with the named states and no edges: tests drive it with goto(). */
function addMachine(entity: Entity, states: string[], initial: string): StateMachine {
  return entity.add(StateMachine, {
    initial,
    states: Object.fromEntries(states.map((state) => [state, {}])),
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  for (const game of games.splice(0)) game.dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetRegistries()
})

describe('SwingSparks', () => {
  it('bursts `count` sparks every time the machine enters its state, and never otherwise', () => {
    const hero = makeGame().spawn('Hero')
    const machine = addMachine(hero, ['idle', 'walk', 'attack'], 'idle')
    const sparks = hero.add(ParticleEmitter, BURST_ONLY)
    hero.add(SwingSparks, { state: 'attack', count: 7 })

    machine.goto('walk')
    expect(sparks.active).toBe(0)
    machine.goto('attack')
    expect(sparks.active).toBe(7)
    machine.goto('idle')
    machine.goto('attack')
    expect(sparks.active).toBe(14)
  })

  it('warns and stays inert when its siblings are not mounted before it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hero = makeGame().spawn('Hero')
    hero.add(SwingSparks)
    const machine = addMachine(hero, ['idle', 'attack'], 'idle')
    const sparks = hero.add(ParticleEmitter, BURST_ONLY)

    machine.goto('attack')

    expect(sparks.active).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SwingSparks needs a StateMachine'))
  })
})

describe('DamagePuff', () => {
  it('moves to whoever Health reports as damaged and puffs `count` particles there', () => {
    const game = makeGame()
    const smoke = game.spawn('Smoke')
    const puff = smoke.add(ParticleEmitter, BURST_ONLY)
    smoke.add(DamagePuff, { count: 6 })
    const victim = game.spawn('Victim')
    victim.position.set(3, -2, 0)
    const health = victim.add(Health, { max: 3 })

    health.damage(1)

    expect(puff.active).toBe(6)
    expect([smoke.position.x, smoke.position.y]).toEqual([3, -2])
  })

  it('ignores a damage event that names no entity', () => {
    const game = makeGame()
    const smoke = game.spawn('Smoke')
    const puff = smoke.add(ParticleEmitter, BURST_ONLY)
    smoke.add(DamagePuff)

    game.events.emit('damage', { entity: 'not an entity' })
    game.events.emit('damage')

    expect(puff.active).toBe(0)
    expect([smoke.position.x, smoke.position.y]).toEqual([0, 0])
  })
})

describe('DamagePuff lifetime', () => {
  it('unsubscribes from the damage event when its entity is destroyed', () => {
    const game = makeGame()
    const subscribe = game.events.on.bind(game.events)
    let damageOff: ReturnType<typeof vi.fn> | undefined
    vi.spyOn(game.events, 'on').mockImplementation((event, handler) => {
      const off = vi.fn(subscribe(event, handler))
      if (event === 'damage') damageOff = off
      return off
    })
    const smoke = game.spawn('Smoke')
    smoke.add(ParticleEmitter, BURST_ONLY)
    smoke.add(DamagePuff)
    const off = defined(damageOff, "DamagePuff's damage subscription")
    expect(off).not.toHaveBeenCalled()

    smoke.destroy()

    expect(off).toHaveBeenCalledOnce()
  })

})

describe('DustTrail', () => {
  it('emits only while the machine is in its state', () => {
    const hero = makeGame().spawn('Hero')
    const machine = addMachine(hero, ['idle', 'walk'], 'idle')
    const dust = hero.add(ParticleEmitter, { rate: 10, emitting: true })
    hero.add(DustTrail, { state: 'walk' })

    expect(dust.emitting).toBe(false)
    machine.goto('walk')
    expect(dust.emitting).toBe(true)
    machine.goto('idle')
    expect(dust.emitting).toBe(false)
  })

  it('starts emitting when the machine already sits in its state', () => {
    const hero = makeGame().spawn('Hero')
    addMachine(hero, ['idle', 'walk'], 'walk')
    const dust = hero.add(ParticleEmitter, { rate: 10, emitting: false })
    hero.add(DustTrail, { state: 'walk' })

    expect(dust.emitting).toBe(true)
  })
})

/** A platformer body with the stock ground/air states, standing on the ground in 'idle'. */
function makeJumper() {
  const hero = makeGame().spawn('Hero')
  const motor = hero.add(PlatformerMotor)
  motor.grounded = true
  const machine = addMachine(hero, ['idle', 'run', 'jump', 'fall', 'dead', 'dash'], 'idle')
  const dust = hero.add(ParticleEmitter, BURST_ONLY)
  hero.add(DustPuffs, { jumpCount: 3, landCount: 8 })
  return { motor, machine, dust }
}

describe('DustPuffs takeoff', () => {
  it('puffs `jumpCount` when a jump leaves idle or run', () => {
    const { motor, machine, dust } = makeJumper()

    machine.goto('jump')
    expect(dust.active).toBe(3)
    motor.grounded = false
    machine.goto('fall')
    motor.grounded = true
    machine.goto('run')
    const beforeRunJump = dust.active
    machine.goto('jump')
    expect(dust.active).toBe(beforeRunJump + 3)
  })

  it('raises no dust when a jump starts in mid-air from a fall (stomp bounce, coyote jump)', () => {
    const { motor, machine, dust } = makeJumper()
    motor.grounded = false
    machine.goto('fall')

    machine.goto('jump')

    expect(dust.active).toBe(0)
  })
})

describe('DustPuffs landing', () => {
  it.each(['jump', 'fall'])('bursts `landCount` on a grounded exit from %s', (air) => {
    const { motor, machine, dust } = makeJumper()
    motor.grounded = false
    machine.goto('fall')
    machine.goto(air)
    const before = dust.active

    motor.grounded = true
    machine.goto('idle')

    expect(dust.active).toBe(before + 8)
  })

  it('bursts nothing when an airborne state is left in the air', () => {
    const { motor, machine, dust } = makeJumper()
    motor.grounded = false
    machine.goto('fall')

    machine.goto('dead')

    expect(dust.active).toBe(0)
  })
})

describe('DustPuffs with project states', () => {
  it('raises no takeoff puff for a jump entered in mid-air from a custom state (idle -> dash -> jump)', () => {
    const { motor, machine, dust } = makeJumper()
    machine.goto('dash')
    motor.grounded = false

    machine.goto('jump')

    expect(dust.active).toBe(0)
  })

  it("keeps the role's own exit hooks running on the states it watches", () => {
    const exited = vi.fn()
    defineStates('dust-probe', { idle: { onExit: exited } })
    const hero = makeGame().spawn('Hero')
    hero.add(PlatformerMotor).grounded = true
    const machine = hero.add(StateMachine, {
      role: 'dust-probe',
      initial: 'idle',
      states: { idle: {}, jump: {} },
    })
    const dust = hero.add(ParticleEmitter, BURST_ONLY)
    hero.add(DustPuffs, { jumpCount: 3 })

    machine.goto('jump')

    expect(exited).toHaveBeenCalledOnce()
    expect(dust.active).toBe(3)
  })
})
