// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import { Game } from './game'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('IsoMotor projected render movement', () => {
  it('moves purely right in render space while both logical coordinates change', async () => {
    const { IsoMotor } = await import('../../behaviors/src/iso-motor')
    const game = makeGame()
    game.setSceneRender({ projection: 'isometric' })
    const player = game.spawn('Player')
    const motor = player.add(IsoMotor)

    for (let frame = 0; frame < 120; frame += 1) {
      motor.run(1, 0, 1 / 60)
      motor.step(1 / 60)
    }
    ;(game as unknown as { runFrame(dt: number): void }).runFrame(1 / 60)

    expect(player.position.x).toBeGreaterThan(0)
    expect(player.position.y).toBeLessThan(0)
    expect(player.position.x).toBeCloseTo(-player.position.y, 10)
    expect(player.node.position.x).toBeGreaterThan(0)
    expect(player.node.position.y).toBeCloseTo(0, 10)
    game.dispose()
  })
})
