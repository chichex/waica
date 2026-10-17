import * as THREE from 'three/webgpu'
import type { ResolvedLightShadow } from './scene-shadows.js'

interface SunShadowFit {
  readonly light: THREE.DirectionalLight
  readonly camera: THREE.PerspectiveCamera
  readonly settings: Readonly<ResolvedLightShadow>
  readonly direction: readonly [number, number, number]
}

function receiverSphere(camera: THREE.PerspectiveCamera, far: number): THREE.Sphere {
  const points: THREE.Vector3[] = []
  const nearNdc = camera.reversedDepth ? 1 : camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 0 : -1
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      const nearPoint = new THREE.Vector3(x, y, nearNdc).applyMatrix4(camera.projectionMatrixInverse)
      points.push(nearPoint, nearPoint.clone().multiplyScalar(far / -nearPoint.z))
    }
  }
  const center = new THREE.Vector3()
  for (const point of points) center.add(point)
  center.multiplyScalar(1 / points.length)
  // Transform offsets, not world positions: translation cannot perturb extent.
  // Unlike Sphere.applyMatrix4, this also bounds sheared camera hierarchies.
  const linear = new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)
  const radius = Math.sqrt(Math.max(...points.map((point) => point.clone().sub(center).applyMatrix3(linear).lengthSq())))
  return new THREE.Sphere(center.applyMatrix4(camera.matrixWorld), radius)
}

function snapCenter(sphere: THREE.Sphere, orientation: THREE.Matrix4, texelSize: number): void {
  const center = sphere.center.clone().applyMatrix4(orientation.clone().invert())
  center.x = Math.round(center.x / texelSize) * texelSize
  center.y = Math.round(center.y / texelSize) * texelSize
  sphere.center.copy(center.applyMatrix4(orientation))
}

function placeInWorld(object: THREE.Object3D, position: THREE.Vector3): void {
  object.position.copy(position)
  if (object.parent) object.position.applyMatrix4(object.parent.matrixWorld.clone().invert())
  object.updateMatrixWorld()
}

/**
 * Fits the active view's bounded receiver volume without changing its camera.
 * The caller supplies current view matrices and owns shadow resources/passes.
 * False leaves the previous fit intact; it must not be rendered as coverage.
 */
export function fitSunShadow({ light, camera, settings, direction }: SunShadowFit): boolean {
  const far = Math.min(camera.far, settings.maxDistance)
  if (!settings.enabled || !Number.isFinite(camera.near) || camera.near <= 0 || !(far > camera.near)) return false
  light.shadow.mapSize.set(settings.mapSize, settings.mapSize)
  const sphere = receiverSphere(camera, far)
  // One full texel survives the worst-case half-texel center snap.
  sphere.radius /= 1 - 3 / settings.mapSize
  const travel = new THREE.Vector3(...direction).normalize()
  const shadowCamera = light.shadow.camera
  // Avoid three's parallel-up fallback, which perturbs the light direction.
  shadowCamera.up.set(0, Math.abs(travel.y) > 0.99 ? 0 : 1, Math.abs(travel.y) > 0.99 ? 1 : 0)
  const orientation = new THREE.Matrix4().lookAt(new THREE.Vector3(), travel, shadowCamera.up)
  snapCenter(sphere, orientation, 2 * sphere.radius / settings.mapSize)
  shadowCamera.left = shadowCamera.bottom = -sphere.radius
  shadowCamera.right = shadowCamera.top = sphere.radius
  shadowCamera.near = 0.1
  shadowCamera.far = 2 * sphere.radius + settings.maxDistance + shadowCamera.near
  placeInWorld(light.target, sphere.center)
  placeInWorld(light, sphere.center.clone().addScaledVector(travel, -sphere.radius - settings.maxDistance - shadowCamera.near))
  shadowCamera.updateProjectionMatrix()
  light.shadow.updateMatrices(light)
  return true
}
