import * as THREE from 'three/webgpu'
import type { ComponentSpace, ParamSpec } from '../component.js'
import type { Vec3Json } from '../scene-camera-3d.js'
import { ShadowLight } from './shadow-light.js'

const DEFAULT_DIRECTION: Vec3Json = [0, -1, 0]
const MIN_ANGLE = 1
const MAX_ANGLE = 89

/** Scene JSON is untyped at runtime: only an array of three finite numbers, not all zero, aims a light. */
const finiteDirection = (value: unknown): value is Vec3Json =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) && value.some((component) => component !== 0)

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/**
 * A spot light in a 3D scene (ADR 0027, `CONTEXT.md` Spot Light): a cone of
 * light from the entity's position plus an offset, shining along `direction`
 * — both in the entity's local frame, so the cone moves, turns and scales
 * with its entity. `angle` is the cone's half-angle in degrees (1..89) and
 * `penumbra` softens its edge (0..1) without widening it; `distance` and
 * `decay` work as on a Point Light. Its shadows have an independent finite
 * range along the cone's axis without shortening illumination. In a 2D scene
 * it creates nothing; the three light and its target live under the entity's
 * node and leave with it.
 */
export class SpotLight extends ShadowLight {
  static override componentName = 'SpotLight'
  static override space: ComponentSpace = '3d'
  static override displayName = 'Spot light (3D)'
  static override params = {
    color: { label: 'Color', kind: 'color' },
    intensity: { label: 'Intensity', min: 0, step: 0.5 },
    distance: { label: 'Distance (0 = unlimited)', min: 0, step: 0.5 },
    decay: { label: 'Decay', min: 0, step: 0.1 },
    angle: { label: 'Angle (degrees)', min: MIN_ANGLE, max: MAX_ANGLE, step: 1 },
    penumbra: { label: 'Penumbra', min: 0, max: 1, step: 0.05 },
    direction: { label: 'Direction', kind: 'vector3' },
    offsetX: { label: 'x offset' },
    offsetY: { label: 'y offset' },
    offsetZ: { label: 'z offset' },
    ...ShadowLight.params,
  } satisfies Record<string, ParamSpec>
  static override transient = ['light']

  /** The three light, null in a 2D scene or before the component is ready. */
  light: THREE.SpotLight | null = null

  private _color = 0xffffff
  private _intensity = 1
  private _distance = 0
  private _decay = 2
  private _angle = 30
  private _penumbra = 0.2
  private _direction: Vec3Json = [...DEFAULT_DIRECTION]
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

  /** The cone's half-angle in degrees, clamped to 1..89; an unreadable value keeps the last one. */
  get angle(): number {
    return this._angle
  }
  set angle(value: number) {
    if (!Number.isFinite(value)) return
    this._angle = clamp(value, MIN_ANGLE, MAX_ANGLE)
    if (this.light) this.light.angle = THREE.MathUtils.degToRad(this._angle)
  }

  /** How much of the cone's edge fades out, clamped to 0..1; an unreadable value keeps the last one. */
  get penumbra(): number {
    return this._penumbra
  }
  set penumbra(value: number) {
    if (!Number.isFinite(value)) return
    this._penumbra = clamp(value, 0, 1)
    if (this.light) this.light.penumbra = this._penumbra
  }

  /** Where the cone points, as a vector `[x, y, z]` in the entity's local frame; any length but zero. */
  get direction(): Vec3Json {
    return [...this._direction]
  }
  set direction(value: Vec3Json) {
    // A zero or unreadable direction keeps the last good one: there is nothing to aim along.
    if (!finiteDirection(value)) return
    this._direction = [...value]
    this.place()
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
    const angle = THREE.MathUtils.degToRad(this._angle)
    const light = new THREE.SpotLight(this._color, this._intensity, this._distance, angle, this._penumbra, this._decay)
    this.light = light
    // The target hangs from the entity too, so the cone turns with it and three updates its world matrix.
    this.entity.node.add(light, light.target)
    this.place()
  }

  override onDestroy(): void {
    this.game.shadows.remove(this)
    this.light?.removeFromParent()
    this.light?.target.removeFromParent()
  }

  /** Puts the light at its offset and its target one unit further along the local direction. */
  private place(): void {
    if (!this.light) return
    const [x, y, z] = this._direction
    this.light.position.set(this._offsetX, this._offsetY, this._offsetZ)
    this.light.target.position.set(this._offsetX + x, this._offsetY + y, this._offsetZ + z)
  }
}
