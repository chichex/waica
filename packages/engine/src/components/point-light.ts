import * as THREE from 'three/webgpu'
import { Component, type ParamSpec } from '../component.js'

/**
 * A point light in a 3D scene (ADR 0027, `CONTEXT.md` Point Light): it shines
 * in every direction from the entity's position plus an offset (in the
 * entity's local frame: it turns and scales with the entity, so a lantern's
 * offset follows the object it hangs on), reaching
 * `distance` world units (0 = without limit) and fading with `decay` (2 is
 * physical). Not the 2D `Light`, which paints a light-map. No shadows. In a
 * 2D scene it creates nothing; the three light lives under the entity's node
 * and leaves with it.
 */
export class PointLight extends Component {
  static override componentName = 'PointLight'
  static override space = '3d' as const
  static override displayName = 'Point light (3D)'
  static override params = {
    color: { label: 'Color', kind: 'color' },
    intensity: { label: 'Intensity', min: 0, step: 0.5 },
    distance: { label: 'Distance (0 = unlimited)', min: 0, step: 0.5 },
    decay: { label: 'Decay', min: 0, step: 0.1 },
    offsetX: { label: 'x offset' },
    offsetY: { label: 'y offset' },
    offsetZ: { label: 'z offset' },
  } satisfies Record<string, ParamSpec>
  static override transient = ['light']

  /** The three light, null in a 2D scene or before the component is ready. */
  light: THREE.PointLight | null = null

  private _color = 0xffffff
  private _intensity = 1
  private _distance = 0
  private _decay = 2
  private _offsetX = 0
  private _offsetY = 0
  private _offsetZ = 0

  get color(): number {
    return this._color
  }
  set color(value: number) {
    this._color = value
    this.light?.color.setHex(value)
  }

  get intensity(): number {
    return this._intensity
  }
  set intensity(value: number) {
    this._intensity = value
    if (this.light) this.light.intensity = value
  }

  /** World units the light reaches; 0 reaches without limit. */
  get distance(): number {
    return this._distance
  }
  set distance(value: number) {
    this._distance = value
    if (this.light) this.light.distance = value
  }

  get decay(): number {
    return this._decay
  }
  set decay(value: number) {
    this._decay = value
    if (this.light) this.light.decay = value
  }

  get offsetX(): number {
    return this._offsetX
  }
  set offsetX(value: number) {
    this._offsetX = value
    this.place()
  }

  get offsetY(): number {
    return this._offsetY
  }
  set offsetY(value: number) {
    this._offsetY = value
    this.place()
  }

  get offsetZ(): number {
    return this._offsetZ
  }
  set offsetZ(value: number) {
    this._offsetZ = value
    this.place()
  }

  override onReady(): void {
    if (this.game.space !== '3d') return
    this.light = new THREE.PointLight(this._color, this._intensity, this._distance, this._decay)
    this.entity.node.add(this.light)
    this.place()
  }

  override onDestroy(): void {
    this.light?.removeFromParent()
  }

  private place(): void {
    this.light?.position.set(this._offsetX, this._offsetY, this._offsetZ)
  }
}
