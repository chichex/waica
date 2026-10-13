// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { lastFakeRenderer, resetFakeRendering } from './test-renderer'
import { Component } from './component'
import { frameMs } from './fixed-step-test-support'
import { Game } from './game'
import { Input, type InputBindings } from './input'

const inputs: Input[] = []
const games: Game[] = []
let locked: Element | null = null

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return canvas
}

function makeInput(bindings: InputBindings, canvas = makeCanvas()): Input {
  const input = new Input(bindings, { canvas })
  inputs.push(input)
  return input
}

function button(target: EventTarget, type: 'pointerdown' | 'pointerup', which: number): void {
  target.dispatchEvent(new PointerEvent(type, { button: which, bubbles: true }))
}

/** A button going down or up while another is held: browsers report it as a pointermove carrying that button (chorded buttons). */
function chord(target: EventTarget, which: number, buttons: number): void {
  target.dispatchEvent(new PointerEvent('pointermove', { button: which, buttons, bubbles: true }))
}

function contextMenu(target: EventTarget): MouseEvent {
  const event = new MouseEvent('contextmenu', { button: 2, cancelable: true, bubbles: true })
  target.dispatchEvent(event)
  return event
}

function move(x: number, y: number): void {
  document.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y, bubbles: true }))
}

function wheel(target: EventTarget, deltaY: number): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true, bubbles: true })
  target.dispatchEvent(event)
  return event
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
  vi.restoreAllMocks()
})

it('drives an Action bound to Mouse:Left exactly as a key: held, justPressed and value (CA-1)', () => {
  const canvas = makeCanvas()
  const input = makeInput({ attack: ['KeyJ', 'Mouse:Left'] }, canvas)

  button(canvas, 'pointerdown', 0)
  expect([input.held('attack'), input.justPressed('attack'), input.value('attack')]).toEqual([true, true, 1])
  input.endFrame()
  expect([input.held('attack'), input.justPressed('attack')]).toEqual([true, false])

  button(canvas, 'pointerup', 0)
  expect([input.held('attack'), input.value('attack')]).toEqual([false, 0])
})

it('maps the secondary button to Mouse:Right and keeps a tap between steps as one press (CA-1)', () => {
  const canvas = makeCanvas()
  const input = makeInput({ block: ['Mouse:Right'], attack: ['Mouse:Left'] }, canvas)

  button(canvas, 'pointerdown', 2)
  button(canvas, 'pointerup', 2)

  expect(input.justPressed('block')).toBe(true)
  expect(input.held('block')).toBe(false)
  expect(input.justPressed('attack')).toBe(false)
})

it('sees a button pressed or released while another is held, which browsers report as pointermove (CA-1)', () => {
  const canvas = makeCanvas()
  const input = makeInput({ attack: ['Mouse:Left'], block: ['Mouse:Right'] }, canvas)
  const sidebar = document.createElement('aside')
  document.body.append(sidebar)

  button(canvas, 'pointerdown', 0)
  chord(canvas, -1, 0b01)
  expect(input.held('attack')).toBe(true)
  chord(canvas, 2, 0b11)
  expect(input.held('block')).toBe(true)
  chord(canvas, 0, 0b10)
  expect(input.held('attack')).toBe(false)
  button(canvas, 'pointerup', 2)
  expect(input.held('block')).toBe(false)
  button(canvas, 'pointerdown', 0)
  chord(sidebar, 2, 0b11)
  expect(input.held('block')).toBe(false)
  button(canvas, 'pointerup', 0)

  input.endFrame()
  button(canvas, 'pointerdown', 0)
  expect(input.justPressed('attack')).toBe(true)
})

it('keeps the browser menu off the canvas when an Action binds Mouse:Right, so its release still arrives (CA-1)', () => {
  const bound = makeCanvas()
  makeInput({ block: ['Mouse:Right'] }, bound)
  const unbound = makeCanvas()
  makeInput({ attack: ['Mouse:Left'] }, unbound)

  expect(contextMenu(bound).defaultPrevented).toBe(true)
  expect(contextMenu(unbound).defaultPrevented).toBe(false)
})

it('ignores touch and pen pointers: Mouse: codes are the mouse’s (CA-1)', () => {
  const canvas = makeCanvas()
  const input = makeInput({ attack: ['Mouse:Left'] }, canvas)

  for (const pointerType of ['touch', 'pen']) {
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerType, bubbles: true }))
    expect(input.held('attack'), pointerType).toBe(false)
  }
  canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerType: 'mouse', bubbles: true }))
  canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType: 'touch', bubbles: true }))
  expect(input.held('attack')).toBe(true)
})

