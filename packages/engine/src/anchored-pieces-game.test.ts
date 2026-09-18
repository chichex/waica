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
import { Component } from './component'
import { Game, type GameOptions } from './game'
import { loadScene, type SceneJson, type SceneRegistry } from './scene'

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

describe('draw order within the anchored layer (CA-6)', () => {
  const zOf = (handle: AnchoredPieceHandle): number => Number(shadowHost(handle).style.zIndex)

  it('draws the instance lower on screen on top, recomputed every frame', () => {
    const game = makeGame()
    const low = game.spawn('Low')
    const high = game.spawn('High')
    high.position.y = 2
    const lowTag = game.ui.attach('tag', low)
    const highTag = game.ui.attach('tag', high)

    frame(game)
    expect(zOf(lowTag)).toBeGreaterThan(zOf(highTag))

    low.position.y = 3
    frame(game)
    expect(zOf(lowTag)).toBeLessThan(zOf(highTag))
  })

  it('keeps creation order on equal heights, later on top', () => {
    const game = makeGame()
    const left = game.spawn('Left')
    const right = game.spawn('Right')
    right.position.x = 3
    const first = game.ui.attach('tag', right)
    const second = game.ui.attach('tag', left)
    const third = game.ui.attach('tag', right)

    frame(game)

    expect(zOf(second)).toBeGreaterThan(zOf(first))
    expect(zOf(third)).toBeGreaterThan(zOf(second))
  })
})

