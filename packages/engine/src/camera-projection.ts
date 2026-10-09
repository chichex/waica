import * as THREE from 'three/webgpu'
import type { PointerCamera } from './pointer.js'

/**
 * What the Game's views read: the orthographic camera's frame (a duck-typed
 * `THREE.OrthographicCamera`, which tests and the Pointer rely on) or the
 * perspective camera of a 3D scene.
 */
export type ViewCamera = PointerCamera | THREE.PerspectiveCamera

/** The scene camera the Game draws with: one per loaded scene, by its space. */
export type GameCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera

/** A point in the scene's world; `z` only matters under a perspective camera. */
export interface WorldPoint {
  x: number
  y: number
  z?: number
}

/** A position inside the game viewport: 0..1 across (left to right) and 0..1 down (top to bottom). */
export interface NormalizedPoint {
  nx: number
  ny: number
}

export function isPerspectiveCamera(camera: ViewCamera): camera is THREE.PerspectiveCamera {
  return 'isPerspectiveCamera' in camera && camera.isPerspectiveCamera === true
}

const scratch = new THREE.Vector3()

function projectPerspective(camera: THREE.PerspectiveCamera, point: WorldPoint): NormalizedPoint | null {
  camera.updateMatrixWorld()
  scratch.set(point.x, point.y, point.z ?? 0).applyMatrix4(camera.matrixWorldInverse)
  // The camera looks down its own -Z: at or past the near plane there is nothing to draw.
  if (scratch.z >= -camera.near) return null
  scratch.applyMatrix4(camera.projectionMatrix)
  return { nx: (scratch.x + 1) / 2, ny: (1 - scratch.y) / 2 }
}

/**
 * The one world→view projection (CA-6): where `point` falls in the game
 * viewport, as fractions of its width and height. Under the orthographic
 * camera this is the formula the Pointer's screen→world mapping inverts,
 * and `z` (draw order there) is ignored; under a perspective camera it is the
 * camera's projection, `null` when the point is not in front of it.
 */
export function worldToNormalized(camera: ViewCamera, point: WorldPoint): NormalizedPoint | null {
  if (isPerspectiveCamera(camera)) return projectPerspective(camera, point)
  return {
    nx: (point.x - (camera.position.x + camera.left)) / (camera.right - camera.left),
    ny: (camera.position.y + camera.top - point.y) / (camera.top - camera.bottom),
  }
}

/**
 * CSS px per world unit at the game viewport's height. Orthographic: the
 * same everywhere. Perspective: at the depth of the world origin (the ground
 * a scene is built around), where a unit of an Anchored Piece's CSS reads as
 * a unit of world (its distance from the camera, front or back); nearer
 * things look bigger, as the camera draws them.
 */
export function pixelsPerUnit(camera: ViewCamera, viewportHeight: number): number {
  if (!isPerspectiveCamera(camera)) return viewportHeight / (camera.top - camera.bottom)
  camera.updateMatrixWorld()
  // Absolute: a camera aimed away from the origin still measures how far the ground is, not the near plane.
  const depth = Math.max(camera.near, Math.abs(scratch.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse).z))
  return viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * depth)
}
