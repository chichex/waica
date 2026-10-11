import { isFiniteNumber, type SceneFieldIssue, type Vec3Json } from './scene-camera-3d.js'
import type { SceneSpace } from './scene-space.js'

/**
 * A 3D scene's `simulation` block (issue #159): the physics world's settings.
 * Absent, or with `gravity` absent, the world pulls along -y at 9.81.
 */
export interface SceneSimulationJson {
  /** The world's gravity vector in units per second squared. Default `[0, -9.81, 0]`. */
  gravity?: Vec3Json
}

export interface ResolvedSceneSimulation {
  gravity: Vec3Json
}

export const DEFAULT_GRAVITY: Readonly<Vec3Json> = [0, -9.81, 0]

function isVec3(value: unknown): value is Vec3Json {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
}

/** The simulation a scene runs with: its `simulation` block, defaults filling the rest. A malformed gravity reads as the default (`validate_project` reports it). */
export function resolveSceneSimulation(json: SceneSimulationJson | undefined): ResolvedSceneSimulation {
  const gravity = json?.gravity
  return { gravity: isVec3(gravity) ? [...gravity] : [...DEFAULT_GRAVITY] }
}

/**
 * Every invalid field of a scene's `simulation` block: a gravity that is not
 * three finite numbers in a 3d scene, and any block at all in a 2d one, where
 * nothing simulates.
 */
export function sceneSimulationIssues(simulation: unknown, space: SceneSpace): SceneFieldIssue[] {
  if (simulation === undefined) return []
  if (space === '2d') {
    return [{ field: 'simulation', message: `A simulation block needs render.space '3d'; this scene is 2d, where nothing simulates.` }]
  }
  if (typeof simulation !== 'object' || simulation === null || Array.isArray(simulation)) {
    return [{ field: 'simulation', message: `simulation must be an object; got ${JSON.stringify(simulation)}.` }]
  }
  const gravity: unknown = Reflect.get(simulation, 'gravity')
  if (gravity === undefined || isVec3(gravity)) return []
  return [{ field: 'simulation.gravity', message: `simulation.gravity must be three finite numbers [x, y, z]; got ${JSON.stringify(gravity)}.` }]
}
