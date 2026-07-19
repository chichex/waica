import * as THREE from 'three'
import { Component } from '../component'
import { ClipPlayer, type ClipDef } from '../animation/clip-player'

const loader = new THREE.TextureLoader()

/**
 * Sprite animado por spritesheet en grilla. Cada instancia clona la
 * textura para animar sus UV de forma independiente.
 */
export class AnimatedSprite extends Component {
  static override componentName = 'AnimatedSprite'

  /** URL del spritesheet. */
  texture = ''
  /** Dimensiones de la grilla del sheet. */
  cols = 1
  rows = 1
  /** Tamaño en unidades de mundo. */
  width = 1
  height = 1
  pixelArt = true
  layer = 0
  clips: Record<string, ClipDef> = {}
  initialClip?: string

  /** Clip actualmente en reproducción. */
  current?: string

  private readonly player = new ClipPlayer()
  private tex?: THREE.Texture
  private mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

  override onReady(): void {
    this.tex = loader.load(this.texture)
    this.tex.colorSpace = THREE.SRGBColorSpace
    if (this.pixelArt) {
      this.tex.magFilter = THREE.NearestFilter
      this.tex.minFilter = THREE.NearestFilter
    }
    this.tex.repeat.set(1 / this.cols, 1 / this.rows)
    const material = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height), material)
    this.mesh.position.z = this.layer * 0.01
    this.entity.node.add(this.mesh)
    if (this.initialClip) this.play(this.initialClip)
  }

  /** Cambia de clip; repetir el mismo nombre no reinicia la animación. */
  play(name: string): void {
    if (this.current === name) return
    const clip = this.clips[name]
    if (!clip) return
    this.player.set(clip)
    this.current = name
  }

  override onUpdate(dt: number): void {
    if (!this.tex || !this.current) return
    this.showFrame(this.player.advance(dt))
  }

  override onDestroy(): void {
    this.mesh?.removeFromParent()
    this.mesh?.geometry.dispose()
    this.mesh?.material.dispose()
    this.tex?.dispose()
  }

  private showFrame(index: number): void {
    if (!this.tex) return
    const col = index % this.cols
    const row = Math.floor(index / this.cols)
    this.tex.offset.set(col / this.cols, 1 - (row + 1) / this.rows)
  }
}
