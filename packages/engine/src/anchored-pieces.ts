import type { Entity } from './entity.js'
import type { TimerHandle } from './game-time.js'
import type { PointerCamera, PointerResolution } from './pointer.js'
import { projectIsometric, type ProjectedPoint } from './projection.js'
import type { Stats, StatValue } from './stats.js'
import { placeholders, renderStat } from './ui-bindings.js'

/** Options for `game.ui.attach` (issue #72). */
export interface AttachOptions {
  /**
   * World units added to the entity's render point, in render space:
   * `[0, 1]` is one unit up on screen, under isometric projection too.
   * Default `[0, 0]`. Pixel fine-tuning belongs in the piece's CSS.
   */
  offset?: [number, number]
  /**
   * Seconds of Game Time the instance lives for (ADR 0017). It outlives its
   * entity, frozen where the entity last was, until then. Absent: the
   * instance dies with its entity.
   */
  seconds?: number
  /**
   * The instance's own values: `{{name}}` reads these before the Game's
   * stats, and every number (verbatim) or boolean (`1`/`0`) is also
   * published as the custom property `--name` on the instance.
   */
  values?: Record<string, StatValue>
}

/** One Anchored Piece, as `game.ui.attach` hands it back. */
export interface AnchoredPieceHandle {
  /** Sets one of the instance's own values: its `{{name}}` text and `--name` update in place. */
  set(name: string, value: StatValue): void
  /** Removes the instance now. `set` and `remove` on a removed handle are silent no-ops. */
  remove(): void
  /** False once removed, and from the start on an invalid attach. */
  readonly alive: boolean
  /** The piece's content root inside the instance's own shadow root; null once removed. */
  readonly element: HTMLElement | null
}

/** A rectangle in CSS px, relative to the canvas's top-left corner. */
export interface ViewportRect {
  x: number
  y: number
  width: number
  height: number
}

/** What the Game tells the anchored layer each time it places: read live, never cached. */
export interface AnchorView {
  camera: PointerCamera
  /** The game viewport: see gameViewport. */
  viewport: ViewportRect
  projection: 'isometric' | null
}

/**
 * The game viewport (issue #72): the rectangle the renderer draws into —
 * the whole canvas without a fixed resolution, the largest centred rect
 * with its aspect (letterbox) with one. The same math as Game.resize() and
 * the Pointer's letterbox, whose screen→world mapping placement inverts.
 */
export function gameViewport(
  width: number,
  height: number,
  resolution: PointerResolution | null,
): ViewportRect {
  if (!resolution) return { x: 0, y: 0, width, height }
  const aspect = resolution.width / resolution.height
  const vw = Math.min(width, height * aspect)
  const vh = vw / aspect
  return { x: (width - vw) / 2, y: (height - vh) / 2, width: vw, height: vh }
}

/** What GameUi lends the anchored layer: its catalog, the stats and its overlay. */
export interface AnchoredPiecesDeps {
  stats: Stats
  /** A piece's HTML source, or undefined when the piece was never defined. */
  source(name: string): string | undefined
  /** GameUi's overlay, mounted on demand. */
  overlay(): HTMLElement
}

/** The handle of an invalid attach (CA-7): nothing mounted, nothing to change. */
const INERT_HANDLE: AnchoredPieceHandle = Object.freeze({
  set(): void {},
  remove(): void {},
  alive: false,
  element: null,
})

/** Where the last render frame put an instance, in CSS px inside the game viewport. */
interface Placement {
  x: number
  y: number
  clipped: boolean
  /** The unrounded height on screen: 0 at the viewport's top, 1 at its bottom. */
  depth: number
}

interface Instance {
  readonly piece: string
  readonly entity: Entity
  readonly offset: readonly [number, number]
  /** The instance's own values, in the order they were first set. */
  readonly values: Map<string, StatValue>
  /** Shadow host: carries the position and the custom properties. */
  readonly host: HTMLDivElement
  /** The piece's content root inside the shadow (what the handle's element returns). */
  readonly root: HTMLElement
  /** The placeholder text nodes of each bound name. */
  readonly texts: Map<string, Text[]>
  readonly unsubs: Array<() => void>
  /** The Game Time timer that removes an instance given `seconds`. */
  expiry: TimerHandle | null
  /** Render-space anchor point frozen when a lingering instance's entity was destroyed. */
  frozen: ProjectedPoint | null
  placed: Placement | null
  alive: boolean
}

