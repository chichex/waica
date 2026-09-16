// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The example has no dependency on three of its own, so the mock targets the
// engine's copy: the WebGLRenderer is the one thing happy-dom cannot host.
vi.mock(
  new URL('../../../packages/engine/node_modules/three/build/three.module.js', import.meta.url)
    .pathname,
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    class WebGLRenderer {
      readonly domElement: HTMLCanvasElement
      constructor({ canvas }: { canvas: HTMLCanvasElement }) {
        this.domElement = canvas
      }
      setPixelRatio(): void {}
      setSize(): void {}
      setViewport(): void {}
      setScissor(): void {}
      setScissorTest(): void {}
      setClearColor(): void {}
      clear(): void {}
      render(): void {}
      setAnimationLoop(): void {}
      dispose(): void {}
    }
    return { ...actual, WebGLRenderer }
  },
)

import { Component, Game, Hitbox, StateMachine, type Entity } from '@waica/engine'
import { Health, MeleeAttack } from '@waica/behaviors'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** Deals 1 contact damage to whoever this entity's Hitbox touches, if it has Health. */
class ContactDamage extends Component {
  static override componentName = 'ContactDamage'
  override onCollide(other: Entity): void {
    other.get(Health)?.damage(1, this.entity)
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * A minimal real Game (CA-12): a Target with a 0.5s invulnerability window,
 * a Hazard that deals contact damage through a real Hitbox/dispatchCollisions
 * pass, and a Striker whose MeleeAttack is fired from real StateMachine state
 * code (an 'attack' signal → 'strike' state → onEnter) rather than a direct
 * call — the exact seam CA-12 is about.
 */
function makeWorld(hazardAt: [number, number]) {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  const game = new Game({ canvas })

  const target = game.spawn('Target')
  target.position.set(0, 0, 0)
  target.add(Hitbox)
  const health = target.add(Health, { max: 10, invulnerability: 0.5 })

  const hazard = game.spawn('Hazard')
  hazard.position.set(hazardAt[0], hazardAt[1], 0)
  hazard.add(Hitbox)
  hazard.add(ContactDamage)

  const striker = game.spawn('Striker')
  striker.position.set(-0.5, 0, 0)
  const attack = striker.add(MeleeAttack)
  const machine = striker.add(StateMachine, {
    states: { idle: { transitions: [{ on: 'signal:attack', to: 'strike' }] }, strike: {} },
  })
  machine.on('strike', { onEnter: () => attack.strike('e') })

  const frame = (): void => {
    ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
  }
  return { game, frame, target, health, hazard, machine }
}

describe('the invulnerability window lasts exactly N steps whoever opens or tests it (CA-12, I = 0.5 -> 30 steps)', () => {
  it('a window opened by contact damage rejects contact on step k+29 and accepts it on k+30 (unchanged from today)', () => {
    const { frame, health } = makeWorld([0, 0]) // Hazard overlaps Target from the start

    frame() // step 1 (k): contact lands
    expect(health.current).toBe(9)

    for (let s = 2; s <= 30; s += 1) frame() // steps k+1..k+29: rejected every step
    expect(health.current).toBe(9)

    frame() // step 31 = k+30: accepted
    expect(health.current).toBe(8)
  })

  it('the same window accepts a MeleeAttack.strike issued from StateMachine state code on step k+30 (today rejected until k+31)', () => {
    const { frame, health, hazard, machine } = makeWorld([0, 0])

    frame() // step 1 (k): contact opens the window
    expect(health.current).toBe(9)
    hazard.position.set(100, 100, 0) // only the melee strike matters from here

    for (let s = 2; s <= 30; s += 1) frame() // steps k+1..k+29: nothing else happens
    expect(health.current).toBe(9)

    machine.signal('attack')
    frame() // step 31 = k+30: a melee strike from StateMachine state code
    expect(health.current).toBe(8)
  })

  it('a window opened by a melee strike rejects contact damage on step k+29 (today accepted) and accepts it on k+30', () => {
    const { frame, health, machine } = makeWorld([0, 0]) // Hazard overlaps Target throughout

    machine.signal('attack')
    frame() // step 1 (k): the strike (Component Update Schedule) opens the window
    // before this same step's dispatchCollisions() ever attempts contact.
    expect(health.current).toBe(9)

    for (let s = 2; s <= 30; s += 1) frame() // steps k+1..k+29: contact rejected every step
    expect(health.current).toBe(9)

    frame() // step 31 = k+30: contact accepted
    expect(health.current).toBe(8)
  })
})
