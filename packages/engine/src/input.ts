export type ActionName = 'left' | 'right' | 'jump' | (string & {})

/** Action → KeyboardEvent.code list. */
export type InputBindings = Record<string, string[]>

export const DEFAULT_BINDINGS: Readonly<InputBindings> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
}

/**
 * Action-based input with archetype default bindings.
 * v0: keyboard. TODO(H1): gamepad and touch.
 */
export class Input {
  private readonly bindings = new Map<string, Set<string>>()
  private readonly down = new Set<string>()
  private readonly justDown = new Set<string>()

  /** Custom bindings override per action; unmentioned actions keep the defaults. */
  constructor(bindings?: InputBindings) {
    for (const [action, codes] of Object.entries({ ...DEFAULT_BINDINGS, ...bindings })) {
      this.bindings.set(action, new Set(codes))
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  /** Is the action held this frame? */
  held(action: ActionName): boolean {
    return this.isActive(action, this.down)
  }

  /** Was the action pressed exactly this frame? */
  justPressed(action: ActionName): boolean {
    return this.isActive(action, this.justDown)
  }

  /** -1..1 axis from two actions (left/right by default). */
  axis(negative: ActionName = 'left', positive: ActionName = 'right'): number {
    return (this.held(positive) ? 1 : 0) - (this.held(negative) ? 1 : 0)
  }

  /** Called by the Game at the end of each frame. */
  endFrame(): void {
    this.justDown.clear()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }

  private isActive(action: ActionName, set: Set<string>): boolean {
    const codes = this.bindings.get(action)
    if (!codes) return false
    for (const code of codes) if (set.has(code)) return true
    return false
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    this.down.add(e.code)
    this.justDown.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code)
  }
}
