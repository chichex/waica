import { Component, type ParamSpec } from '../component.js'
import type { LightField } from '../light-field.js'
import { addLight, removeLight } from '../scene-lighting.js'

const MAX_BANDS = 16

const finiteOr = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback)

/**
 * A source of 2D light owned by its entity (issue #78, `CONTEXT.md` Light):
 * a radius in logical world units — an ellipse on an isometric screen — a
 * color, an intensity, a falloff that is smooth or split into `bands`, and a
 * shadow edge that is hard or `soft`. Solid tiles stop it unless
 * `castShadows` is off. Lights brighten what the Ambient Light leaves dark;
 * they never darken. A live Light makes its scene draw lit.
 */
export class Light extends Component {
  static override componentName = 'Light'
  static override space = '2d' as const
  static override params = {
    radius: { label: 'Radius', min: 0, step: 0.25 },
    color: { label: 'Color', kind: 'color' },
    intensity: { label: 'Intensity', min: 0, step: 0.1 },
    bands: { label: 'Bands (0 = smooth)', min: 0, max: MAX_BANDS, step: 1 },
    softness: { label: 'Shadow softness', min: 0, max: 1, step: 0.05 },
    castShadows: { label: 'Cast shadows' },
    offsetX: { label: 'x offset' },
    offsetY: { label: 'y offset' },
  } satisfies Record<string, ParamSpec>

  /** Logical world units from its centre to where it fades out. */
  radius = 4
  /** `0xrrggbb`, multiplied over the art it reaches. */
  color = 0xffffff
  intensity = 1
  /** 0 = smooth falloff; N = N equal steps (at most 16). */
  bands = 0
  /** 0 = hard shadow edge; up to 1 = the widest penumbra. */
  softness = 0
  /** Off: solid tiles do not stop this light. */
  castShadows = true
  /** Logical offset from the entity's position, like a Solid's. */
  offsetX = 0
  offsetY = 0

  override onReady(): void {
    addLight(this.game.lighting, this)
  }

  override onDestroy(): void {
    removeLight(this.game.lighting, this)
  }

  /** This light as the light-map reads it: logical position, clamped params, color channels in 0..1. */
  field(): LightField {
    const color = Number.isFinite(this.color) ? Math.trunc(this.color) & 0xffffff : 0xffffff
    return {
      x: this.entity.position.x + finiteOr(this.offsetX, 0),
      y: this.entity.position.y + finiteOr(this.offsetY, 0),
      radius: Math.max(0, finiteOr(this.radius, 0)),
      color: [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255],
      intensity: Math.max(0, finiteOr(this.intensity, 0)),
      bands: Math.min(MAX_BANDS, Math.max(0, Math.round(finiteOr(this.bands, 0)))),
      softness: Math.min(1, Math.max(0, finiteOr(this.softness, 0))),
      castShadows: this.castShadows !== false,
    }
  }
}