/**
 * Anchored Pieces (issue #72, ADR 0018): any number of instances of a UI
 * Piece, each following an entity in one layer of GameUi's overlay, each
 * with its own shadow root and its own values ahead of the Game's stats.
 * Owned by GameUi, which reaches it through `attach`; the Game drives the
 * rest through `anchoredPiecesOf` (ui.ts): `connect` once, `place` every
 * render frame.
 */
export class AnchoredPieces {
  private readonly instances: Instance[] = []
  /** Undefined piece names already warned about: one warning per name per Game. */
  private readonly warnedPieces = new Set<string>()
  private layer?: HTMLDivElement
  private view: (() => AnchorView) | null = null

  constructor(private readonly deps: AnchoredPiecesDeps) {}

  /** Called once by the Game: where the camera, viewport and projection are read from. */
  connect(view: () => AnchorView): void {
    this.view = view
  }

  attach(piece: string, entity: Entity, options: AttachOptions = {}): AnchoredPieceHandle {
    const html = this.deps.source(piece)
    if (html === undefined && !this.warnedPieces.has(piece)) {
      this.warnedPieces.add(piece)
      console.warn(`[waica] cannot attach unknown ui piece: "${piece}"`)
    }
    if (!entity.alive) {
      console.warn(`[waica] cannot attach ui piece "${piece}" to destroyed entity "${entity.name}"`)
    }
    if (html === undefined || !entity.alive) return INERT_HANDLE

    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none'
    const shadow = host.attachShadow({ mode: 'open' })
    const root = document.createElement('div')
    root.style.display = 'contents'
    root.innerHTML = html
    shadow.append(root)
    const offset = options.offset ?? [0, 0]
    const instance: Instance = {
      piece,
      entity,
      offset: [offset[0], offset[1]],
      values: new Map(Object.entries(options.values ?? {})),
      host,
      root,
      texts: new Map(),
      unsubs: [],
      expiry: null,
      frozen: null,
      placed: null,
      alive: true,
    }
    this.bind(instance)
    for (const [name, value] of instance.values) publish(host, name, value)
    this.mountLayer().append(host)
    this.instances.push(instance)
    if (options.seconds !== undefined) {
      // Not owned by the entity: it must outlive it. Scene-scoped, like the
      // instance itself. A duration game.time rejects (it warns) leaves the
      // instance to die with its entity instead of lingering forever.
      const expiry = entity.game.time.after(options.seconds, () => this.remove(instance))
      instance.expiry = expiry.active ? expiry : null
    }
    return this.handleFor(instance)
  }

  /**
   * Called by the Game before an entity's destroy() returns: its instances
   * go with it, except those given `seconds`, which stay frozen at its
   * current anchor point until they expire.
   */
  release(entity: Entity): void {
    for (const instance of this.instances.filter((candidate) => candidate.entity === entity)) {
      if (instance.expiry) instance.frozen = anchorPoint(instance, this.view?.().projection ?? null)
      else this.remove(instance)
    }
  }

  /** Removes every instance, lingering ones too (GameUi.unloadScene). */
  clear(): void {
    for (const instance of [...this.instances]) this.remove(instance)
  }

  /** Removes every instance and forgets the layer along with the overlay (GameUi.dispose). */
  dispose(): void {
    this.clear()
    this.layer = undefined
  }

  /**
   * Called by the Game once per render frame, after the isometric pass and
   * before the render (never per Simulation Step, never on attach): fits
   * the layer to the game viewport and puts every instance's zero-size
   * shadow host at its anchor point, with the frame's `--waica-unit`.
   */
  place(): void {
    const layer = this.layer
    if (!layer || !this.view) return
    const view = this.view()
    const { camera, viewport } = view
    layer.style.left = `${viewport.x}px`
    layer.style.top = `${viewport.y}px`
    layer.style.width = `${viewport.width}px`
    layer.style.height = `${viewport.height}px`
    // The camera frames exactly viewHeight world units vertically (Game.resize).
    const unit = `${viewport.height / (camera.top - camera.bottom)}px`
    const byDepth: Array<[Instance, number]> = []
    for (const instance of this.instances) {
      const placement = locate(instance, view)
      instance.placed = placement
      instance.host.style.left = `${placement.x}px`
      instance.host.style.top = `${placement.y}px`
      instance.host.style.setProperty('--waica-unit', unit)
      byDepth.push([instance, placement.depth])
    }
    // Lower on screen draws on top, like y-sort; the sort is stable, so
    // equal heights keep creation order, later on top.
    byDepth.sort(([, a], [, b]) => a - b)
    for (const [index, [instance]] of byDepth.entries()) instance.host.style.zIndex = String(index + 1)
  }

