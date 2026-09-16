// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renderer = vi.hoisted(() => ({
  loop: null as ((time: number) => void) | null,
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
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
    setAnimationLoop(loop: ((time: number) => void) | null): void {
      renderer.loop = loop
    }
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import { Component } from './component'
import { frameMs } from './fixed-step-test-support'
import { SIMULATION_STEP } from './fixed-step'
import { Game } from './game'
import { loadScene } from './scene'
import { StateMachine } from './state/state-machine'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  renderer.loop = null
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function rawTick(time: number): void {
  if (!renderer.loop) throw new Error('Game.start() did not install a frame callback')
  renderer.loop(time)
}

/**
 * A Game plus a `step(n)` driver that advances exactly n whole Simulation
 * Steps, one tick() call per step (each MAX_STEPS_PER_FRAME below the cap),
 * mirroring the pattern game-fixed-step.test.ts uses throughout.
 */
function makeGame(): { game: Game; step: (times?: number) => void } {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  const game = new Game({ canvas })
  game.start()
  let clock = 0
  rawTick(clock) // seeds the clock: zero steps
  const step = (times = 1): void => {
    for (let i = 0; i < times; i += 1) {
      clock += frameMs(60)
      rawTick(clock)
    }
  }
  return { game, step }
}

describe('game.time.now (CA-9)', () => {
  it('is 0 on a new Game and advances by exactly one Simulation Step per step, never as a running float sum', () => {
    const { game, step } = makeGame()
    expect(game.time.now).toBe(0)

    step()
    expect(game.time.now).toBe(SIMULATION_STEP)
    step()
    expect(game.time.now).toBeCloseTo(SIMULATION_STEP * 2, 12)
    game.dispose()
  })

  it('does not advance while game.simulate === false', () => {
    const { game, step } = makeGame()
    game.simulate = false
    step(2)
    expect(game.time.now).toBe(0)
    game.dispose()
  })

  it('does not advance on a frame that runs zero steps', () => {
    const { game } = makeGame()
    rawTick(1) // 1ms elapsed: far short of one Simulation Step
    expect(game.time.now).toBe(0)
    game.dispose()
  })

  it('leaves now unchanged across a scene load and unload', () => {
    const { game, step } = makeGame()
    step(2)
    const before = game.time.now
    loadScene(game, { waicaScene: 3, entities: [{ name: 'A', components: [] }] }, { components: {} })
    game.unloadScene()
    expect(game.time.now).toBe(before)
    game.dispose()
  })
})

describe('after(0.3) parity with a timer:0.3 StateMachine edge (CA-1)', () => {
  it('fires on the exact same Simulation Step the edge transitions, both scheduled/entered on step 0', () => {
    class ScheduleAfter extends Component {
      static override componentName = 'ScheduleAfter'
      ran = false
      override onReady(): void {
        this.game.time.after(0.3, () => {
          this.ran = true
        })
      }
    }
    const { game, step } = makeGame()
    const entity = game.spawn('Subject')
    const probe = entity.add(ScheduleAfter)
    const machine = entity.add(StateMachine, {
      states: { idle: { transitions: [{ on: 'timer:0.3', to: 'done' }] }, done: {} },
    })

    step(17)
    expect(probe.ran).toBe(false)
    expect(machine.current).toBe('idle')

    step() // the 18th step (0.3s)
    expect(probe.ran).toBe(true)
    expect(machine.current).toBe('done')
    game.dispose()
  })
})

describe('scene scope (CA-4)', () => {
  it('unloadScene() cancels scene-scoped work, running no callback', () => {
    const { game, step } = makeGame()
    const callback = vi.fn()
    game.time.after(0.1, callback)

    game.unloadScene()
    step(10)

    expect(callback).not.toHaveBeenCalled()
    game.dispose()
  })

  it("cancels scene-scoped work that exists when a Game's FIRST load starts (F11 gap)", () => {
    const { game, step } = makeGame()
    const callback = vi.fn()
    const handle = game.time.after(0.1, callback) // no scene loaded yet

    loadScene(game, { waicaScene: 3, entities: [] }, { components: {} })

    expect(handle.active).toBe(false)
    step(10)
    expect(callback).not.toHaveBeenCalled()
    game.dispose()
  })

  it('a later scene load cancels the previous scene-scoped work too', () => {
    const { game, step } = makeGame()
    loadScene(game, { waicaScene: 3, entities: [] }, { components: {} })
    const callback = vi.fn()
    game.time.after(0.1, callback)

    loadScene(game, { waicaScene: 3, entities: [] }, { components: {} })

    step(10)
    expect(callback).not.toHaveBeenCalled()
    game.dispose()
  })

  it('timers/tweens created during the load itself (an incoming onReady) survive it', () => {
    class ScheduleOnReady extends Component {
      static override componentName = 'ScheduleOnReady'
      ran = false
      override onReady(): void {
        this.game.time.after(0.1, () => {
          this.ran = true
        })
      }
    }
    const { game, step } = makeGame()
    loadScene(
      game,
      { waicaScene: 3, entities: [{ name: 'Incoming', components: [{ type: 'ScheduleOnReady' }] }] },
      { components: { ScheduleOnReady } },
    )
    const probe = game.find('Incoming')!.get(ScheduleOnReady)!

    step(6)
    expect(probe.ran).toBe(true)
    game.dispose()
  })

  it('{ scope: "session" } survives a scene load and unload', () => {
    const { game, step } = makeGame()
    const callback = vi.fn()
    game.time.after(0.1, callback, { scope: 'session' })

    loadScene(game, { waicaScene: 3, entities: [] }, { components: {} })
    game.unloadScene()

    step(6)
    expect(callback).toHaveBeenCalledOnce()
    game.dispose()
  })

  it('game.dispose() cancels everything in both scopes', () => {
    const { game } = makeGame()
    const scene = vi.fn()
    const session = vi.fn()
    game.time.after(0.1, scene)
    game.time.after(0.1, session, { scope: 'session' })

    game.dispose()

    expect(scene).not.toHaveBeenCalled()
    expect(session).not.toHaveBeenCalled()
  })
})

describe('owner cancellation (CA-5)', () => {
  it("an entity's destroy() cancels its own timers/tweens immediately, whatever their scope", () => {
    const { game, step } = makeGame()
    const callback = vi.fn()
    const entity = game.spawn('Owner')
    const handle = game.time.after(0.1, callback, { owner: entity, scope: 'session' })

    entity.destroy()

    expect(handle.active).toBe(false)
    step(10)
    expect(callback).not.toHaveBeenCalled()
    game.dispose()
  })

  it("does not cancel another entity's timers", () => {
    const { game, step } = makeGame()
    const callback = vi.fn()
    const owner = game.spawn('Owner')
    const other = game.spawn('Other')
    game.time.after(0.1, callback, { owner })

    other.destroy()

    step(10)
    expect(callback).toHaveBeenCalledOnce()
    game.dispose()
  })

  it('an owner already dead at scheduling time yields an inactive handle, never running the callback', () => {
    const { game, step } = makeGame()
    const entity = game.spawn('Owner')
    entity.destroy()
    const callback = vi.fn()

    const handle = game.time.after(0.1, callback, { owner: entity })

    expect(handle.active).toBe(false)
    step(10)
    expect(callback).not.toHaveBeenCalled()
    game.dispose()
  })
})

describe('the loop paused (CA-1, CA-9)', () => {
  it('does not advance game.time while paused and not stepping', () => {
    const { game } = makeGame()
    game.stop() // simulates the Runtime Bridge holding the loop paused
    expect(game.time.now).toBe(0)
    game.dispose()
  })
})
