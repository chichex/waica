import * as THREE from 'three/webgpu'
import { Component } from '../component.js'
import type { YSortParticipant } from '../render-sort.js'
import { spritePlacement } from '../sprite-placement.js'
import { reportRejection } from '../report-rejection.js'
import type { SpriteBatchKey } from '../sprite-batch.js'
import { spriteBatchesOf, spriteInstanceOf, type SpriteBatches } from '../sprite-batches.js'

const clampAnchor = (value: number): number => Math.min(1, Math.max(0, value))

export type SpriteShape = 'rectangle' | 'circle'

/**
 * Textured or flat-color quad. In the unified pipeline, a 2D sprite is a
 * plane in front of the orthographic camera (see DESIGN.md §6, decision 2).
 */
export class Sprite extends Component implements YSortParticipant {
  static override componentName = 'Sprite'
  static override params = {
    offsetX: { label: 'x offset' },
    offsetY: { label: 'y offset' },
    anchorX: { label: 'x anchor', min: 0, max: 1, step: 0.25 },
    anchorY: { label: 'y anchor', min: 0, max: 1, step: 0.25 },
    layer: { label: 'layer', min: -5, max: 5, step: 1 },
  }
  static override transient = ['mesh']
  // Size, color and offset are reactive so inspector edits update the live quad.
  // Texture still needs a rebuild. TODO(H1): fully reactive props.

  private _width = 1
  private _height = 1
  get width(): number {
    return this._width
  }
  set width(value: number) {
    this._width = value
    this.syncQuad()
  }
  get height(): number {
    return this._height
  }
  set height(value: number) {
    this._height = value
    this.syncQuad()
  }

  private _color = 0xffffff
  get color(): number {
    return this._color
  }
  set color(value: number) {
    this._color = value
    const instance = spriteInstanceOf(this.mesh)
    if (instance) instance.color.setHex(value)
    else this.mesh?.material.color.setHex(value)
  }

  private _offsetX = 0
  private _offsetY = 0
  get offsetX(): number {
    return this._offsetX
  }
  set offsetX(value: number) {
    this._offsetX = value
    this.syncQuad()
  }
  get offsetY(): number {
    return this._offsetY
  }
  set offsetY(value: number) {
    this._offsetY = value
    this.syncQuad()
  }

  private _anchorX = 0.5
  private _anchorY = 0.5
  get anchorX(): number {
    return this._anchorX
  }
  set anchorX(value: number) {
    this._anchorX = clampAnchor(value)
    this.syncQuad()
  }
  get anchorY(): number {
    return this._anchorY
  }
  set anchorY(value: number) {
    this._anchorY = clampAnchor(value)
    this.syncQuad()
  }

  /** Optional texture URL; with pixelArt on it filters in nearest. */
  texture?: string
  pixelArt = false

  // Draw order among sprites: higher layers render in front. Same-layer
  // sprites fall back to spawn order, so give overlap an explicit layer.
  private _layer = 0
  get layer(): number {
    return this._layer
  }
  set layer(value: number) {
    this._layer = value
    if (this.mesh) this.mesh.position.z = value * 0.01
  }

  /** Y-sort pass hook: overrides the layer-derived z for this frame. */
  setSortZ(z: number): void {
    if (this.mesh) this.mesh.position.z = z
  }

  private _shape: SpriteShape = 'rectangle'
  get shape(): SpriteShape {
    return this._shape
  }
  set shape(value: SpriteShape) {
    this._shape = value === 'circle' ? 'circle' : 'rectangle'
    if (!this.mesh) return
    const instance = spriteInstanceOf(this.mesh)
    if (instance) {
      instance.moveTo({ ...instance.key, shape: this._shape })
      return
    }
    this.mesh.geometry.dispose()
    this.mesh.geometry = this.createGeometry()
  }

  // The drawn quad, or under Sprite Batches (ADR 0024) the hidden anchor of
  // this sprite's instance: the same placement either way.
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | THREE.MeshBasicNodeMaterial>

  override onReady(): void {
    const batches = spriteBatchesOf(this.game)
    if (batches?.enabled) this.joinBatch(batches)
    else this.buildMesh()
    if (!this.mesh) return
    this.mesh.position.z = this.layer * 0.01
    this.syncQuad()
    this.entity.node.add(this.mesh)
  }

  private buildMesh(): void {
    const material = new THREE.MeshBasicMaterial({ color: this.color, transparent: true })
    if (this.texture) {
      // Its own clone of the cached base (game.assets, ADR 0019): filters
      // are per clone, colour space comes with the base, and the image lands
      // on the Source every clone of this URL shares.
      const { texture, settled } = this.game.assets.texture(this.texture)
      if (this.pixelArt) {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
      }
      material.map = texture
      material.color.set(0xffffff)
      reportRejection(settled.then((outcome) => {
        if (outcome === 'failed') this.dropFailedTexture(texture)
      }), 'sprite texture settle')
    }
    this.mesh = new THREE.Mesh(this.createGeometry(), material)
  }

  /**
   * One instance in the batch of this sprite's key, tinted like the material
   * the per-sprite path would build: white over a texture, `color` without.
   */
  private joinBatch(batches: SpriteBatches): void {
    const key: SpriteBatchKey = { texture: this.texture || null, pixelArt: this.pixelArt, shape: this._shape }
    const instance = batches.attach(key)
    instance.color.setHex(this.texture ? 0xffffff : this.color)
    this.mesh = instance.anchor
    const settled = batches.settled(key)
    if (!settled) return
    reportRejection(settled.then((outcome) => {
      // CA-4's failure rule, copy-on-write: only this sprite leaves the
      // shared entry, for the untextured one of its shape, with its color.
      if (outcome !== 'failed' || spriteInstanceOf(this.mesh) !== instance) return
      instance.moveTo({ ...instance.key, texture: null })
      instance.color.setHex(this.color)
    }), 'sprite texture settle')
  }

  override onDestroy(): void {
    const instance = spriteInstanceOf(this.mesh)
    if (instance) {
      instance.release()
      this.mesh = undefined
      return
    }
    this.mesh?.removeFromParent()
    this.mesh?.geometry.dispose()
    // Only this sprite's clone: the cached base lives with the Game.
    this.mesh?.material.map?.dispose()
    this.mesh?.material.dispose()
    this.mesh = undefined
  }

  /**
   * CA-4's failure rule: an image that never arrives leaves the flat
   * `color`, not a white quad over an empty map. Skipped once the sprite
   * was destroyed or the clone is no longer this material's map.
   */
  private dropFailedTexture(texture: THREE.Texture): void {
    const material = this.mesh?.material
    if (!material || material.map !== texture) return
    material.map = null
    texture.dispose()
    material.color.setHex(this.color)
    material.needsUpdate = true
  }

  private syncQuad(): void {
    if (!this.mesh) return
    const placement = spritePlacement({
      width: this.width,
      height: this.height,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      anchorX: this.anchorX,
      anchorY: this.anchorY,
      flipX: false,
      frameScaleX: 1,
      frameScaleY: 1,
    })
    this.mesh.position.x = placement.x
    this.mesh.position.y = placement.y
    this.mesh.scale.set(placement.scaleX, placement.scaleY, 1)
  }

  private createGeometry(): THREE.BufferGeometry {
    return this._shape === 'circle'
      ? new THREE.CircleGeometry(0.5, 32)
      : new THREE.PlaneGeometry(1, 1)
  }
}
