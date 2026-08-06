import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AnimatedSprite,
  StateMachine,
  THREE,
  installArchetype,
  type Component,
  type Entity,
  type Game,
} from '@waica/engine'
import { Health } from './health'
import { PLAYER_ROLE, PLAYER_STATE_GRAPH } from './player-states'
import { PlatformerMotor } from './platformer-motor'
import { Respawnable } from './respawnable'

beforeEach(() => installArchetype({ roles: { player: PLAYER_ROLE } }))

/**
 * A player running the real StateMachine over the real player graph: the
 * seam this CA is about is what the machine does with a death signal, not
 * what a stub says it would do.
 */
function makePlayer(spawn: [number, number] = [0, 0]) {
  const components: Component[] = []
  const input = {
    axis: () => 0,
    justPressed: () => false,
    consumed: () => false,
    consume: vi.fn(),
  }
  const game = {
    entities: [],
    input,
    stats: { add: vi.fn() },
    events: { emit: vi.fn() },
  } as unknown as Game
  const entity = {
    name: 'Player',
    game,
    alive: true,
    position: new THREE.Vector3(spawn[0], spawn[1], 0),
    scale: new THREE.Vector3(1, 1, 1),
    destroy: vi.fn(),
    get(Class: new () => Component) {
      return components.find((component) => component instanceof Class)
    },
    has(Class: new () => Component) {
      return components.some((component) => component instanceof Class)
    },
  } as unknown as Entity
  const add = <T extends Component>(component: T): T => {
    component.entity = entity
    component.game = game
    components.push(component)
    component.onReady?.()
    return component
  }

  const health = new Health()
  health.max = 3
  const machine = new StateMachine()
  machine.role = 'player'
  machine.initial = PLAYER_STATE_GRAPH.initial
  machine.states = structuredClone(PLAYER_STATE_GRAPH.states)

  const respawnable = add(new Respawnable())
  add(health)
  const motor = add(new PlatformerMotor())
  add(machine)

  return { entity, game, machine, health, motor, respawnable }
}

/** Seconds the dead state waits before handing control back. */
const DEAD_SECONDS = Number(
  PLAYER_STATE_GRAPH.states.dead?.transitions?.[0]?.on.slice('timer:'.length),
)

describe('the player graph handles its own death', () => {
  it('declares a death edge reachable from every state, not just one', () => {
    expect(PLAYER_STATE_GRAPH.states['*']?.transitions).toEqual([
      { on: 'signal:death', to: 'dead' },
    ])
  })

  it.each(['idle', 'run', 'jump', 'fall'])('enters dead from %s on the death signal', (from) => {
    const { machine } = makePlayer()
    machine.goto(from)

    machine.signal('death')
    machine.onUpdate(0.016)

    expect(machine.current).toBe('dead')
  })

  it('lets Health drive it there: running out of health enters dead', () => {
    const { machine, health } = makePlayer()

    health.damage(3)
    machine.onUpdate(0.016)

    expect(machine.current).toBe('dead')
  })

  it('does not destroy the player, because the graph took responsibility', () => {
    const { entity, health } = makePlayer()

    health.damage(3)

    expect(entity.destroy).not.toHaveBeenCalled()
  })

  it('stays dead for the declared pause, then leaves on the timer', () => {
    const { machine, health } = makePlayer()
    health.damage(3)
    machine.onUpdate(0.016)

    machine.onUpdate(DEAD_SECONDS / 2)
    expect(machine.current).toBe('dead')

    machine.onUpdate(DEAD_SECONDS)

    expect(machine.current).not.toBe('dead')
  })

  it('freezes the body while dead: no gravity or input moves it before the timer', () => {
    // Without an onUpdate of its own, 'dead' falls back to the role's
    // default body update (the shape every other custom state relies on),
    // so the player kept running, jumping and falling for the whole 0.8s
    // beat, then got yanked back to spawn instead of staying put.
    const { entity, machine, health, motor } = makePlayer()
    health.damage(3)
    machine.onUpdate(0.016)
    expect(machine.current).toBe('dead')
    const frozenY = entity.position.y
    const frozenVy = motor.vy

    machine.onUpdate(DEAD_SECONDS / 2)

    expect(entity.position.y).toBe(frozenY)
    expect(motor.vy).toBe(frozenVy)
  })

  it('the timer hands control back to idle, with the body update out of the way', () => {
    // No motor: playerUpdate early-returns without one, so nothing signals
    // over the timer's edge and the state it lands on is the graph's answer,
    // not the physics'.
    const { game } = makePlayer()
    const bodiless = new StateMachine()
    bodiless.role = 'player'
    bodiless.entity = { name: 'Ghost', game, get: () => undefined } as unknown as Entity
    bodiless.game = game
    bodiless.initial = PLAYER_STATE_GRAPH.initial
    bodiless.states = structuredClone(PLAYER_STATE_GRAPH.states)
    bodiless.onReady()

    bodiless.signal('death')
    bodiless.onUpdate(0.016)
    expect(bodiless.current).toBe('dead')

    bodiless.onUpdate(DEAD_SECONDS)

    expect(bodiless.current).toBe('idle')
  })

  it('leaving dead puts the player back at its spawn with full health', () => {
    const { entity, machine, health } = makePlayer([4, 2])
    entity.position.set(30, -40, 0)

    health.damage(3)
    machine.onUpdate(0.016)
    machine.onUpdate(DEAD_SECONDS)

    expect(entity.position.x).toBe(4)
    // Revived mid-air with no ground under it, the body immediately starts
    // falling again — the respawn puts it back, gravity takes over from there.
    expect(entity.position.y).toBeLessThanOrEqual(2)
    expect(entity.position.y).toBeGreaterThan(1)
    expect(health.current).toBe(3)
  })

  it('can die again after coming back — the cycle is not one-shot', () => {
    const { machine, health } = makePlayer()
    health.damage(3)
    machine.onUpdate(0.016)
    machine.onUpdate(DEAD_SECONDS)

    health.damage(3)
    machine.onUpdate(0.016)

    expect(machine.current).toBe('dead')
  })

  it('declares a clip the player sprite actually has, so entering dead animates', () => {
    const sprite = new AnimatedSprite()
    // The dog sheet the archetype ships, as scene-default declares it.
    sprite.clips = {
      idle: { frames: [0, 1, 2, 3], fps: 5 },
      run: { frames: [4, 5, 6, 7], fps: 10 },
      jump: { frames: [8, 9], fps: 8, loop: false },
      fall: { frames: [12, 13], fps: 8 },
    }
    const clip = PLAYER_STATE_GRAPH.states.dead?.clip

    expect(clip).toBeDefined()
    expect(Object.keys(sprite.clips)).toContain(clip)
  })
})
