import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { ProjectionIssue } from './runtime-inspection.js'
import type { AmbientLight, PostEffectsState } from './scene-render-options.js'

/** One live Light as a Runtime Snapshot reports it: its entity's name, logical position and params. */
export interface RuntimeSnapshotLight {
  /** The entity's name, as `ui.anchored[].entity` reports it. */
  entity: string
  /** The entity's snapshot id (`entity-N`), unique where names repeat. */
  id: string
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

export function lightingSnapshot(game: Game, idFor: (entity: Entity) => string): RuntimeSnapshotLighting {
  return {
    ambient: game.lighting.ambient,
    lights: game.lighting.lights.map((light) => {
      const field = light.field()
      const [r, g, b] = field.color
      return {
        entity: light.entity.name,
        id: idFor(light.entity),
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

/** What capping the lights needs from a snapshot: its lights and its projection issues. */
interface LightsCappable {
  lighting: RuntimeSnapshotLighting
  projectionIssues: ProjectionIssue[]
}

/**
 * The global cap's last stage, once entities and Anchored Pieces are gone
 * (review): drops lights from the end until the snapshot fits, recording how
 * many went with a `truncated` marker at `lighting.lights[n]`.
 */
export function capLights<T extends LightsCappable>(snapshot: T, fits: (candidate: T) => boolean): T {
  let capped = snapshot
  const retained = [...snapshot.lighting.lights]
  while (retained.length > 0) {
    retained.pop()
    const omitted = snapshot.lighting.lights.length - retained.length
    capped = {
      ...snapshot,
      lighting: { ...snapshot.lighting, lights: [...retained] },
      projectionIssues: [...snapshot.projectionIssues, { path: `lighting.lights[${retained.length}]`, marker: 'truncated', omitted }],
    }
    if (fits(capped)) return capped
  }
  return capped
}