describe('while not simulating (CA-8)', () => {
  it('hides the anchored layer with the overlay; instances keep existing and reappear placed correctly', () => {
    const game = makeGame()
    const orc = game.spawn('Orc')
    const tag = game.ui.attach('tag', orc, { offset: [0, 1] })
    frame(game)
    const layer = shadowHost(tag).parentElement!
    const overlay = layer.parentElement!
    expect(overlay.style.display).toBe('')

    game.simulate = false
    frame(game, 0)
    expect(overlay.style.display).toBe('none')
    expect(tag.alive).toBe(true)

    // Edit mode moves entities while the overlay is hidden.
    orc.position.x = 1
    frame(game, 0)
    game.simulate = true
    frame(game)

    expect(overlay.style.display).toBe('')
    expect(shadowHost(tag).parentElement).toBe(layer)
    expect(placed(tag)).toEqual(['460px', '240px'])
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

describe('Anchored Piece lifetime (CA-5)', () => {
  const REGISTRY: SceneRegistry = { components: {} }
  const scene = (name: string): SceneJson => ({ waicaScene: 3, entities: [{ name }] })

  it('removes an instance without seconds before its entity\'s destroy() returns', () => {
    const game = makeGame()
    const orc = game.spawn('Orc')
    const tag = game.ui.attach('tag', orc)
    const host = shadowHost(tag)

    orc.destroy()

    expect(tag.alive).toBe(false)
    expect(tag.element).toBeNull()
    expect(host.isConnected).toBe(false)
  })

  it('removes a seconds instance exactly when game.time.after(seconds) scheduled at the same moment fires', () => {
    const game = makeGame()
    game.ui.define('hit', '<b>-{{amount}}</b>')
    let hit: AnchoredPieceHandle | null = null
    let steps = 0
    let probeFiredOnStep: number | null = null
    class Striker extends Component {
      onUpdate(): void {
        steps += 1
        if (hit) return
        // Attached during step k = 1; seconds 0.8 is 48 steps of Game Time.
        hit = this.game.ui.attach('hit', this.entity, { seconds: 0.8, offset: [0, 2], values: { amount: 3 } })
        this.game.time.after(0.8, () => (probeFiredOnStep = steps + 1))
      }
    }
    game.spawn('Orc').add(Striker)

    frame(game)
    expect(hit!.alive).toBe(true)
    for (let step = 2; step <= 48; step += 1) frame(game)
    expect(steps).toBe(48)
    expect(hit!.alive).toBe(true)
    expect(probeFiredOnStep).toBeNull()

    frame(game)

    // Removed at the start of step k + 48 = 49, in the same pass as the probe.
    expect(probeFiredOnStep).toBe(49)
    expect(hit!.alive).toBe(false)
    expect(hit!.element).toBeNull()
  })

  it('never expires while the Game is not simulating', () => {
    const game = makeGame()
    const hit = game.ui.attach('tag', game.spawn('Orc'), { seconds: 0.8 })

    game.simulate = false
    for (let index = 0; index < 100; index += 1) frame(game, 1)
    expect(hit.alive).toBe(true)

    game.simulate = true
    for (let index = 0; index < 47; index += 1) frame(game)
    expect(hit.alive).toBe(true)
    frame(game)
    expect(hit.alive).toBe(false)
  })

  it('keeps a seconds instance frozen at the destroy-time anchor point, still converted through the live camera, until it expires', () => {
    const game = makeGame()
    const orc = game.spawn('Orc')
    orc.position.x = 1
    const hit = game.ui.attach('tag', orc, { seconds: 0.8, offset: [0, 1] })
    frame(game)
    expect(placed(hit)).toEqual(['460px', '240px'])

    orc.destroy()
    expect(hit.alive).toBe(true)
    orc.position.x = 3
    frame(game)
    expect(placed(hit)).toEqual(['460px', '240px'])

    game.camera.position.x = 1
    frame(game)
    expect(placed(hit)).toEqual(['400px', '240px'])

    // Attached before step 1: due at the start of step 48; three steps ran.
    for (let step = 4; step <= 47; step += 1) frame(game)
    expect(hit.alive).toBe(true)
    frame(game)
    expect(hit.alive).toBe(false)
  })

  it('freezes an isometric instance from the entity\'s logical position at destroy() time, projected', () => {
    const game = makeGame()
    loadScene(
      game,
      { waicaScene: 3, render: { projection: 'isometric' }, entities: [{ name: 'Orc', position: [2, 0] }] },
      REGISTRY,
    )
    const orc = game.find('Orc')!
    const hit = game.ui.attach('tag', orc, { seconds: 0.8, offset: [0, 1] })
    frame(game)

    // Moved and destroyed within one step, before any render re-projects it.
    orc.position.x = 3
    orc.destroy()
    orc.position.x = 5
    frame(game)

    // projectIsometric(3, 0) = (3, -1.5); plus the offset: render (3, -0.5).
    expect(placed(hit)).toEqual(['580px', '330px'])
  })

  it('removes every instance, with or without seconds, on unloadScene() and on every scene load that unloads', () => {
    const game = makeGame()
    loadScene(game, scene('Orc'), REGISTRY)
    const plain = game.ui.attach('tag', game.find('Orc')!)
    const timed = game.ui.attach('tag', game.find('Orc')!, { seconds: 5 })

    game.unloadScene()

    expect(plain.alive).toBe(false)
    expect(timed.alive).toBe(false)
    expect(game.time.pending).toBe(0)

    loadScene(game, scene('Slime'), REGISTRY)
    const slime = game.find('Slime')!
    const lingering = game.ui.attach('tag', slime, { seconds: 5 })
    slime.destroy()
    expect(lingering.alive).toBe(true)

    loadScene(game, scene('Bat'), REGISTRY)

    expect(lingering.alive).toBe(false)
  })

  it('removes every instance on game.dispose()', () => {
    const game = makeGame()
    const orc = game.spawn('Orc')
    const plain = game.ui.attach('tag', orc)
    const timed = game.ui.attach('tag', orc, { seconds: 5 })

    game.dispose()

    expect(plain.alive).toBe(false)
    expect(timed.alive).toBe(false)
  })

  it('remove() is immediate and cancels the expiry; set and remove on a removed handle are silent no-ops', () => {
    const game = makeGame()
    const hit = game.ui.attach('tag', game.spawn('Orc'), { seconds: 5, values: { amount: 1 } })
    const host = shadowHost(hit)
    expect(game.time.pending).toBe(1)

    hit.remove()

    expect(hit.alive).toBe(false)
    expect(hit.element).toBeNull()
    expect(host.isConnected).toBe(false)
    expect(game.time.pending).toBe(0)
    expect(() => hit.set('amount', 2)).not.toThrow()
    expect(() => hit.remove()).not.toThrow()
    expect(host.style.getPropertyValue('--amount')).toBe('1')
  })
})
