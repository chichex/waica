// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The camera center at each render, as the renderer saw it. */
const drawn = vi.hoisted(() => ({ centers: [] as Array<{ x: number; y: number }> }))

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
    render(_scene: unknown, camera: { position: { x: number; y: number } }): void {
      drawn.centers.push({ x: camera.position.x, y: camera.position.y })
    }
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import * as THREE from 'three'
import {
  CameraEffects,
  Game,
  RUNTIME_BRIDGE_SYMBOL,
  type CameraEffectHandle,
  type CameraEffectsState,
  type GameOptions,
  type RuntimeBridge,
  type SceneJson,
} from './index'
import { defined } from './test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const RESOLUTION = { width: 640, height: 360 }

function makeGame(options: Partial<GameOptions> = {}, size = { width: 640, height: 360 }): Game {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: size.width, configurable: true },
    clientHeight: { value: size.height, configurable: true },
  })
  host.append(canvas)
  document.body.append(host)
  return new Game({ canvas, ...options })
}

/** One render frame running `steps` Simulation Steps. */
function frame(game: Game, steps = 1): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(steps)
}

function resize(game: Game): void {
  ;(game as unknown as { resize(): void }).resize()
}

/** A scene whose camera follows "Runner", which the host moves every step. */
function followScene(camera: SceneJson['camera'] = {}): SceneJson {
  return {
    waicaScene: 3,
    camera: { follow: 'Runner', zoom: 10, smoothing: 6, lookahead: 0, ...camera },
    entities: [{ name: 'Runner', position: [0, 0] }],
  }
}

function playFollow(game: Game, shake: boolean, steps = 40): Array<{ base: { x: number; y: number }; drawn: { x: number; y: number } }> {
  game.registerSceneCatalog({ scenes: { main: followScene() }, registry: { components: {} } })
  game.loadSceneByName('main')
  const runner = defined(game.find('Runner'))
  game.onUpdate(() => {
    runner.position.x += 0.137
    runner.position.y += 0.061
  })
  if (shake) game.cameraEffects.shake({ intensity: 0.5, seconds: 0.5 })
  const out: Array<{ base: { x: number; y: number }; drawn: { x: number; y: number } }> = []
  for (let index = 0; index < steps; index += 1) {
    drawn.centers.length = 0
    frame(game)
    out.push({
      base: { x: game.camera.position.x, y: game.camera.position.y },
      drawn: defined(drawn.centers.at(-1)),
    })
  }
  return out
}

async function settled(handle: CameraEffectHandle): Promise<boolean | undefined> {
  const pending = Symbol('pending')
  const result = await Promise.race([handle.done, Promise.resolve().then(() => pending)])
  return result === pending ? undefined : (result as boolean)
}

