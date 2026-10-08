import * as THREE from 'three/webgpu'
import { Tilemap } from './components/tilemap.js'
import type { Entity } from './entity.js'
import type { Game, GameResolution } from './game.js'
import { LightMap } from './light-map.js'
import { buildOccluderGrid, type OccluderSource } from './occluder-grid.js'
import { PostPass } from './post-pass.js'
import { EMISSIVE_LAYER } from './render-layers.js'
import { ambientIsFull, ambientMultiplier, occluderRevision } from './scene-lighting.js'
import type { SpriteBatches } from './sprite-batches.js'

/** What a frame is drawn with besides the Game's public state: its renderer and Sprite Batches. */
export interface FrameSurface {
  readonly game: Game
  readonly renderer: THREE.WebGPURenderer
  readonly spriteBatches: SpriteBatches
  /** The fixed internal resolution, null to fill the canvas. */
  readonly resolution: GameResolution | null
}

/** Layer 0 alone: every drawable that is not Emissive. */
const LIT_MASK = 1
const EMISSIVE_MASK = 1 << EMISSIVE_LAYER

/**
 * What the occluder grid is built from: the solid tiles' revision and every
 * Tilemap's origin, so moving a Tilemap rebuilds it too (review) — still
 * never per frame while nothing changes.
 */
export function occluderSignature(game: Game): string {
  const origins = occluderSources(game.entities).map(({ originX, originY }) => `${originX},${originY}`)
  return `${occluderRevision(game.lighting)}|${origins.join(';')}`
}

/** Every Tilemap of the scene as an occluder source (inference 8). */
function occluderSources(entities: readonly Entity[]): OccluderSource[] {
  const sources: OccluderSource[] = []
  for (const entity of entities) {
    for (const component of entity.components) {
      if (!(component instanceof Tilemap)) continue
      sources.push({
        originX: entity.position.x,
        originY: entity.position.y,
        cellSize: component.cellSize,
        mapWidth: component.mapWidth,
        mapHeight: component.mapHeight,
        cells: component.cells,
        solidTiles: component.solidTiles,
      })
    }
  }
  return sources
}

/**
 * Draws one frame (issue #78, ADR 0026). Off path (B4): an unlit scene with
 * no Post Effect is one render straight into the canvas, exactly as before,
 * and nothing here is ever built. Lit: the scene without its Emissive
 * drawables, then the light-map multiplied over it, then the Emissive
 * drawables. With a Post Effect, all of that goes into a target drawn like the
 * canvas and
 * one pass writes it to the canvas.
 */
export class FrameComposer {
  private lightMap: LightMap | null = null
  private postPass: PostPass | null = null
  private readonly size = new THREE.Vector2()

  constructor(private readonly surface: FrameSurface) {}

  draw(): void {
    // Full Ambient Light: the light-map would be 1 everywhere, so nothing to multiply.
    const lit = this.surface.game.lighting.active && !ambientIsFull(this.surface.game.lighting)
    const post = this.surface.game.post.active
    if (!lit && !post) {
      this.clearLetterbox()
      this.drawScene()
      return
    }
    const { width, height } = this.frameSize()
    if (!post) {
      this.clearLetterbox()
      this.drawLit(width, height)
      return
    }
    this.drawThroughPost(width, height, lit)
  }

  dispose(): void {
    this.lightMap?.dispose()
    this.lightMap = null
    this.postPass?.dispose()
    this.postPass = null
  }

  /** The light-map's (and the Post Effects') size: the internal resolution, else the drawing buffer (B2). */
  private frameSize(): { width: number; height: number } {
    const { renderer, resolution } = this.surface
    if (resolution) return { width: Math.max(1, Math.round(resolution.width)), height: Math.max(1, Math.round(resolution.height)) }
    renderer.getDrawingBufferSize(this.size)
    return { width: Math.max(1, this.size.x), height: Math.max(1, this.size.y) }
  }

  /** Letterbox bars: clear the whole canvas, then render inside the scissor. */
  private clearLetterbox(): void {
    const { renderer, resolution } = this.surface
    if (!resolution) return
    renderer.setScissorTest(false)
    renderer.setClearColor(0x000000, 1)
    renderer.clear(true, false, false)
    renderer.setScissorTest(true)
  }

  /** The scene through its Sprite Batches (ADR 0024), for the camera's current layers. */
  private drawScene(): void {
    const { spriteBatches, renderer } = this.surface
    const { scene, camera } = this.surface.game
    spriteBatches.drawFrame(scene, camera, () => renderer.render(scene, camera))
  }

  /** The scene for one layer mask, restoring the camera's own mask after. */
  private drawLayers(mask: number): void {
    const layers = this.surface.game.camera.layers
    const own = layers.mask
    layers.mask = mask
    try {
      this.drawScene()
    } finally {
      layers.mask = own
    }
  }

  /** Scene, light-map, Emissive drawables, into whatever target is bound now. */
  private drawLit(width: number, height: number): void {
    this.drawLayers(LIT_MASK)
    this.composeLight(width, height)
  }

  private composeLight(width: number, height: number): void {
    const { renderer } = this.surface
    const { scene, camera, lighting } = this.surface.game
    this.lightMap ??= new LightMap()
    this.lightMap.render(renderer, camera, {
      width,
      height,
      ambient: ambientMultiplier(lighting),
      lights: lighting.lights,
      projection: this.surface.game.projection,
      occluderRevision: occluderSignature(this.surface.game),
      occluders: () => buildOccluderGrid(occluderSources(this.surface.game.entities)),
    })
    const autoClear = renderer.autoClear
    const background = scene.background
    renderer.autoClear = false
    scene.background = null
    try {
      this.lightMap.multiplyOver(renderer)
      this.drawLayers(EMISSIVE_MASK)
    } finally {
      renderer.autoClear = autoClear
      scene.background = background
    }
  }

  /** The frame into the Post Effects' canvas-like target, then one pass to the canvas (CA-11). */
  private drawThroughPost(width: number, height: number, lit: boolean): void {
    const { renderer } = this.surface
    const { post } = this.surface.game
    this.postPass ??= new PostPass()
    this.postPass.resize(width, height)
    // The target stores what the canvas would, so the scene's own (canvas) background clears it.
    renderer.setRenderTarget(this.postPass.target)
    try {
      if (lit) this.drawLit(width, height)
      else this.drawScene()
    } finally {
      renderer.setRenderTarget(null)
    }
    this.clearLetterbox()
    this.postPass.draw(renderer, { vignette: post.vignette, colorGrade: post.colorGrade })
  }
}
