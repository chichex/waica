// The edit viewport's two camera kinds (ADR 0027): a 2D scene is framed by an
// orthographic camera the editor pans and zooms; a 3D scene is a read-only
// view through the scene's own perspective camera.
import { isPerspectiveCamera, resolveSceneSpace, type Game, type GameCamera, type SceneJson, type THREE } from '@waica/engine'

/** The orthographic camera of a 2D scene's frame, or null when the live camera is perspective. */
export function orthographicCamera(camera: GameCamera): THREE.OrthographicCamera | null {
  return isPerspectiveCamera(camera) ? null : camera
}

/** True when the Game draws a 3D scene: the editor only looks at it (no gestures, grid or gizmos). */
export function isReadOnlyView(game: Game): boolean {
  return game.space === '3d'
}

/** True for a scene that declares `render.space: '3d'`. */
export function isThreeDScene(scene: SceneJson): boolean {
  return resolveSceneSpace(scene.render) === '3d'
}

/** Width over height of what the live camera shows. */
export function cameraAspect(camera: GameCamera): number {
  if (isPerspectiveCamera(camera)) return camera.aspect
  return (camera.right - camera.left) / (camera.top - camera.bottom)
}