  private bind(instance: Instance): void {
    for (const [name, text] of placeholders(instance.root)) {
      const texts = instance.texts.get(name)
      if (texts) texts.push(text)
      else instance.texts.set(name, [text])
    }
    for (const name of instance.texts.keys()) {
      this.render(instance, name)
      instance.unsubs.push(
        this.deps.stats.onChange(name, () => {
          if (!instance.values.has(name)) this.render(instance, name)
        }),
      )
    }
  }

  /** Writes a name's current value — the instance's own, else the Game stat — into its placeholders. */
  private render(instance: Instance, name: string): void {
    const value = instance.values.has(name) ? instance.values.get(name) : this.deps.stats.get(name)
    for (const text of instance.texts.get(name) ?? []) text.nodeValue = renderStat(value)
  }

  private set(instance: Instance, name: string, value: StatValue): void {
    if (!instance.alive) return
    instance.values.set(name, value)
    this.render(instance, name)
    publish(instance.host, name, value)
  }

  private remove(instance: Instance): void {
    if (!instance.alive) return
    instance.alive = false
    instance.expiry?.cancel()
    for (const off of instance.unsubs) off()
    instance.host.remove()
    this.instances.splice(this.instances.indexOf(instance), 1)
  }

  private handleFor(instance: Instance): AnchoredPieceHandle {
    const pieces = this
    return {
      set(name: string, value: StatValue): void {
        pieces.set(instance, name, value)
      },
      remove(): void {
        pieces.remove(instance)
      },
      get alive(): boolean {
        return instance.alive
      },
      get element(): HTMLElement | null {
        return instance.alive ? instance.root : null
      },
    }
  }

  /**
   * The single layer every instance lives in, kept as the overlay's first
   * child — even when a screen piece created the overlay first — so every
   * screen-space piece draws above every anchored instance.
   */
  private mountLayer(): HTMLDivElement {
    if (this.layer) return this.layer
    const layer = document.createElement('div')
    // Until the first frame fits it to the game viewport, it covers the overlay.
    // Its own stacking context (z-index:0) keeps every instance's z-index
    // below the screen-piece shells that follow it.
    layer.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;z-index:0;pointer-events:none'
    this.deps.overlay().prepend(layer)
    this.layer = layer
    return layer
  }
}

/** The entity's render point plus the offset, in render space — or the point frozen at its destroy(). */
function anchorPoint(instance: Instance, projection: 'isometric' | null): ProjectedPoint {
  if (instance.frozen) return instance.frozen
  const { x, y } = instance.entity.position
  const render = projection === 'isometric' ? projectIsometric(x, y) : { x, y }
  return { x: render.x + instance.offset[0], y: render.y + instance.offset[1] }
}

/**
 * The anchor point in whole CSS px from the game viewport's top-left
 * corner: the exact inverse of the Pointer's screen→world mapping.
 */
function locate(instance: Instance, view: AnchorView): Placement {
  const anchor = anchorPoint(instance, view.projection)
  const { camera, viewport } = view
  const nx = (anchor.x - (camera.position.x + camera.left)) / (camera.right - camera.left)
  const ny = (camera.position.y + camera.top - anchor.y) / (camera.top - camera.bottom)
  return {
    x: whole(nx * viewport.width),
    y: whole(ny * viewport.height),
    clipped: nx < 0 || nx > 1 || ny < 0 || ny > 1,
    depth: ny,
  }
}

/** Rounds to a whole pixel, never -0. */
function whole(value: number): number {
  return Math.round(value) || 0
}

/** Numbers verbatim and booleans as 1/0 become `--name`; a string publishes nothing. */
function publish(host: HTMLElement, name: string, value: StatValue): void {
  const property = `--${name}`
  if (typeof value === 'number') host.style.setProperty(property, String(value))
  else if (typeof value === 'boolean') host.style.setProperty(property, value ? '1' : '0')
  else host.style.removeProperty(property)
}
