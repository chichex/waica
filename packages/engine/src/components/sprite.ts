import * as THREE from 'three'
import { Component } from '../component.js'
import type { YSortParticipant } from '../render-sort.js'

const loader = new THREE.TextureLoader()

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
    this.mesh?.scale.set(this._width, this._height, 1)
  }
  get height(): number {
    return this._height
  }
  set height(value: number) {
    this._height = value
    this.mesh?.scale.set(this._width, this._height, 1)
  }

  private _color = 0xffffff
  get color(): number {
    return this._color
  }
  set color(value: number) {
    this._color = value
    this.mesh?.material.color.setHex(value)
  }

  private _offsetX = 0
  private _offsetY = 0
  get offsetX(): number {
    return this._offsetX
  }
  set offsetX(value: number) {
    this._offsetX = value
    if (this.mesh) this.mesh.position.x = value
  }
  get offsetY(): number {
    return this._offsetY
  }
  set offsetY(value: number) {
    this._offsetY = value
    if (this.mesh) this.mesh.position.y = value
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
    this.mesh.geometry.dispose()
    this.mesh.geometry = this.createGeometry()
  }

  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

  override onReady(): void {
    const material = new THREE.MeshBasicMaterial({ color: this.color, transparent: true })
    if (this.texture) {
      const tex = loader.load(this.texture)
      if (this.pixelArt) {
        tex.magFilter = THREE.NearestFilter
        tex.minFilter = THREE.NearestFilter
      }
      tex.colorSpace = THREE.SRGBColorSpace
      material.map = tex
      material.color.set(0xffffff)
    }
    this.mesh = new THREE.Mesh(this.createGeometry(), material)
    this.mesh.scale.set(this._width, this._height, 1)
    this.mesh.position.set(this._offsetX, this._offsetY, this.layer * 0.01)
    this.entity.node.add(this.mesh)
  }

  override onDestroy(): void {
    this.mesh?.removeFromParent()
    this.mesh?.geometry.dispose()
    this.mesh?.material.dispose()
  }

  private createGeometry(): THREE.BufferGeometry {
    return this._shape === 'circle'
      ? new THREE.CircleGeometry(0.5, 32)
      : new THREE.PlaneGeometry(1, 1)
  }
}
