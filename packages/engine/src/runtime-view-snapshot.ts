import * as THREE from 'three/webgpu'
import type { Game } from './game.js'
import type { Vec3Json } from './scene-camera-3d.js'

/**
 * The view the scene is drawn from (issue #154 CA-16), beside the Camera
 * Effects `camera`: the orthographic camera's centre and visible height, or
 * the perspective camera's pose. Always reflects the live camera.
 */
export type RuntimeSnapshotView =
  | { kind: 'orthographic'; position: [number, number]; zoom: number }
  | { kind: 'perspective'; position: Vec3Json; target: Vec3Json; fov: number }

/** Float noise off a pose, so a camera that did not move reports the numbers it was declared with. */
const clean = (value: number): number => Math.round(value * 1e6) / 1e6 || 0

function vector(value: THREE.Vector3): Vec3Json {
  return [clean(value.x), clean(value.y), clean(value.z)]
}

export function viewSnapshot(game: Game): RuntimeSnapshotView {
  const camera = game.camera
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return { kind: 'orthographic', position: [clean(camera.position.x), clean(camera.position.y)], zoom: game.view }
  }
  camera.updateMatrixWorld()
  const ahead = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(game.cameraRig.lookDistance)
  return {
    kind: 'perspective',
    position: vector(camera.position),
    target: vector(camera.position.clone().add(ahead)),
    fov: camera.fov,
  }
}
