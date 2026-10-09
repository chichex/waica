import * as THREE from 'three/webgpu'
import type { SceneSpace } from './scene-space.js'
import type { AmbientLight } from './scene-render-options.js'

/**
 * The Ambient Light of a 3D scene (ADR 0027): one `THREE.AmbientLight` the
 * Game owns, fed by `game.lighting.ambient` (`render.lighting.ambient` and the
 * runtime setter), color × intensity, full white when nothing says otherwise.
 * It exists only while the live scene is 3D; a 2D scene lights through the
 * light-map instead (ADR 0026).
 */
export class SceneAmbientLight3d {
  private light: THREE.AmbientLight | null = null

  constructor(private readonly scene: THREE.Scene) {}

  /** Adds, updates or removes the light for the live scene's space; called once per frame before it is drawn. */
  sync(space: SceneSpace, ambient: AmbientLight): void {
    if (space !== '3d') {
      this.light?.removeFromParent()
      return
    }
    this.light ??= new THREE.AmbientLight()
    if (this.light.parent !== this.scene) this.scene.add(this.light)
    this.light.color.set(ambient.color)
    this.light.intensity = ambient.intensity
  }
}
