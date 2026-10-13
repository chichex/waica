/** The prefix of a mouse button's binding code, beside keys and `Gamepad:` codes (issue #181). */
export const MOUSE_CODE_PREFIX = 'Mouse:'

/** `PointerEvent.button` → the binding code of the buttons an Action can bind. */
const MOUSE_BUTTON_CODES: ReadonlyMap<number, string> = new Map([
  [0, 'Mouse:Left'],
  [2, 'Mouse:Right'],
])

const KNOWN_MOUSE_CODES = new Set(MOUSE_BUTTON_CODES.values())

/** Wheel deltas reported in lines or pages, in CSS pixels (the units of `deltaMode` 0). */
const WHEEL_LINE_PX = 16
const WHEEL_PAGE_PX = 800

/** A mouse movement or wheel reading, in CSS pixels. */
export interface MouseMovement {
  readonly x: number
  readonly y: number
}

/** What the mouse reports to the Input it belongs to: a button code going down or up. */
export interface MouseButtonSink {
  press(code: string): void
  release(code: string): void
}

export interface MouseInputOptions {
  /** The game canvas: buttons, the wheel and the pointer lock are read on it. Without one, only injected movement counts. */
  canvas?: HTMLCanvasElement
  /** Asked on a press over the canvas while it is unlocked: true takes the lock with that press, which then presses nothing (CA-3). */
  lockOnClick?: () => boolean
}

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
  private readonly canvas: HTMLCanvasElement | null
  private readonly lockOnClick: () => boolean

  constructor(
    private readonly buttons: MouseButtonSink,
    options: MouseInputOptions = {},
  ) {
    this.canvas = options.canvas ?? null
    this.lockOnClick = options.lockOnClick ?? (() => false)
    this.canvas?.addEventListener('pointerdown', this.onPointerDown)
    this.canvas?.addEventListener('pointerup', this.onPointerUp)
    this.canvas?.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('pointerup', this.onPointerUp)
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

  dispose(): void {
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas?.removeEventListener('pointerup', this.onPointerUp)
    this.canvas?.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('pointerup', this.onPointerUp)
    document.removeEventListener('mousemove', this.onMouseMove)
  }

  /** `document.pointerLockElement`, which a browser without the Pointer Lock API (or a test DOM) lacks. */
  private lockElement(): Element | null {
    return 'pointerLockElement' in document ? document.pointerLockElement : null
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.locked && this.lockOnClick()) {
      // This press only takes the lock (G-17): it never reaches `Mouse:Left`.
      this.requestLock()
      return
    }
    const code = MOUSE_BUTTON_CODES.get(event.button)
    if (code) this.buttons.press(code)
  }

  private onPointerUp = (event: PointerEvent): void => {
    const code = MOUSE_BUTTON_CODES.get(event.button)
    if (code) this.buttons.release(code)
  }

  private onWheel = (event: WheelEvent): void => {
    // Over the game canvas only, so the page around it still scrolls.
    event.preventDefault()
    this.pendingWheel += wheelPixels(event)
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return
    this.pendingMove.x += event.movementX
    this.pendingMove.y += event.movementY
  }
}
