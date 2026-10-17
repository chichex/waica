import * as THREE from 'three/webgpu'
import { PointLight } from './components/point-light.js'
import { Sun } from './components/sun.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { ProjectionIssue } from './runtime-inspection.js'
import type { Vec3Json } from './scene-camera-3d.js'
import type { AmbientLight, PostEffectsState } from './scene-render-options.js'
import type { LightShadowOverrides, ResolvedLightShadow, ResolvedSceneShadows } from './scene-shadows.js'

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

/** Effective shadow configuration, independent of GPU allocation, with the light's nullable authoring overrides. */
export interface RuntimeSnapshotLightShadows extends ResolvedLightShadow {
  requested: Required<LightShadowOverrides>
}

/** One live Sun in a 3D scene (issue #154 CA-16): its entity's name and id, the unit direction it shines along, color and intensity. */
export interface RuntimeSnapshotSun {
  entity: string
  id: string
  direction: Vec3Json
  /** `#rrggbb`. */
  color: string
  intensity: number
  shadows: RuntimeSnapshotLightShadows
}

/** One live Point Light in a 3D scene (issue #154 CA-16): its world position and look; `distance` 0 is unlimited. */
export interface RuntimeSnapshotPointLight {
  entity: string
  id: string
  position: Vec3Json
  /** `#rrggbb`. */
  color: string
  intensity: number
  distance: number
  shadows: RuntimeSnapshotLightShadows
}

/**
 * `game.lighting` (issue #78 CA-12): the Ambient Light now and every live
 * Light, in logical coordinates. A 3D scene (issue #154 CA-16) adds its
 * Suns, Point Lights and shadow policy; a 2D scene's snapshot has none of these keys.
 */
export interface RuntimeSnapshotLighting {
  ambient: AmbientLight
  lights: RuntimeSnapshotLight[]
  sun?: RuntimeSnapshotSun[]
  pointLights?: RuntimeSnapshotPointLight[]
  shadows?: ResolvedSceneShadows
}

/** `game.post` (issue #78 CA-12): each Post Effect, null when off. */
export type RuntimeSnapshotPost = PostEffectsState

const hex = (channel: number): string => Math.round(channel * 255).toString(16).padStart(2, '0')

const rounded = (value: number): number => Math.round(value * 1e6) / 1e6 || 0

const hexOf = (color: number): string => `#${(color & 0xffffff).toString(16).padStart(6, '0')}`

function unit(direction: Vec3Json): Vec3Json {
  const [x, y, z] = new THREE.Vector3(...direction).normalize().toArray()
  return [rounded(x), rounded(y), rounded(z)]
}

function lightShadowsSnapshot(game: Game, light: Sun | PointLight): RuntimeSnapshotLightShadows {
  return {
    ...game.shadows.resolve(light),
    requested: {
      castShadows: light.castShadows,
      shadowMapSize: light.shadowMapSize,
      shadowMaxDistance: light.shadowMaxDistance,
      shadowBias: light.shadowBias,
      shadowNormalBias: light.shadowNormalBias,
      shadowRadius: light.shadowRadius,
    },
  }
}

/** The Suns and Point Lights of a 3D scene's entities, in spawn order, and its shadow policy. */
function lights3dSnapshot(game: Game, idFor: (entity: Entity) => string): Required<Pick<RuntimeSnapshotLighting, 'sun' | 'pointLights' | 'shadows'>> {
  const sun: RuntimeSnapshotSun[] = []
  const pointLights: RuntimeSnapshotPointLight[] = []
  for (const entity of game.entities) {
    for (const component of entity.components) {
      if (component instanceof Sun) {
        const { direction, color, intensity } = component
        sun.push({
          entity: entity.name, id: idFor(entity), direction: unit(direction), color: hexOf(color), intensity,
          shadows: lightShadowsSnapshot(game, component),
        })
      } else if (component instanceof PointLight && component.light) {
        const { color, intensity, distance, light } = component
        light.updateWorldMatrix(true, false)
        const at = light.getWorldPosition(new THREE.Vector3())
        const position: Vec3Json = [rounded(at.x), rounded(at.y), rounded(at.z)]
        pointLights.push({
          entity: entity.name, id: idFor(entity), position, color: hexOf(color), intensity, distance,
          shadows: lightShadowsSnapshot(game, component),
        })
      }
    }
  }
  const { quality, maxDistance } = game.shadows.policy
  return { sun, pointLights, shadows: { quality, maxDistance } }
}

export function lightingSnapshot(game: Game, idFor: (entity: Entity) => string): RuntimeSnapshotLighting {
  return {
    ...(game.space === '3d' ? lights3dSnapshot(game, idFor) : {}),
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
