import { isPerspectiveCameraJson, resolveSceneCamera, type ResolvedSceneCamera, type SceneCameraJson } from '@waica/engine'

/**
 * A scene's camera block read as the orthographic camera a 2D scene has. The
 * editor's 2D tools (frame gizmo, zoom, follow target) only run in 2D scenes;
 * a perspective block reads as the defaults there.
 */
export function resolveOrthographicCamera(camera: SceneCameraJson | undefined): ResolvedSceneCamera {
  return resolveSceneCamera(isPerspectiveCameraJson(camera) ? undefined : camera)
}
