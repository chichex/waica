import type { Game } from './game.js'
import type { AmbientLight, PostEffectsState } from './scene-render-options.js'

/** One live Light as a Runtime Snapshot reports it: its entity's name, logical position and params. */
export interface RuntimeSnapshotLight {
  entity: string
  x: number
  y: number
  radius: number
  /** `#rrggbb`. */
  color: string
  intensity: number
  bands: number
  softness: number
  castShadows: boolean
}

/** `game.lighting` (issue #78 CA-12): the Ambient Light now and every live Light, in logical coordinates. */
export interface RuntimeSnapshotLighting {
  ambient: AmbientLight
  lights: RuntimeSnapshotLight[]
}

/** `game.post` (issue #78 CA-12): each Post Effect, null when off. */
export type RuntimeSnapshotPost = PostEffectsState

const hex = (channel: number): string => Math.round(channel * 255).toString(16).padStart(2, '0')

export function lightingSnapshot(game: Game): RuntimeSnapshotLighting {
  return {
    ambient: game.lighting.ambient,
    lights: game.lighting.lights.map((light) => {
      const field = light.field()
      const [r, g, b] = field.color
      return {
        entity: light.entity.name,
        x: field.x,
        y: field.y,
        radius: field.radius,
        color: `#${hex(r)}${hex(g)}${hex(b)}`,
        intensity: field.intensity,
        bands: field.bands,
        softness: field.softness,
        castShadows: field.castShadows,
      }
    }),
  }
}

export function postSnapshot(game: Game): RuntimeSnapshotPost {
  return { vignette: game.post.vignette, colorGrade: game.post.colorGrade }
}
