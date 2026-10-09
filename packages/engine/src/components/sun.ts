import * as THREE from 'three/webgpu'
import { Component, type ParamSpec } from '../component.js'
import type { Vec3Json } from '../scene-camera-3d.js'

const DEFAULT_DIRECTION: Vec3Json = [-1, -2, -1]

/** Scene JSON is untyped at runtime: only an array of three finite numbers, not all zero, aims a light. */
const finiteDirection = (value: unknown): value is Vec3Json =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) && value.some((component) => component !== 0)

/**
 * The 3D scene's sunlight (ADR 0027, `CONTEXT.md` Sun): a directional light
 * that shines along `direction`, in world space — where its entity stands, or
 * how it is rotated, does not matter. Color is `0xrrggbb`; no shadows. A Sun
 * in a 2D scene creates nothing. The three light lives in the Game's scene,
 * moves with its props, and leaves with the entity.
 */
export class Sun extends Component {
  static override componentName = 'Sun'
  static override space = '3d' as const
  static override params = {
    direction: { label: 'Direction', kind: 'vector3' },
    color: { label: 'Color', kind: 'color' },
    intensity: { label: 'Intensity', min: 0, step: 0.1 },
  } satisfies Record<string, ParamSpec>
  static override transient = ['light']

  /** The three light, null in a 2D scene or before the component is ready. */
  light: THREE.DirectionalLight | null = null

  private _direction: Vec3Json = [...DEFAULT_DIRECTION]
  private _color = 0xffffff
  private _intensity = 1

  /** Where the light travels, as a world-space vector `[x, y, z]`; any length but zero. */
  get direction(): Vec3Json {
    return [...this._direction]
  }
  set direction(value: Vec3Json) {
    // A zero or unreadable direction keeps the last good one: there is nothing to aim along.
    if (!finiteDirection(value)) return
    this._direction = [...value]
    this.aim()
  }

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

  override onReady(): void {
    if (this.game.space !== '3d') return
    const light = new THREE.DirectionalLight(this._color, this._intensity)
    this.light = light
    // The target joins the scene too, or three never updates its world matrix.
    this.game.scene.add(light, light.target)
    this.aim()
  }

  override onDestroy(): void {
    this.light?.removeFromParent()
    this.light?.target.removeFromParent()
  }

  /** Puts the light on the opposite side of the origin from where it travels, targeting the origin. */
  private aim(): void {
    if (!this.light) return
    const [x, y, z] = this._direction
    this.light.position.set(-x, -y, -z).normalize()
    this.light.target.position.set(0, 0, 0)
  }
}
