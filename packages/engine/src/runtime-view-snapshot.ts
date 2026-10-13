import * as THREE from 'three/webgpu'
import { isPerspectiveCamera } from './camera-projection.js'
import type { CameraEffectsState } from './camera-effects.js'
import type { Game } from './game.js'
import type { OrbitView } from './orbit-camera.js'
import type { Vec3Json } from './scene-camera-3d.js'

/**
 * The view the scene is drawn from (issue #154 CA-16), beside the Camera
 * Effects `camera`: the orthographic camera's centre and visible height, or
 * the perspective camera's pose. Always reflects the live camera.
 */
export type RuntimeSnapshotView =
  | { kind: 'orthographic'; position: [number, number]; zoom: number }
  | ({ kind: 'perspective'; position: Vec3Json; target: Vec3Json; fov: number } & Partial<OrbitView>)

/** Float noise off a pose, so a camera that did not move reports the numbers it was declared with. */
const clean = (value: number): number => Math.round(value * 1e6) / 1e6 || 0

function vector(value: THREE.Vector3): Vec3Json {
  return [clean(value.x), clean(value.y), clean(value.z)]
}

export function viewSnapshot(game: Game): RuntimeSnapshotView {
  // The scene's own camera: a host's view camera is not part of the simulated game, and `lookDistance` is the scene camera's.
  const camera = game.cameraRig.sceneCamera
  if (!isPerspectiveCamera(camera)) {
    return { kind: 'orthographic', position: [clean(camera.position.x), clean(camera.position.y)], zoom: game.view }
  }
  camera.updateMatrixWorld()
  const ahead = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(game.cameraRig.lookDistance)
  const orbit = game.cameraRig.orbitView
  return {
    kind: 'perspective',
    position: vector(camera.position),
    target: vector(camera.position.clone().add(ahead)),
    fov: camera.fov,
    // A following camera's orbit (issue #181 CA-10): the chosen distance and the placed one.
    ...(orbit && {
      follow: orbit.follow,
      yaw: clean(orbit.yaw),
      pitch: clean(orbit.pitch),
      distance: clean(orbit.distance),
      distanceActual: clean(orbit.distanceActual),
    }),
  }
}

/**
 * `game.cameraEffects.state` as the snapshot reports it: the shake offset
 * applies in both spaces since a perspective camera shakes too (issue #181
 * CA-11, superseding spec decision 24 of issue #154).
 */
export function cameraEffectsSnapshot(game: Game): CameraEffectsState {
  return game.cameraEffects.state
}
