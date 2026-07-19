import * as THREE from 'three'
import { Component } from '../component'

const loader = new THREE.TextureLoader()

/**
 * Textured or flat-color quad. In the unified pipeline, a 2D sprite is a
 * plane in front of the orthographic camera (see DESIGN.md §6, decision 2).
 */
export class Sprite extends Component {
  static override componentName = 'Sprite'
  // No inspector params for now: the mesh is built in onReady and changing
  // width/height live wouldn't rebuild it. TODO(H1): reactive props.

  width = 1
  height = 1
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
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height), material)
    this.mesh.position.z = this.layer * 0.01
    this.entity.node.add(this.mesh)
  }

  override onDestroy(): void {
    this.mesh?.removeFromParent()
    this.mesh?.geometry.dispose()
    this.mesh?.material.dispose()
  }
}
