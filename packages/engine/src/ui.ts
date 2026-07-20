import type { Stats, StatValue } from './stats'

/**
 * The HTML UI layer. Each piece is a self-contained HTML fragment
 * (markup + <style>) that only DRAWS: it declares which stats it shows
 * with {{stat}} placeholders and positions itself with its own CSS.
 * Behaviour always comes from outside — code toggles pieces with
 * show/hide and wires interactivity through element().
 *
 * Pieces mount inside a transparent overlay that covers the game canvas
 * (each in its own shadow root, so styles never leak between pieces or
 * into the hosting page). The whole overlay hides while the game is not
 * simulating (pause / editor edit mode).
 */
export class GameUi {
  private readonly sources = new Map<string, string>()
  private readonly pieces = new Map<string, Piece>()
  private overlay?: HTMLDivElement
  private active = true

  constructor(
    private readonly stats: Stats,
    /** Resolved lazily: the canvas may not be in the DOM at construction. */
    private readonly host: () => HTMLElement,
  ) {}

  /** Registers a piece's HTML source. Re-defining an unmounted name wins. */
  define(name: string, html: string): void {
    this.sources.set(name, html)
  }

  defineAll(pieces: Record<string, string>): void {
    for (const [name, html] of Object.entries(pieces)) this.define(name, html)
  }

  /** Piece names available to show (defined via the registry or define()). */
  names(): string[] {
    return [...this.sources.keys()]
  }

  show(name: string): void {
    const piece = this.mount(name)
    if (piece) piece.visible = true
    this.sync()
  }

  hide(name: string): void {
    const piece = this.pieces.get(name)
    if (piece) piece.visible = false
    this.sync()
  }

  toggle(name: string): void {
    if (this.isVisible(name)) this.hide(name)
    else this.show(name)
  }

  isVisible(name: string): boolean {
    return this.pieces.get(name)?.visible ?? false
  }

  /**
   * The piece's DOM root — the escape hatch that keeps pieces logic-free:
   * behaviour is wired from code (element(...).querySelector + listeners).
   * Mounts the piece hidden if it wasn't mounted yet.
   */
  element(name: string): HTMLElement | null {
    return this.mount(name)?.root ?? null
  }

  /** Called by the game loop: the overlay only draws while simulating. */
  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    this.sync()
  }

  /** Unmounts every piece and removes the overlay (Game.dispose). */
  dispose(): void {
    for (const piece of this.pieces.values()) {
      for (const off of piece.unsubs) off()
    }
    this.pieces.clear()
    this.overlay?.remove()
    this.overlay = undefined
  }

  private mount(name: string): Piece | null {
    const existing = this.pieces.get(name)
    if (existing) return existing
    const html = this.sources.get(name)
    if (html == null) {
      console.warn(`[waica] unknown ui piece: "${name}"`)
      return null
    }
    // Same geometry as the overlay, so the piece's own CSS positions
    // against the full canvas. pointer-events stays off unless the piece's
    // CSS opts in (e.g. a button with pointer-events:auto).
    const shell = document.createElement('div')
    shell.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    const shadow = shell.attachShadow({ mode: 'open' })
    const root = document.createElement('div')
    root.style.display = 'contents'
    root.innerHTML = html
    shadow.append(root)
    const piece: Piece = { shell, root, visible: false, unsubs: bindStats(root, this.stats) }
    this.mountOverlay().append(shell)
    this.pieces.set(name, piece)
    return piece
  }

  private mountOverlay(): HTMLDivElement {
    if (this.overlay) return this.overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:absolute;inset:0;z-index:9000;pointer-events:none'
    const host = this.host()
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(overlay)
    this.overlay = overlay
    this.sync()
    return overlay
  }

  private sync(): void {
    if (this.overlay) this.overlay.style.display = this.active ? '' : 'none'
    for (const piece of this.pieces.values()) {
      piece.shell.style.display = piece.visible ? '' : 'none'
    }
  }
}

interface Piece {
  /** Shadow host, same box as the overlay; display toggles visibility. */
  shell: HTMLDivElement
  /** The piece's content root inside the shadow (what element() returns). */
  root: HTMLElement
  visible: boolean
  unsubs: Array<() => void>
}

const BINDING = /\{\{\s*([\w-]+)\s*\}\}/g

function renderStat(value: StatValue | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? '✓' : '✕'
  return String(value)
}

/**
 * Replaces {{stat}} placeholders in the fragment's text with reactive text
 * nodes kept in sync with the stats. Text-only by design: the binding
 * language has no expressions — presentation, never logic.
 */
function bindStats(root: HTMLElement, stats: Stats): Array<() => void> {
  const unsubs: Array<() => void> = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Braces inside <style>/<script> are CSS/code, not bindings.
    if ((node as Text).parentElement?.closest('style, script')) continue
    if ((node.nodeValue ?? '').includes('{{')) targets.push(node as Text)
  }
  for (const text of targets) {
    const source = text.nodeValue ?? ''
    const parts: Node[] = []
    let last = 0
    for (const match of source.matchAll(BINDING)) {
      const stat = match[1]
      if (stat === undefined) continue
      if (match.index > last) parts.push(document.createTextNode(source.slice(last, match.index)))
      const bound = document.createTextNode(renderStat(stats.get(stat)))
      unsubs.push(stats.onChange(stat, (value) => (bound.nodeValue = renderStat(value))))
      parts.push(bound)
      last = match.index + match[0].length
    }
    if (parts.length === 0) continue
    if (last < source.length) parts.push(document.createTextNode(source.slice(last)))
    text.replaceWith(...parts)
  }
  return unsubs
}
