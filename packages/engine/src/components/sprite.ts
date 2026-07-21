import * as THREE from 'three'
import { Component } from '../component'

const loader = new THREE.TextureLoader()

/**
 * Textured or flat-color quad. In the unified pipeline, a 2D sprite is a
 * plane in front of the orthographic camera (see DESIGN.md §6, decision 2).
 */
export class Sprite extends Component {
  static override componentName = 'Sprite'
  // width/height are reactive: assigning them rescales the unit quad, even
  // outside the simulation loop (the editor drags them live). texture and
  // color still need a rebuild. TODO(H1): fully reactive props.

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

  color: number = 0xffffff
  /** Optional texture URL; with pixelArt on it filters in nearest. */
  texture?: string
  pixelArt = false
  layer = 0

  private mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

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
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    this.mesh.scale.set(this._width, this._height, 1)
    this.mesh.position.z = this.layer * 0.01
    this.entity.node.add(this.mesh)
  }

  override onDestroy(): void {
    this.mesh?.removeFromParent()
    this.mesh?.geometry.dispose()
    this.mesh?.material.dispose()
  }
}
