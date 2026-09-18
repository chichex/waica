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

import type { AnchoredPieceHandle } from './anchored-pieces'
import { Game, type GameOptions } from './game'
import { loadScene } from './scene'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** A Game on an 800×600 canvas (CA-2's worked examples), viewHeight 10 unless overridden. */
function makeGame(options: Partial<GameOptions> = {}): Game {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  })
  host.append(canvas)
  document.body.append(host)
  const game = new Game({ canvas, ...options })
  game.ui.define('tag', '<div class="tag">tag</div>')
  return game
}

/** One render frame running `steps` Simulation Steps (0: a frame with no step). */
function frame(game: Game, steps = 1): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(steps)
}

function shadowHost(handle: AnchoredPieceHandle): HTMLElement {
  return (handle.element!.getRootNode() as ShadowRoot).host as HTMLElement
}

/** The shadow host's top-left corner, in CSS px inside the anchored layer. */
function placed(handle: AnchoredPieceHandle): [string, string] {
  const style = shadowHost(handle).style
  return [style.left, style.top]
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Anchored Piece placement (CA-2)', () => {
  it('places a zero-size box at the anchor point in whole CSS px, and moves it on the next frame, not before', () => {
    const game = makeGame()
    const orc = game.spawn('Orc')
    const tag = game.ui.attach('tag', orc, { offset: [0, 1] })

    frame(game)
    const style = shadowHost(tag).style
    expect(style.position).toBe('absolute')
    expect([style.width, style.height]).toEqual(['0px', '0px'])
    expect(placed(tag)).toEqual(['400px', '240px'])

    orc.position.x = 1
    expect(placed(tag)).toEqual(['400px', '240px'])
    frame(game)
    expect(placed(tag)).toEqual(['460px', '240px'])

    game.setViewHeight(20)
    expect(placed(tag)).toEqual(['460px', '240px'])
    frame(game)
    expect(placed(tag)).toEqual(['430px', '270px'])
  })

  it('defaults the offset to [0, 0] and rounds to whole pixels', () => {
    const game = makeGame()
    const orc = game.spawn('Orc')
    const tag = game.ui.attach('tag', orc)

    frame(game)
    expect(placed(tag)).toEqual(['400px', '300px'])

    // 0.01 units right and down is 0.6 px on this 60 px-per-unit viewport.
    orc.position.set(0.01, -0.01, 0)
    frame(game)
    expect(placed(tag)).toEqual(['401px', '301px'])
  })

  it('follows the camera', () => {
    const game = makeGame()
    const tag = game.ui.attach('tag', game.spawn('Orc'), { offset: [0, 1] })

    game.camera.position.x = 2
    frame(game)

    expect(placed(tag)).toEqual(['280px', '240px'])
  })

  it('anchors to the projected render point under projection: isometric, with the offset added in render space', () => {
    const game = makeGame()
    loadScene(
      game,
      { waicaScene: 3, render: { projection: 'isometric' }, entities: [{ name: 'Orc', position: [2, 0] }] },
      { components: {} },
    )
    const tag = game.ui.attach('tag', game.find('Orc')!, { offset: [0, 1] })

    frame(game)

    // projectIsometric(2, 0) = (2, -1); plus the offset: render (2, 0).
    expect(placed(tag)).toEqual(['520px', '300px'])
  })

  it('confines the anchored layer to the letterboxed game viewport under a fixed resolution', () => {
    const game = makeGame({ resolution: { width: 640, height: 360 } })
    const tag = game.ui.attach('tag', game.spawn('Orc'), { offset: [0, 1] })

    frame(game)

    const layer = shadowHost(tag).parentElement!
    expect([layer.style.left, layer.style.top, layer.style.width, layer.style.height]).toEqual([
      '0px',
      '75px',
      '800px',
      '450px',
    ])
    expect(layer.style.overflow).toBe('hidden')
    // Relative to the 800×450 rect: centre x, 4 of 10 units down from its top.
    expect(placed(tag)).toEqual(['400px', '180px'])
  })
})

describe('--waica-unit (CA-3)', () => {
  it('is the game viewport CSS height divided by the current viewHeight, recomputed every frame', () => {
    const game = makeGame()
    const tag = game.ui.attach('tag', game.spawn('Orc'))

    frame(game)
    expect(shadowHost(tag).style.getPropertyValue('--waica-unit')).toBe('60px')

    game.setViewHeight(20)
    frame(game)
    expect(shadowHost(tag).style.getPropertyValue('--waica-unit')).toBe('30px')
  })

  it('follows the letterbox scale under a fixed resolution', () => {
    const game = makeGame({ resolution: { width: 640, height: 360 } })
    const tag = game.ui.attach('tag', game.spawn('Orc'))

    frame(game)

    expect(shadowHost(tag).style.getPropertyValue('--waica-unit')).toBe('45px')
  })
})