it('reads mouse buttons on the game canvas only, never on other page elements (CA-1)', () => {
  const canvas = makeCanvas()
  const input = makeInput({ attack: ['Mouse:Left'] }, canvas)
  const sidebar = document.createElement('aside')
  document.body.append(sidebar)

  button(sidebar, 'pointerdown', 0)

  expect(input.held('attack')).toBe(false)
  expect(input.justPressed('attack')).toBe(false)
})

it('warns once about an unknown Mouse: code, which never matches (CA-1)', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const canvas = makeCanvas()
  const input = makeInput({ zoom: ['Mouse:Middle'], pan: ['Mouse:Middle', 'Mouse:Left'] }, canvas)

  button(canvas, 'pointerdown', 1)

  const unknown = warn.mock.calls.filter(([message]) => String(message).includes('"Mouse:Middle"'))
  expect(unknown).toHaveLength(1)
  expect(String(unknown[0]?.[0])).toContain('unknown mouse binding')
  expect(input.held('zoom')).toBe(false)
  expect(warn.mock.calls.some(([message]) => String(message).includes('"Mouse:Left"'))).toBe(false)
})

it('reads no movement and no wheel without input (CA-2)', () => {
  const input = makeInput({})

  input.pollMouse()

  expect(input.mouseMovement()).toEqual({ x: 0, y: 0 })
  expect(input.wheelDelta()).toBe(0)
})

it('counts mouse movement only while the pointer is locked to the game canvas (CA-2)', () => {
  const canvas = makeCanvas()
  const input = makeInput({}, canvas)

  move(40, 10)
  locked = document.body
  move(5, 5)
  locked = canvas
  move(12, -3)
  move(8, 1)
  input.pollMouse()

  expect(input.mouseMovement()).toEqual({ x: 20, y: -2 })
})

it('freezes the movement and wheel at the step start and clears them in endFrame (CA-2)', () => {
  const canvas = makeCanvas()
  const input = makeInput({}, canvas)
  locked = canvas

  move(7, 2)
  wheel(canvas, 120)
  expect(input.mouseMovement()).toEqual({ x: 0, y: 0 })
  input.pollMouse()
  move(100, 100)

  expect(input.mouseMovement()).toEqual({ x: 7, y: 2 })
  expect(input.wheelDelta()).toBe(120)
  input.endFrame()
  expect(input.mouseMovement()).toEqual({ x: 0, y: 0 })
  expect(input.wheelDelta()).toBe(0)
  input.pollMouse()
  expect(input.mouseMovement()).toEqual({ x: 100, y: 100 })
})

it('counts the wheel over the canvas, and prevents its page scroll only there while preventsWheelScroll says so (CA-2)', () => {
  const page = document.createElement('section')
  document.body.append(page)
  const plain = makeCanvas()
  const plainInput = makeInput({}, plain)
  const orbiting = makeCanvas()
  let orbits = true
  const orbitInput = new Input({}, { canvas: orbiting, preventsWheelScroll: () => orbits })
  inputs.push(orbitInput)

  const overPlain = wheel(plain, -240)
  const overOrbit = wheel(orbiting, 120)
  const overPage = wheel(page, 500)
  orbits = false
  const afterOrbit = wheel(orbiting, 60)
  plainInput.pollMouse()
  orbitInput.pollMouse()

  expect(plainInput.wheelDelta()).toBe(-240)
  expect(orbitInput.wheelDelta()).toBe(180)
  expect([overPlain, overOrbit, overPage, afterOrbit].map((event) => event.defaultPrevented)).toEqual([false, true, false, false])
})

/** Records, per Simulation Step, the locked mouse movement and wheel a behavior reads. */
class MouseProbe extends Component {
  static override componentName = 'MouseProbe'
  log!: string[]
  override onUpdate(): void {
    const { x, y } = this.game.input.mouseMovement()
    this.log.push(`${x},${y} wheel ${this.game.input.wheelDelta()}`)
  }
}

it('hands each Simulation Step the movement since the previous one (CA-2)', () => {
  const canvas = makeCanvas()
  const game = new Game({ canvas })
  games.push(game)
  const log: string[] = []
  game.spawn('Probe').add(MouseProbe, { log })
  locked = canvas
  game.start()
  const loop = lastFakeRenderer().loop
  if (!loop) throw new Error('Game.start() did not install a frame callback')

  loop(0)
  move(3, 4)
  wheel(canvas, 50)
  loop(frameMs(60))
  loop(frameMs(60) * 2)

  expect(log).toEqual(['3,4 wheel 50', '0,0 wheel 0'])
})
