/** The prefix of a mouse button's binding code, beside keys and `Gamepad:` codes (issue #181). */
export const MOUSE_CODE_PREFIX = 'Mouse:'

/** `PointerEvent.button` → the binding code of the buttons an Action can bind. */
const MOUSE_BUTTON_CODES: ReadonlyMap<number, string> = new Map([
  [0, 'Mouse:Left'],
  [2, 'Mouse:Right'],
])

const KNOWN_MOUSE_CODES = new Set(MOUSE_BUTTON_CODES.values())

/** `PointerEvent.button` → its bit in `PointerEvent.buttons`, which tells a chorded press from a chorded release. */
const MOUSE_BUTTON_BITS: ReadonlyMap<number, number> = new Map([
  [0, 1],
  [2, 2],
])

/** Wheel deltas reported in lines or pages, in CSS pixels (the units of `deltaMode` 0). */
const WHEEL_LINE_PX = 16
const WHEEL_PAGE_PX = 800

/** A mouse movement or wheel reading, in CSS pixels. */
export interface MouseMovement {
  readonly x: number
  readonly y: number
}

/** What the mouse reports to the Input it belongs to: a button code going down or up, and whether an Action binds a code. */
export interface MouseButtonSink {
  press(code: string): void
  release(code: string): void
  binds(code: string): boolean
}

export interface MouseInputOptions {
  /** The game canvas: buttons, the wheel and the pointer lock are read on it. Without one, only injected movement counts. */
  canvas?: HTMLCanvasElement
  /** Asked on a press over the canvas while it is unlocked: true takes the lock with that press, which then presses nothing (CA-3). */
  lockOnClick?: () => boolean
  /** Asked on each wheel over the canvas: true keeps the page from scrolling (an orbit camera zooms with it); false by default (CA-2). */
  preventsWheelScroll?: () => boolean
}

/** Touch and pen pointers are not the mouse: `Mouse:` codes ignore them (no mobile support, issue #181). */
const fromMouse = (event: PointerEvent): boolean => event.pointerType !== 'touch' && event.pointerType !== 'pen'

/** True for a `Mouse:` code no button reports, which therefore never matches. */
export function isUnknownMouseCode(code: string): boolean {
  return code.startsWith(MOUSE_CODE_PREFIX) && !KNOWN_MOUSE_CODES.has(code)
}

function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_PX
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE_PX
  return event.deltaY
}

/**
 * The mouse as an Input source (issue #181): its buttons as `Mouse:` binding
 * codes, its movement while the pointer is locked to the game canvas, the
 * wheel over the canvas, and the pointer lock itself. Movement and wheel
 * accumulate between Simulation Steps, are frozen by `poll()` at a step's
 * start and read zero again after `endStep()`.
 */
export class MouseInput {
  private pendingMove = { x: 0, y: 0 }
  private pendingWheel = 0
  private move: MouseMovement = { x: 0, y: 0 }
  private wheel = 0
  private readonly preventsWheelScroll: () => boolean
  private readonly canvas: HTMLCanvasElement | null
  private readonly lockOnClick: () => boolean

  constructor(
    private readonly buttons: MouseButtonSink,
    options: MouseInputOptions = {},
  ) {
    this.canvas = options.canvas ?? null
    this.lockOnClick = options.lockOnClick ?? (() => false)
    this.preventsWheelScroll = options.preventsWheelScroll ?? (() => false)
    this.canvas?.addEventListener('pointerdown', this.onPointerDown)
    this.canvas?.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas?.addEventListener('contextmenu', this.onContextMenu)
    // A release anywhere counts, so a button let go off the canvas never stays held.
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointermove', this.onPointerChord)
    document.addEventListener('mousemove', this.onMouseMove)
  }

  /** Is the pointer locked to the game canvas right now? */
  get locked(): boolean {
    return this.canvas !== null && this.lockElement() === this.canvas
  }

  /** The locked movement of the current Simulation Step; zero between steps. */
  movement(): MouseMovement {
    return this.move
  }

  /** The wheel delta of the current Simulation Step, in CSS px (positive scrolls down); zero between steps. */
  wheelDelta(): number {
    return this.wheel
  }

  /** Freezes what accumulated since the last step as this step's movement and wheel. */
  poll(): void {
    this.move = { ...this.pendingMove }
    this.wheel = this.pendingWheel
    this.pendingMove = { x: 0, y: 0 }
    this.pendingWheel = 0
  }

  /** The step is over: its movement and wheel read zero until the next poll. */
  endStep(): void {
    this.move = { x: 0, y: 0 }
    this.wheel = 0
  }

  /** Adds a movement as if the pointer were locked (the Runtime Bridge's `look`, CA-4). */
  inject(dx: number, dy: number): void {
    this.pendingMove.x += dx
    this.pendingMove.y += dy
  }

  /** Exits the pointer lock when the game canvas holds it; a lock on any other element is left alone. */
  releaseLock(): void {
    if (this.locked && 'exitPointerLock' in document) document.exitPointerLock()
  }

  /** Asks the browser to lock the pointer to the game canvas; a refusal (or no Pointer Lock API) leaves it unlocked. */
  requestLock(): void {
    const canvas = this.canvas
    if (!canvas || !('requestPointerLock' in canvas)) return
    try {
      Promise.resolve(canvas.requestPointerLock()).catch(() => {
        // Refused (no user gesture, or the page lost focus): the next click asks again.
      })
    } catch {
      // Older browsers throw synchronously instead of rejecting; same outcome.
    }
  }

  /** Stops listening, and releases the pointer lock if this canvas holds it (a Game that goes away, the editor's Play stopping). */
  dispose(): void {
    if (this.locked && 'exitPointerLock' in document) document.exitPointerLock()
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas?.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('pointerup', this.onPointerUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('pointermove', this.onPointerChord)
  }

  /** `document.pointerLockElement`, which a browser without the Pointer Lock API (or a test DOM) lacks. */
  private lockElement(): Element | null {
    return 'pointerLockElement' in document ? document.pointerLockElement : null
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!fromMouse(event)) return
    if (!this.locked && this.lockOnClick()) {
      // This press only takes the lock (G-17): it never reaches `Mouse:Left`.
      this.requestLock()
      return
    }
    const code = MOUSE_BUTTON_CODES.get(event.button)
    if (code) this.buttons.press(code)
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (!fromMouse(event)) return
    const code = MOUSE_BUTTON_CODES.get(event.button)
    if (code) this.buttons.release(code)
  }

  /**
   * A button going down or up while another is held fires `pointermove`, not
   * `pointerdown`/`pointerup` (Pointer Events' chorded buttons). Its bit in
   * `buttons` tells which; a press counts over the canvas only, like the first.
   */
  private onPointerChord = (event: PointerEvent): void => {
    const bit = MOUSE_BUTTON_BITS.get(event.button)
    if (bit === undefined || !fromMouse(event)) return
    if ((event.buttons & bit) === 0) this.onPointerUp(event)
    else if (event.target === this.canvas) this.onPointerDown(event)
  }

  /** The browser menu would swallow the release of a bound `Mouse:Right`; other games keep their menu. */
  private onContextMenu = (event: MouseEvent): void => {
    if (this.buttons.binds('Mouse:Right')) event.preventDefault()
  }

  private onWheel = (event: WheelEvent): void => {
    // Over the game canvas only, and only while something zooms with it (an orbit camera, issue #181): otherwise the page still scrolls.
    if (this.preventsWheelScroll()) event.preventDefault()
    this.pendingWheel += wheelPixels(event)
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return
    this.pendingMove.x += event.movementX
    this.pendingMove.y += event.movementY
  }
}
