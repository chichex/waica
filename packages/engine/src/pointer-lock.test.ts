// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { resetFakeRendering } from './test-renderer'
import { Game } from './game'
import { Input } from './input'

const inputs: Input[] = []
const games: Game[] = []
let locked: Element | null = null

/** A canvas whose `requestPointerLock` is a stub that locks it, as a browser would once it grants the lock. */
function lockableCanvas(): { canvas: HTMLCanvasElement; requests: () => number } {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const request = vi.fn(() => {
    locked = canvas
    return Promise.resolve()
  })
  Object.defineProperty(canvas, 'requestPointerLock', { configurable: true, value: request })
  return { canvas, requests: () => request.mock.calls.length }
}

function press(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))
}

beforeEach(() => {
  resetFakeRendering()
  document.body.innerHTML = ''
  locked = null
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked })
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  for (const input of inputs.splice(0)) input.dispose()
  for (const game of games.splice(0)) game.dispose()
  Reflect.deleteProperty(document, 'pointerLockElement')
  vi.unstubAllGlobals()
})

it('asks the browser to lock the pointer to the game canvas and reports the lock (CA-3)', () => {
  const { canvas, requests } = lockableCanvas()
  const game = new Game({ canvas })
  games.push(game)

  expect(game.input.pointerLocked).toBe(false)
  game.input.requestPointerLock()

  expect(requests()).toBe(1)
  expect(game.input.pointerLocked).toBe(true)
  locked = document.body
  expect(game.input.pointerLocked).toBe(false)
})

it('takes the lock with the first click, which neither presses nor justPresses Mouse:Left (CA-3)', () => {
  const { canvas, requests } = lockableCanvas()
  const input = new Input({ attack: ['Mouse:Left'] }, { canvas, lockOnClick: () => true })
  inputs.push(input)

  press(canvas)

  expect(requests()).toBe(1)
  expect(input.held('attack')).toBe(false)
  expect(input.justPressed('attack')).toBe(false)
  input.endFrame()
  canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
  press(canvas)
  expect(requests()).toBe(1)
  expect(input.justPressed('attack')).toBe(true)
})

it('never asks for the lock on a click unless lockOnClick says so (CA-3)', () => {
  const { canvas, requests } = lockableCanvas()
  let wants = false
  const input = new Input({ attack: ['Mouse:Left'] }, { canvas, lockOnClick: () => wants })
  inputs.push(input)

  press(canvas)
  expect(requests()).toBe(0)
  expect(input.justPressed('attack')).toBe(true)

  input.endFrame()
  canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
  wants = true
  press(canvas)
  expect(requests()).toBe(1)
  expect(input.justPressed('attack')).toBe(false)
})

it('survives a browser that refuses the lock or has no Pointer Lock API (CA-3)', async () => {
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  const bare = new Input({}, { canvas })
  inputs.push(bare)
  expect(() => bare.requestPointerLock()).not.toThrow()

  Object.defineProperty(canvas, 'requestPointerLock', {
    configurable: true,
    value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
  })
  const refusing = new Input({}, { canvas })
  inputs.push(refusing)
  refusing.requestPointerLock()
  await Promise.resolve()
  expect(refusing.pointerLocked).toBe(false)
})

it('releases a lock it holds when it is disposed, and leaves another element’s lock alone (CA-34)', () => {
  const { canvas } = lockableCanvas()
  const exit = vi.fn(() => {
    locked = null
  })
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: exit })
  const other = new Input({}, { canvas: document.createElement('canvas') })
  const input = new Input({}, { canvas })
  input.requestPointerLock()

  other.dispose()
  expect(exit).not.toHaveBeenCalled()
  input.dispose()

  expect(exit).toHaveBeenCalledOnce()
  expect(input.pointerLocked).toBe(false)
  Reflect.deleteProperty(document, 'exitPointerLock')
})
