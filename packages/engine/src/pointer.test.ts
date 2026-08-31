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

import { Sprite } from './components/sprite'
import { Game } from './game'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(options: { canvasWidth?: number; canvasHeight?: number; resolution?: { width: number; height: number } } = {}): Game {
  const { canvasWidth = 640, canvasHeight = 360, resolution } = options
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: canvasWidth },
    clientHeight: { value: canvasHeight },
  })
  document.body.append(canvas)
  return new Game({ canvas, ...(resolution ? { resolution } : {}) })
}

function click(canvas: HTMLCanvasElement, clientX: number, clientY: number, button = 0): void {
  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, button }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Pointer — screen to logical conversion', () => {
  it('resolves a click at the canvas center to the camera center, unprojected', () => {
    const game = makeGame()
    const canvas = document.querySelector('canvas')!
    click(canvas, 320, 180)

    const pick = game.pointer.takePending()

    expect(pick).not.toBeNull()
    expect(pick!.point.x).toBeCloseTo(0, 5)
    expect(pick!.point.y).toBeCloseTo(0, 5)
    expect(pick!.entity).toBeNull()
    game.dispose()
  })

  it('resolves an off-center click through the camera frustum, without a projection', () => {
    const game = makeGame()
    const canvas = document.querySelector('canvas')!
    // Top-left corner of the canvas.
    click(canvas, 0, 0)

    const pick = game.pointer.takePending()

    // halfH = viewHeight/2 = 5; aspect = 640/360; halfW = halfH*aspect.
    const halfH = 5
    const halfW = halfH * (640 / 360)
    expect(pick!.point.x).toBeCloseTo(-halfW, 4)
    expect(pick!.point.y).toBeCloseTo(halfH, 4)
    game.dispose()
  })

  it('ignores a click landing in the letterbox bars when a fixed resolution is set', () => {
    const game = makeGame({ canvasWidth: 640, canvasHeight: 480, resolution: { width: 320, height: 180 } })
    const canvas = document.querySelector('canvas')!
    // Letterbox math: aspect 16:9, vw=640, vh=360, vy=(480-360)/2=60 — bars top/bottom.
    click(canvas, 320, 20) // inside the top bar (py=20 < vy=60)

    expect(game.pointer.takePending()).toBeNull()
    game.dispose()
  })

  it('accounts for the letterbox offset on a click inside the visible viewport', () => {
    const game = makeGame({ canvasWidth: 640, canvasHeight: 480, resolution: { width: 320, height: 180 } })
    const canvas = document.querySelector('canvas')!
    // vx=0,vy=60,vw=640,vh=360. Click at (480,240): nx=480/640=0.75, ny=(240-60)/360=0.5.
    click(canvas, 480, 240)

    const pick = game.pointer.takePending()
    const halfH = 5
    const halfW = halfH * (320 / 180)
    const expectedX = -halfW + 0.75 * (2 * halfW)
    const expectedY = halfH - 0.5 * (2 * halfH)
    expect(pick!.point.x).toBeCloseTo(expectedX, 4)
    expect(pick!.point.y).toBeCloseTo(expectedY, 4)
    game.dispose()
  })

  it('unprojects through the isometric projection when the scene declares it', () => {
    const game = makeGame()
    game.setSceneRender({ projection: 'isometric' })
    const canvas = document.querySelector('canvas')!
    click(canvas, 320 + 160, 180) // px=480 → nx=0.75, ny=0.5 (center vertically)

    const pick = game.pointer.takePending()
    const halfH = 5
    const halfW = halfH * (640 / 360)
    const renderX = -halfW + 0.75 * (2 * halfW)
    const renderY = 0 // ny=0.5 → center
    expect(pick!.point.x).toBeCloseTo(renderX / 2 - renderY, 4)
    expect(pick!.point.y).toBeCloseTo(-renderX / 2 - renderY, 4)
    game.dispose()
  })

  it('ignores a non-primary button click', () => {
    const game = makeGame()
    const canvas = document.querySelector('canvas')!
    click(canvas, 320, 180, 2)

    expect(game.pointer.takePending()).toBeNull()
    game.dispose()
  })

  it('injectClick resolves the same way as a real click, in logical coordinates', () => {
    const game = makeGame()
    game.setSceneRender({ projection: 'isometric' })

    const pick = game.pointer.injectClick(2, -2)

    expect(pick.point.x).toBeCloseTo(2, 5)
    expect(pick.point.y).toBeCloseTo(-2, 5)
    expect(game.pointer.takePending()).toEqual(pick)
    game.dispose()
  })
})

describe('Pointer — entity picking', () => {
  it('picks the entity whose declared sprite bounds contain the click, front-most on a Y tie', () => {
    const game = makeGame()
    const back = game.spawn('Back')
    back.position.set(0, 0, 0)
    back.add(Sprite, { width: 2, height: 2, anchorX: 0.5, anchorY: 0.5 })
    const front = game.spawn('Front')
    front.position.set(0, -0.5, 0)
    front.add(Sprite, { width: 2, height: 2, anchorX: 0.5, anchorY: 0.5 })

    const pick = game.pointer.injectClick(0, 0)

    expect(pick.entity).toBe(front)
    game.dispose()
  })

  it('lets a higher layer win over a lower-Y same-position sprite', () => {
    const game = makeGame()
    const low = game.spawn('Low')
    low.position.set(0, 0, 0)
    low.add(Sprite, { width: 2, height: 2, anchorX: 0.5, anchorY: 0.5, layer: 0 })
    const high = game.spawn('High')
    high.position.set(0, 0, 0)
    high.add(Sprite, { width: 2, height: 2, anchorX: 0.5, anchorY: 0.5, layer: 1 })

    const pick = game.pointer.injectClick(0, 0)

    expect(pick.entity).toBe(high)
    game.dispose()
  })

  it('resolves to no entity when the click misses every sprite bound', () => {
    const game = makeGame()
    const lone = game.spawn('Lone')
    lone.position.set(5, 5, 0)
    lone.add(Sprite, { width: 1, height: 1, anchorX: 0.5, anchorY: 0.5 })

    const pick = game.pointer.injectClick(0, 0)

    expect(pick.entity).toBeNull()
    game.dispose()
  })

  it('breaks a Y tie by the projected render position, not the logical one (isometric)', () => {
    // Logical y alone would rank these backwards: A's logical y (0) is
    // lower than B's (0.5), but under the isometric projection A's render
    // y (0) is HIGHER than B's (-0.5) — B is the one actually drawn in
    // front (Game.applyYSort keys off entity.node.position.y, the
    // projected value), so a click in the overlap must resolve to B.
    const game = makeGame()
    game.setSceneRender({ projection: 'isometric' })
    const back = game.spawn('LogicalOriginButBehind')
    back.position.set(0, 0, 0)
    back.add(Sprite, { width: 2, height: 2, anchorX: 0.5, anchorY: 0.5 })
    const front = game.spawn('HigherLogicalYButInFront')
    front.position.set(0.5, 0.5, 0)
    front.add(Sprite, { width: 2, height: 2, anchorX: 0.5, anchorY: 0.5 })

    // Logical midpoint (0.25, 0.25) projects to render (0, -0.25), inside
    // both boxes.
    const pick = game.pointer.injectClick(0.25, 0.25)

    expect(pick.entity).toBe(front)
    game.dispose()
  })
})
