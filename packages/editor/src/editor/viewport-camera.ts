// The edit viewport's two camera kinds (ADR 0027, ADR 0030): a 2D scene is
// framed by an orthographic camera the editor pans and zooms; a 3D scene is
// seen through the Editor Camera, which orbits, pans and zooms on its own.
import { isPerspectiveCamera, resolveSceneSpace, type Game, type GameCamera, type SceneJson, type THREE } from '@waica/engine'

/** The orthographic camera of a 2D scene's frame, or null when the live camera is perspective. */
export function orthographicCamera(camera: GameCamera): THREE.OrthographicCamera | null {
  return isPerspectiveCamera(camera) ? null : camera
}

/**
 * True when the Game draws a 3D scene: the 2D edit view (its pan and zoom,
 * gestures, overlays and drop) does not apply; the 3D one does (ADR 0030).
 */
export function isThreeDView(game: Game): boolean {
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
