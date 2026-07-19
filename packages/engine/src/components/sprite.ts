import * as THREE from 'three'
import { Component } from '../component'

const loader = new THREE.TextureLoader()

/**
 * Quad texturado o de color plano. En el pipeline unificado, un sprite 2D
 * es un plano frente a la cámara ortográfica (ver DESIGN.md §6, decisión 2).
 */
export class Sprite extends Component {
  static override componentName = 'Sprite'
  // Sin params en el inspector por ahora: el mesh se crea en onReady y
  // cambiar width/height en vivo no lo reconstruiría. TODO(H1): props reactivas.

  width = 1
  height = 1
  color: number = 0xffffff
  /** URL de textura opcional; con pixelArt activado filtra en nearest. */
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
