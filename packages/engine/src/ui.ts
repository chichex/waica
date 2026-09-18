import { AnchoredPieces, type AnchoredPieceHandle, type AttachOptions } from './anchored-pieces.js'
import type { Entity } from './entity.js'
import type { Stats } from './stats.js'
import { placeholders, renderStat } from './ui-bindings.js'

/**
 * Module-private key for the anchored layer. Not exported, so
 * `ui[ANCHORED]()` cannot be spelled outside this file — `anchoredPiecesOf`
 * (below, exported, but not from the package entry) is the Game's only way in.
 */
const ANCHORED = Symbol('waica.ui.anchored')

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
 *
 * Screen pieces are singletons by name (show/hide). An Anchored Piece is
 * one more instance of a piece that follows an entity (attach), in a layer
 * below every screen piece — see ADR 0018.
 */
export class GameUi {
  private readonly sources = new Map<string, string>()
  private readonly pieces = new Map<string, Piece>()
  private readonly anchored: AnchoredPieces
  private overlay?: HTMLDivElement
  private active = true

  constructor(
    private readonly stats: Stats,
    /** Resolved lazily: the canvas may not be in the DOM at construction. */
    private readonly host: () => HTMLElement,
  ) {
    this.anchored = new AnchoredPieces({
      stats,
      source: (name) => this.sources.get(name),
      overlay: () => this.mountOverlay(),
    })
  }

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

  show(name: string, options: ShowOptions = {}): void {
    const mounted = this.pieces.has(name)
    const piece = this.mount(name)
    if (piece) {
      piece.visible = true
      // Scope belongs to whoever mounts the piece, and a later show never
      // changes it. Otherwise a scene whose `ui` list happens to name a piece
      // the host already mounted would quietly take ownership of it and
      // destroy it on the next unload — a session-scoped HUD dying with a
      // map it merely shares a name with.
      if (!mounted) piece.scope = options.scope
    }
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

  /**
   * Anchors a new instance of the piece to `entity` (issue #72): its own
   * shadow root and values, placed every render frame at the entity's
   * render point plus `offset`. Every call is a new instance; the screen
   * piece of the same name is never touched. An undefined piece or a dead
   * entity warns and returns an inert handle — it never throws.
   */
  attach(piece: string, entity: Entity, options: AttachOptions = {}): AnchoredPieceHandle {
    return this.anchored.attach(piece, entity, options)
  }

  /** Called by the game loop: the overlay only draws while simulating. */
  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    this.sync()
  }

  /** Unmounts every piece and Anchored Piece and removes the overlay (Game.dispose). */
  dispose(): void {
    for (const piece of this.pieces.values()) {
      for (const off of piece.unsubs) off()
    }
    this.pieces.clear()
    this.anchored.dispose()
    this.overlay?.remove()
    this.overlay = undefined
  }

  /**
   * Unmounts every scene-scoped piece: the ones `loadScene` showed from the
   * outgoing scene's `ui` list, plus any shown with `{ scope: 'scene' }`.
   * A piece the host showed with no scope is untouched. Every Anchored
   * Piece goes too, lingering ones included: none outlives its scene. The
   * definition catalog (sources) always survives — Game.unloadScene.
   */
  unloadScene(): void {
    this.anchored.clear()
    for (const [name, piece] of this.pieces) {
      if (piece.scope !== 'scene') continue
      for (const off of piece.unsubs) off()
      piece.shell.remove()
      this.pieces.delete(name)
    }
    this.sync()
  }

  /** Engine-internal: see anchoredPiecesOf. */
  [ANCHORED](): AnchoredPieces {
    return this.anchored
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
    const piece: Piece = {
      shell,
      root,
      visible: false,
      scope: undefined,
      unsubs: bindStats(root, this.stats),
    }
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

/**
 * Engine-internal: the anchored layer behind `ui.attach`, which the Game
 * connects to its camera and viewport and places every render frame.
 */
export function anchoredPiecesOf(ui: GameUi): AnchoredPieces {
  return ui[ANCHORED]()
}

interface Piece {
  /** Shadow host, same box as the overlay; display toggles visibility. */
  shell: HTMLDivElement
  /** The piece's content root inside the shadow (what element() returns). */
  root: HTMLElement
  visible: boolean
  /** 'scene': dies on Game.unloadScene(). Undefined: outlives the scene. */
  scope: 'scene' | undefined
  unsubs: Array<() => void>
}

export interface ShowOptions {
  /** 'scene': unmounted by Game.unloadScene() along with the rest of the scene. */
  scope?: 'scene'
}

/**
 * Fills each {{stat}} placeholder with the stat's value and keeps it in
 * sync; returns the unsubscribes.
 */
function bindStats(root: HTMLElement, stats: Stats): Array<() => void> {
  return placeholders(root).map(([stat, text]) => {
    text.nodeValue = renderStat(stats.get(stat))
    return stats.onChange(stat, (value) => (text.nodeValue = renderStat(value)))
  })
}
