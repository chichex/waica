import { Component } from '@waica/engine'

/**
 * Stat readout drawn over the game canvas — the data-driven HUD that
 * scenes ship as a 'ui/*' prefab entity. Shows one stat from game.stats
 * (points, lives…), which starts from the project's declared initial
 * values (src/stats.json) on every fresh play run.
 */
export class HudCounter extends Component {
  static override componentName = 'HudCounter'
  static override displayName = 'Counter'
  static override params = {
    stat: { label: 'Stat' },
  }

  icon = '🪙'
  anchor: 'top-left' | 'top-right' = 'top-left'
  /** Which stat to display. */
  stat = 'points'

  private node?: HTMLDivElement
  private offChange?: () => void
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
    this.offChange = this.game.stats.onChange(this.stat, () => this.refresh())
    // Component onUpdate pauses together with game.simulate, but the HUD must
    // react to the pause itself (hide until resumed): sync every frame.
    this.offFrame = this.game.onUpdate(() => this.sync())
  }

  override onDestroy(): void {
    this.offChange?.()
    this.offFrame?.()
    this.node?.remove()
    this.node = undefined
  }

  private sync(): void {
    if (this.node) this.node.style.display = this.game.simulate ? '' : 'none'
  }

  private refresh(): void {
    if (!this.node) return
    const value = this.game.stats.get(this.stat) ?? 0
    this.node.textContent = `${this.icon} ${typeof value === 'boolean' ? (value ? '✓' : '✕') : value}`
  }

  /** The engine keeps its renderer private; the HUD only needs the canvas parent. */
  private canvasParent(): HTMLElement | null {
    const game = this.game as unknown as { renderer?: { domElement?: HTMLCanvasElement } }
    return game.renderer?.domElement?.parentElement ?? null
  }
}
