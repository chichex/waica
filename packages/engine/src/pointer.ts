import type { Entity } from './entity.js'
import { projectIsometric, unprojectIsometric, type ProjectedPoint } from './projection.js'
import { ySortZ } from './render-sort.js'
import { AnimatedSprite } from './components/animated-sprite.js'
import { Sprite } from './components/sprite.js'
import { spritePlacement } from './sprite-placement.js'

/** Fixed-resolution letterbox target; a duck-typed subset of GameResolution. */
export interface PointerResolution {
  width: number
  height: number
}

/** The orthographic camera state a Pointer needs; a duck-typed THREE.OrthographicCamera. */
export interface PointerCamera {
  position: { x: number; y: number }
  left: number
  right: number
  top: number
  bottom: number
}

export interface PointerDeps {
  camera: PointerCamera
  /** Fixed resolution (letterbox target), or null to fill the canvas. */
  resolution: PointerResolution | null
  /** The scene's active render projection, read live. */
  projection: () => 'isometric' | null
  /** Live entity list — read at pick time, so later spawns are visible. */
  entities: readonly Entity[]
}

/** One resolved click: the logical-space point, plus the entity picked there (if any). */
export interface PointerPick {
  readonly point: ProjectedPoint
  readonly entity: Entity | null
}

interface LetterboxRect {
  vx: number
  vy: number
  vw: number
  vh: number
}

interface PointerSpriteBox {
  width: number
  height: number
  offsetX: number
  offsetY: number
  anchorX: number
  anchorY: number
  layer: number
}

function spriteBoxOf(component: unknown): PointerSpriteBox | null {
  if (!(component instanceof Sprite) && !(component instanceof AnimatedSprite)) return null
  return {
    width: component.width,
    height: component.height,
    offsetX: component.offsetX,
    offsetY: component.offsetY,
    anchorX: component.anchorX,
    anchorY: component.anchorY,
    layer: component.layer,
  }
}

/**
 * Engine-owned pointer primitive (ADR-0010): the only place a click/tap on
 * the game canvas is read. Converts a real `pointerdown` into a logical-space
 * point (camera, letterbox, isometric unprojection) plus the entity picked
 * there — resolved against declared sprite bounds (width/height/offset/anchor
 * at the entity's projected position), y-sort breaking ties front-most wins —
 * and queues it as one pending click for a consumer (ClickToMove) to drain.
 * The Runtime Bridge injects a click through the same resolution, in logical
 * coordinates, via injectClick.
 */
export class Pointer {
  private pending: PointerPick | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: PointerDeps,
  ) {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.pending = null
  }

  /**
   * Consumes and clears the pending click, if any. A consumer (the grid
   * player role's update) drains this once per simulated frame, so a click
   * queued while paused takes effect on the next stepped frame.
   */
  takePending(): PointerPick | null {
    const pick = this.pending
    this.pending = null
    return pick
  }

  /**
   * Programmatic click injection (Runtime Bridge CA-10), in logical
   * coordinates — resolved through the exact same picking a real click uses.
   */
  injectClick(x: number, y: number): PointerPick {
    const renderPoint = this.toRenderPoint(x, y)
    const pick = this.resolveRenderPoint(renderPoint.x, renderPoint.y)
    this.pending = pick
    return pick
  }

  private handlePointerDown = (event: PointerEvent): void => {
    // Primary button only; a touch tap reports the same button (ADR-0010).
    if (event.button !== 0) return
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w <= 0 || h <= 0) return
    const { vx, vy, vw, vh } = this.letterboxRect(w, h)
    if (vw <= 0 || vh <= 0) return
    const rect = this.canvas.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const nx = (px - vx) / vw
    const ny = (py - vy) / vh
    // Outside the visible viewport (a letterbox bar): not a click on the world.
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return
    const camera = this.deps.camera
    const renderX = camera.position.x + camera.left + nx * (camera.right - camera.left)
    const renderY = camera.position.y + camera.top - ny * (camera.top - camera.bottom)
    this.pending = this.resolveRenderPoint(renderX, renderY)
  }

  private letterboxRect(w: number, h: number): LetterboxRect {
    const resolution = this.deps.resolution
    if (!resolution) return { vx: 0, vy: 0, vw: w, vh: h }
    const aspect = resolution.width / resolution.height
    const vw = Math.min(w, h * aspect)
    const vh = vw / aspect
    return { vx: (w - vw) / 2, vy: (h - vh) / 2, vw, vh }
  }

  private toRenderPoint(logicalX: number, logicalY: number): ProjectedPoint {
    return this.deps.projection() === 'isometric'
      ? projectIsometric(logicalX, logicalY)
      : { x: logicalX, y: logicalY }
  }

  private resolveRenderPoint(renderX: number, renderY: number): PointerPick {
    const point =
      this.deps.projection() === 'isometric'
        ? unprojectIsometric(renderX, renderY)
        : { x: renderX, y: renderY }
    return { point, entity: this.pickEntity(renderX, renderY) }
  }

  /**
   * The entity whose projected sprite bounds contain the render-space point,
   * front-most under y-sort winning ties (ADR-0010, CA-1). Ignores current
   * animation frame and mirroring: picking is scoped to the declared
   * width/height/offset/anchor box, not the momentary displayed frame.
   */
  private pickEntity(renderX: number, renderY: number): Entity | null {
    const hits: { entity: Entity; layer: number; y: number }[] = []
    for (const entity of this.deps.entities) {
      if (!entity.alive) continue
      for (const component of entity.components) {
        const box = spriteBoxOf(component)
        if (!box) continue
        const anchor =
          this.deps.projection() === 'isometric'
            ? projectIsometric(entity.position.x, entity.position.y)
            : { x: entity.position.x, y: entity.position.y }
        const placement = spritePlacement({
          width: box.width,
          height: box.height,
          offsetX: box.offsetX,
          offsetY: box.offsetY,
          anchorX: box.anchorX,
          anchorY: box.anchorY,
          flipX: false,
          frameScaleX: 1,
          frameScaleY: 1,
        })
        const halfW = Math.abs(placement.scaleX) / 2
        const halfH = Math.abs(placement.scaleY) / 2
        const centerX = anchor.x + placement.x
        const centerY = anchor.y + placement.y
        if (
          renderX >= centerX - halfW &&
          renderX <= centerX + halfW &&
          renderY >= centerY - halfH &&
          renderY <= centerY + halfH
        ) {
          hits.push({ entity, layer: box.layer, y: entity.position.y })
          break
        }
      }
    }
    if (hits.length === 0) return null
    if (hits.length === 1) return hits[0]!.entity
    const z = ySortZ(hits.map((h) => ({ layer: h.layer, y: h.y })))
    let bestIndex = 0
    for (let i = 1; i < hits.length; i += 1) if (z[i]! > z[bestIndex]!) bestIndex = i
    return hits[bestIndex]!.entity
  }
}
