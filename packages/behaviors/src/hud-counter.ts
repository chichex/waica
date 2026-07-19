import { Component } from '@waica/engine'

/**
 * Collect counter drawn over the game canvas — the data-driven HUD that
 * scenes ship as a 'ui/*' prefab entity. Counts the game's 'collect' events
 * and starts from zero on every fresh play run.
 */
export class HudCounter extends Component {
  static override componentName = 'HudCounter'

  icon = '🪙'
  anchor: 'top-left' | 'top-right' = 'top-left'

  private count = 0
  private node?: HTMLDivElement
  private wasSimulating = false
  private offCollect?: () => void
  private offFrame?: () => void

  override onReady(): void {
    const node = document.createElement('div')
    node.style.cssText =
      'position:absolute;top:12px;z-index:9000;font:600 20px system-ui,sans-serif;' +
      'color:#ffd166;text-shadow:0 1px 3px #000a;user-select:none;pointer-events:none;' +
      'display:none'
    node.style[this.anchor === 'top-right' ? 'right' : 'left'] = '12px'
    const host = this.canvasParent() ?? document.body
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(node)
    this.node = node
    this.refresh()
    this.offCollect = this.game.events.on('collect', (value) => {
      this.count += typeof value === 'number' ? value : 1
      this.refresh()
    })
    // Component onUpdate pauses together with game.simulate, but the HUD must
    // react to the pause itself (hide, then reset on resume): sync every frame.
    this.offFrame = this.game.onUpdate(() => this.sync())
  }

  override onDestroy(): void {
    this.offCollect?.()
    this.offFrame?.()
    this.node?.remove()
    this.node = undefined
  }

  private sync(): void {
    if (!this.node) return
    if (this.game.simulate && !this.wasSimulating) {
      this.count = 0
      this.refresh()
    }
    this.node.style.display = this.game.simulate ? '' : 'none'
    this.wasSimulating = this.game.simulate
  }

  private refresh(): void {
    if (this.node) this.node.textContent = `${this.icon} ${this.count}`
  }

  /** The engine keeps its renderer private; the HUD only needs the canvas parent. */
  private canvasParent(): HTMLElement | null {
    const game = this.game as unknown as { renderer?: { domElement?: HTMLCanvasElement } }
    return game.renderer?.domElement?.parentElement ?? null
  }
}
