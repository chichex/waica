// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renderer = vi.hoisted(() => ({ loop: null as ((time: number) => void) | null }))

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
import { Game, type GameOptions } from './game'
import type { GamepadLike } from './gamepad'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** Records, per Simulation Step, what behaviors read from the jump Action. */
class JumpProbe extends Component {
  static override componentName = 'JumpProbe'
  log!: string[]
  override onUpdate(): void {
    this.log.push(`update held=${String(this.game.input.held('jump'))}`)
  }
}

const pad = {
  index: 0,
  id: 'pad-0',
  mapping: 'standard',
  connected: true,
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
} satisfies GamepadLike

let log: string[] = []
const games: Game[] = []

function makeGame(options: Partial<GameOptions> = {}): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const game = new Game({
    canvas,
    bindings: { jump: ['Gamepad:A'], right: ['Gamepad:LeftStickRight'] },
    ...options,
  })
  game.spawn('Subject').add(JumpProbe, { log })
  games.push(game)
  return game
}

function tick(time: number): void {
  if (!renderer.loop) throw new Error('Game.start() did not install a frame callback')
  renderer.loop(time)
}

beforeEach(() => {
  renderer.loop = null
  log = []
  pad.buttons[0] = { value: 0 }
  pad.axes[0] = 0
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => {
      log.push('poll')
      return [pad]
    },
  })
})

afterEach(() => {
  for (const game of games.splice(0)) game.dispose()
  Reflect.deleteProperty(navigator, 'getGamepads')
  vi.unstubAllGlobals()
})

describe('Game polls the pad once per Simulation Step (issue #75 CA-6)', () => {
  it('reads the pad before component updates, so that step sees its state', () => {
    const game = makeGame()
    game.start()
    pad.buttons[0] = { value: 1 }

    tick(0)
    tick(frameMs(60))
    tick(2 * frameMs(60))

    expect(log).toEqual(['poll', 'update held=true', 'poll', 'update held=true'])
  })

  it('does not read the pad while the Game is not simulating', () => {
    const game = makeGame()
    game.simulate = false
    game.start()
    pad.buttons[0] = { value: 1 }

    tick(0)
    tick(frameMs(60))
    tick(5 * frameMs(60))

    expect(log).toEqual([])
    expect(game.input.held('jump')).toBe(false)
  })

  it('does not read the pad before the Game runs a step', () => {
    makeGame().start()
    expect(log).toEqual([])
  })
})

describe('GameOptions.gamepadDeadZone (issue #75 CA-4)', () => {
  it('overrides the default dead zone of game.input', () => {
    const game = makeGame({ gamepadDeadZone: 0 })
    game.start()
    pad.axes[0] = 0.3

    tick(0)
    tick(frameMs(60))

    expect(game.input.value('right')).toBeCloseTo(0.3)
  })
})
