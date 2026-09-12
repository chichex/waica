// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renderer = vi.hoisted(() => ({
  loop: null as ((time: number) => void) | null,
  renders: 0,
  onRender: null as (() => void) | null,
}))

/** Every dt the engine hands stepSceneCamera, in call order. */
const cameraSteps = vi.hoisted(() => ({ dts: [] as number[] }))

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
    render(): void {
      renderer.renders += 1
      renderer.onRender?.()
    }
    setAnimationLoop(loop: ((time: number) => void) | null): void {
      renderer.loop = loop
    }
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

vi.mock('./camera', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./camera')>()
  const stepSceneCamera: typeof actual.stepSceneCamera = (cam, input) => {
    cameraSteps.dts.push(input.dt)
    return actual.stepSceneCamera(cam, input)
  }
  return { ...actual, stepSceneCamera }
})

import { Component } from './component'
import { MAX_STEPS_PER_FRAME, SIMULATION_STEP } from './fixed-step'
import { Game } from './game'
import { loadScene } from './scene'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  renderer.loop = null
  renderer.renders = 0
  renderer.onRender = null
  cameraSteps.dts.length = 0
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Fixed Simulation Step loop', () => {
  /** Milliseconds per display frame, plus 1 µs so float noise never starves a step. */
  const frameMs = (hz: number): number => 1000 / hz + 0.001

  class UpdateProbe extends Component {
    static override componentName = 'UpdateProbe'
    dts!: number[]
    override onUpdate(dt: number): void {
      this.dts.push(dt)
    }
  }

  function tick(time: number): void {
    if (!renderer.loop) throw new Error('Game.start() did not install a frame callback')
    renderer.loop(time)
  }

  function makeStartedGame(bindings?: Record<string, string[]>): {
    game: Game
    dts: number[]
    hostDts: number[]
  } {
    const canvas = document.createElement('canvas')
    Object.defineProperties(canvas, {
      clientWidth: { value: 640 },
      clientHeight: { value: 360 },
    })
    document.body.append(canvas)
    const game = new Game(bindings ? { canvas, bindings } : { canvas })
    const dts: number[] = []
    game.spawn('Subject').add(UpdateProbe, { dts })
    const hostDts: number[] = []
    game.onUpdate((dt) => hostDts.push(dt))
    game.setSceneCamera({ follow: 'Subject' })
    game.start()
    return { game, dts, hostDts }
  }

  it.each([60, 144])(
    'runs exactly 60 Simulation Steps per second at a %d Hz cadence, each with dt === SIMULATION_STEP (CA-1)',
    (hz) => {
      const { game, dts, hostDts } = makeStartedGame()

      tick(0) // seeds the clock
      // Frames at 5 + i·period: the last lands past 1000 ms, before 1016.67 ms.
      for (let i = 1; 5 + i * (1000 / hz) <= 1006; i += 1) tick(5 + i * (1000 / hz))

      expect(dts).toHaveLength(60)
      expect(hostDts).toHaveLength(60)
      expect(cameraSteps.dts).toHaveLength(60)
      expect(new Set([...dts, ...hostDts, ...cameraSteps.dts])).toEqual(new Set([SIMULATION_STEP]))
      game.dispose()
    },
  )

  it('runs zero steps on the first tick after start(), and again after stop()/start() — never a burst (CA-3)', () => {
    const { game, dts } = makeStartedGame()

    tick(1_000)
    expect(dts).toHaveLength(0)
    expect(renderer.renders).toBe(1)

    // The clock is live from the seed: one frame later, one step.
    tick(1_000 + frameMs(60))
    expect(dts).toHaveLength(1)
    // Leave 10 ms in the accumulator so a kept remainder would show up below.
    tick(1_000 + frameMs(60) + 10)
    expect(dts).toHaveLength(1)

    game.stop()
    game.start()
    tick(9_000) // eight seconds later: seeds again, nothing to catch up
    expect(dts).toHaveLength(1)
    expect(renderer.renders).toBe(4)
    // 10 ms more: with the old remainder this would be a 20 ms step; it was reset.
    tick(9_000 + 10)
    expect(dts).toHaveLength(1)
    tick(9_000 + 10 + frameMs(60))
    expect(dts).toHaveLength(2)
    game.dispose()
  })

  it('ends the input frame after every step, so one press reads justPressed in exactly one step (CA-4)', () => {
    class JustPressedProbe extends Component {
      static override componentName = 'JustPressedProbe'
      seen!: boolean[]
      override onUpdate(): void {
        this.seen.push(this.game.input.justPressed('jump'))
      }
    }
    const { game } = makeStartedGame({ jump: ['Space'] })
    const seen: boolean[] = []
    game.spawn('Reader').add(JustPressedProbe, { seen })
    tick(0)

    expect(game.input.injectAction('jump', 'press')).toBe(true)
    tick(34) // two whole steps in one tick

    expect(seen).toEqual([true, false])
    game.dispose()
  })

  it('applies a scene swap queued during step 1 before step 2 of the same tick (CA-4)', () => {
    const updates: string[] = []
    class NameProbe extends Component {
      static override componentName = 'NameProbe'
      override onUpdate(): void {
        updates.push(this.entity.name)
      }
    }
    class SwapOnUpdate extends Component {
      static override componentName = 'SwapOnUpdate'
      override onUpdate(): void {
        this.game.loadSceneByName('next')
      }
    }
    const { game } = makeStartedGame()
    tick(0) // seeds the clock before the scene exists: only the next tick updates it
    const components = { NameProbe, SwapOnUpdate }
    game.registerSceneCatalog({
      scenes: { next: { waicaScene: 3, entities: [{ name: 'Room2', components: [{ type: 'NameProbe' }] }] } },
      registry: { components },
    })
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [{ name: 'A', components: [{ type: 'NameProbe' }, { type: 'SwapOnUpdate' }] }],
      },
      { components },
    )

    tick(34) // two whole steps in one tick

    // Step 1 updated the outgoing scene and queued the swap; step 2 ran the incoming one.
    expect(updates).toEqual(['A', 'Room2'])
    expect(game.find('A')).toBeUndefined()
    expect(game.sceneName).toBe('next')
    game.dispose()
  })

  it('renders and refreshes UI and audio exactly once per tick, after the last step, for 0, 1 and 6 steps (CA-5)', () => {
    const events: string[] = []
    class StepProbe extends Component {
      static override componentName = 'StepProbe'
      override onUpdate(): void {
        events.push('step')
      }
    }
    const { game } = makeStartedGame()
    game.spawn('Stepper').add(StepProbe)
    vi.spyOn(game.ui, 'setActive').mockImplementation(() => events.push('ui.setActive'))
    vi.spyOn(game.audio, 'setActive').mockImplementation(() => events.push('audio.setActive'))
    vi.spyOn(game.audio, 'updatePlacements').mockImplementation(() => events.push('audio.updatePlacements'))
    renderer.onRender = () => events.push('render')
    const tail = ['ui.setActive', 'audio.setActive', 'audio.updatePlacements', 'render']
    const expectFrame = (steps: number): void => {
      expect(events.filter((event) => event === 'step')).toHaveLength(steps)
      for (const name of tail) {
        expect(events.filter((event) => event === name)).toHaveLength(1)
        expect(events.indexOf(name)).toBeGreaterThan(events.lastIndexOf('step'))
      }
      events.length = 0
    }

    tick(0)
    expectFrame(0)
    tick(frameMs(60))
    expectFrame(1)
    tick(frameMs(60) + 300)
    expectFrame(MAX_STEPS_PER_FRAME)

    game.simulate = false
    tick(frameMs(60) + 300 + 50)
    expectFrame(0)
    game.dispose()
  })

  it('keeps host callbacks and the input frame boundary alive once per frame while not simulating (the editor edit mode)', () => {
    // [DEVIATION 2026-09-12] — see the spec: the editor draws its edit-mode
    // gizmos from game.onUpdate with simulate = false, exactly as before this
    // change; a non-simulating frame runs no step but still ticks the host once.
    const { game, dts, hostDts } = makeStartedGame()
    const endFrame = vi.spyOn(game.input, 'endFrame')
    game.simulate = false
    tick(0)
    tick(frameMs(60))
    tick(frameMs(60) + 300)

    expect(dts).toEqual([])
    expect(cameraSteps.dts).toEqual([])
    expect(hostDts).toEqual([SIMULATION_STEP, SIMULATION_STEP, SIMULATION_STEP])
    expect(endFrame).toHaveBeenCalledTimes(3)
    game.dispose()
  })
})