beforeEach(() => {
  document.body.innerHTML = ''
  drawn.centers.length = 0
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

describe('game.cameraEffects (CA-1)', () => {
  it('exists on every Game beside an unchanged THREE.OrthographicCamera', () => {
    const game = makeGame()
    expect(game.cameraEffects).toBeInstanceOf(CameraEffects)
    expect(typeof game.cameraEffects.shake).toBe('function')
    expect(typeof game.cameraEffects.fade).toBe('function')
    expect(typeof game.cameraEffects.flash).toBe('function')
    expect(game.camera).toBeInstanceOf(THREE.OrthographicCamera)
    const state: CameraEffectsState = game.cameraEffects.state
    expect(state.shake).toEqual({ x: 0, y: 0 })
    game.dispose()
  })
})

describe('shake vs the base camera (CA-2, CA-6)', () => {
  it('leaves the base centers identical and offsets only the drawn center, restoring the base after each render', () => {
    const plain = makeGame()
    const shaken = makeGame()
    const without = playFollow(plain, false)
    const withShake = playFollow(shaken, true)

    expect(withShake.map((entry) => entry.base)).toEqual(without.map((entry) => entry.base))
    expect(without.every((entry) => entry.drawn.x === entry.base.x && entry.drawn.y === entry.base.y)).toBe(true)
    let shifted = 0
    for (const [index, entry] of withShake.entries()) {
      // The shake after step n is the offset drawn on frame n.
      if (index >= 30) {
        expect(entry.drawn).toEqual(entry.base)
        continue
      }
      if (entry.drawn.x !== entry.base.x) shifted += 1
    }
    expect(shifted).toBeGreaterThan(20)
    plain.dispose()
    shaken.dispose()
  })

  it('draws the base plus exactly the reported offset', () => {
    const game = makeGame()
    game.cameraEffects.shake({ intensity: 1, seconds: 1 })
    for (let index = 0; index < 10; index += 1) {
      frame(game)
      const { shake } = game.cameraEffects.state
      expect(drawn.centers.at(-1)).toEqual({
        x: game.camera.position.x + shake.x,
        y: game.camera.position.y + shake.y,
      })
    }
    game.dispose()
  })

  it('snaps the offset to screen pixels under a fixed resolution but never the base center', () => {
    const game = makeGame({ resolution: RESOLUTION })
    const pixel = 10 / RESOLUTION.height
    const entries = playFollow(game, true, 29)
    let offGridBase = 0
    for (const entry of entries) {
      const dx = (entry.drawn.x - entry.base.x) / pixel
      expect(Math.abs(dx - Math.round(dx))).toBeLessThan(1e-6)
      const b = entry.base.x / pixel
      if (Math.abs(b - Math.round(b)) > 1e-3) offGridBase += 1
    }
    expect(offGridBase).toBeGreaterThan(10)
    game.dispose()
  })
})

describe('shake is not re-clamped (CA-5)', () => {
  it('keeps the base clamped at a limit while the drawn center crosses it by up to the amplitude', () => {
    const game = makeGame()
    game.registerSceneCatalog({
      scenes: {
        main: {
          ...followScene({ limits: { minX: -10, maxX: 10, minY: -10, maxY: 10 } }),
          entities: [{ name: 'Runner', position: [50, 0] }],
        },
      },
      registry: { components: {} },
    })
    game.loadSceneByName('main')
    for (let index = 0; index < 120; index += 1) frame(game)
    const halfW = (game.camera.right - game.camera.left) / 2
    const clampX = 10 - halfW
    expect(game.camera.position.x).toBeCloseTo(clampX, 9)

    game.cameraEffects.shake({ intensity: 0.5, seconds: 0.5 })
    let beyond = 0
    for (let n = 1; n < 30; n += 1) {
      frame(game)
      expect(game.camera.position.x).toBeCloseTo(clampX, 9)
      const excess = defined(drawn.centers.at(-1)).x - clampX
      expect(excess).toBeLessThanOrEqual(0.5 * (1 - n / 30) + 1e-9)
      if (excess > 1e-6) beyond += 1
    }
    expect(beyond).toBeGreaterThan(5)
    game.dispose()
  })
})

describe('scope on the Game (CA-11)', () => {
  it('unloadScene() ends shakes and flashes and keeps the Fade, which resolves after the swap', async () => {
    const game = makeGame()
    game.registerSceneCatalog({
      scenes: { main: followScene(), cave: { waicaScene: 3, entities: [] } },
      registry: { components: {} },
    })
    game.loadSceneByName('main')
    game.cameraEffects.shake({ intensity: 1, seconds: 1 })
    game.cameraEffects.flash({ color: 'white', seconds: 1 })
    const fade = game.cameraEffects.fade({ to: 'black', seconds: 0.5 })
    for (let index = 0; index < 10; index += 1) frame(game)

    game.loadSceneByName('cave')

    expect(game.cameraEffects.state.shake).toEqual({ x: 0, y: 0 })
    expect(game.cameraEffects.state.flash.opacity).toBe(0)
    expect(game.cameraEffects.state.fade.opacity).toBeCloseTo(10 / 30, 12)
    for (let index = 0; index < 20; index += 1) frame(game)
    expect(game.cameraEffects.state.fade).toEqual({ color: '#000000', opacity: 1 })
    expect(await settled(fade)).toBe(true)
    game.dispose()
  })

  it('dispose() removes every effect and its DOM', async () => {
    const game = makeGame()
    const fade = game.cameraEffects.fade({ to: 'black', seconds: 1 })
    game.cameraEffects.flash({ color: 'white', seconds: 1 })
    frame(game)
    expect(document.querySelectorAll('[data-waica-camera-effect]')).toHaveLength(2)

    game.dispose()

    expect(document.querySelectorAll('[data-waica-camera-effect]')).toHaveLength(0)
    expect(await settled(fade)).toBe(false)
  })
})

describe('only simulated steps advance effects (CA-12)', () => {
  it('holds every effect while the Game is not simulating', () => {
    const game = makeGame()
    game.cameraEffects.shake({ intensity: 1, seconds: 1 })
    game.cameraEffects.fade({ to: 'black', seconds: 0.5 })
    game.simulate = false
    for (let index = 0; index < 10; index += 1) frame(game, 1)
    expect(game.cameraEffects.state.shake).toEqual({ x: 0, y: 0 })
    expect(game.cameraEffects.state.fade.opacity).toBe(0)

    game.simulate = true
    frame(game, 1)
    expect(game.cameraEffects.state.fade.opacity).toBeCloseTo(1 / 30, 12)
    game.dispose()
  })

  it('advances by exactly one Simulation Step per Runtime Bridge step, and not at all while paused', () => {
    const registered: RuntimeBridge[] = []
    Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, {
      configurable: true,
      value: { protocolVersion: 1, register: (bridge: RuntimeBridge) => registered.push(bridge), unregister: () => {} },
    })
    const game = makeGame()
    game.start()
    game.cameraEffects.fade({ to: 'black', seconds: 0.5 })
    defined(registered[0]).inspect()
    expect(game.cameraEffects.state.fade.opacity).toBe(0)

    defined(registered[0]).control({ operation: 'step', frames: 3 })
    expect(game.cameraEffects.state.fade.opacity).toBeCloseTo(3 / 30, 12)
    defined(registered[0]).control({ operation: 'step' })
    expect(game.cameraEffects.state.fade.opacity).toBeCloseTo(4 / 30, 12)
    game.dispose()
  })
})

describe('Fade layer covers the game view (CA-13)', () => {
  it('sits over the letterboxed viewport above the UI overlay and follows every resize()', () => {
    const game = makeGame({ resolution: RESOLUTION }, { width: 800, height: 600 })
    game.ui.define('hud', '<b>hud</b>')
    game.ui.show('hud')
    game.cameraEffects.fade({ to: 'black', seconds: 0.5 })
    frame(game)

    const fade = defined(document.querySelector<HTMLElement>('[data-waica-camera-effect="fade"]'))
    // 800×600 letterboxed to 16:9: 800×450 at y 75.
    expect([fade.style.left, fade.style.top, fade.style.width, fade.style.height]).toEqual(['0px', '75px', '800px', '450px'])
    expect(fade.style.pointerEvents).toBe('none')
    expect(Number(fade.style.zIndex)).toBeGreaterThan(9000)
    const canvas = defined(document.querySelector('canvas'))
    expect(fade.parentElement).toBe(canvas.parentElement)

    Object.defineProperties(canvas, {
      clientWidth: { value: 1000, configurable: true },
      clientHeight: { value: 400, configurable: true },
    })
    resize(game)
    // 1000×400 letterboxed to 16:9: 711.1×400 at x 144.4.
    expect(Number.parseFloat(fade.style.left)).toBeCloseTo((1000 - 400 * (16 / 9)) / 2, 6)
    expect(fade.style.top).toBe('0px')
    expect(Number.parseFloat(fade.style.width)).toBeCloseTo(400 * (16 / 9), 6)
    expect(fade.style.height).toBe('400px')
    game.dispose()
  })

  it('is not displayed while its opacity is 0', () => {
    const game = makeGame()
    game.cameraEffects.flash({ color: 'white', seconds: 0.1 })
    const fade = defined(document.querySelector<HTMLElement>('[data-waica-camera-effect="fade"]'))
    expect(fade.style.display).toBe('none')
    for (let index = 0; index < 6; index += 1) frame(game)
    const flash = defined(document.querySelector<HTMLElement>('[data-waica-camera-effect="flash"]'))
    expect(flash.style.display).toBe('none')
    game.dispose()
  })
})
