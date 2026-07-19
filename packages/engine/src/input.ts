export type ActionName = 'left' | 'right' | 'jump' | (string & {})

const DEFAULT_BINDINGS: Record<string, string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
}

/**
 * Input por acciones con bindings por defecto del arquetipo.
 * v0: teclado. TODO(H1): gamepad y touch.
 */
export class Input {
  private readonly bindings = new Map<string, Set<string>>()
  private readonly down = new Set<string>()
  private readonly justDown = new Set<string>()

  constructor(bindings: Record<string, string[]> = DEFAULT_BINDINGS) {
    for (const [action, codes] of Object.entries(bindings)) {
      this.bindings.set(action, new Set(codes))
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  /** ¿La acción está sostenida este frame? */
  held(action: ActionName): boolean {
    return this.isActive(action, this.down)
  }

  /** ¿La acción se presionó exactamente este frame? */
  justPressed(action: ActionName): boolean {
    return this.isActive(action, this.justDown)
  }

  /** Eje -1..1 a partir de dos acciones (left/right por defecto). */
  axis(negative: ActionName = 'left', positive: ActionName = 'right'): number {
    return (this.held(positive) ? 1 : 0) - (this.held(negative) ? 1 : 0)
  }

  /** El Game la llama al final de cada frame. */
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
