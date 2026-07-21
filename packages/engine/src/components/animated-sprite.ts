import * as THREE from 'three'
import { Component } from '../component'
import { ClipPlayer, type ClipDef } from '../animation/clip-player'

const loader = new THREE.TextureLoader()

/**
 * Sprite animated from a grid spritesheet. Each instance clones the
 * texture to animate its UVs independently.
 */
export class AnimatedSprite extends Component {
  static override componentName = 'AnimatedSprite'

  /** Spritesheet URL. */
  texture = ''
  /** Sheet grid dimensions. */
  cols = 1
  rows = 1
  // Size in world units. Reactive like Sprite's: assigning rescales the unit
  // quad, even outside the simulation loop (the editor drags them live).
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
  pixelArt = true
  layer = 0
  clips: Record<string, ClipDef> = {}
  initialClip?: string

  /** Clip currently playing. */
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
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    this.mesh.scale.set(this._width, this._height, 1)
    this.mesh.position.z = this.layer * 0.01
    this.entity.node.add(this.mesh)
    if (this.initialClip) this.play(this.initialClip)
  }

  /** Switches clip; repeating the same name doesn't restart the animation. */
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
