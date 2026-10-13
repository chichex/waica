// The Editor Camera (issue #173, ADR 0030): the editor's own perspective
// camera over a 3D scene, which the Game draws, picks and projects through
// while editing (CameraRig.setViewCamera). It starts as the scene camera and
// moves only by navigation, never writing the scene's `camera` block.
// Navigation is three's OrbitControls, damping off so a drag ends where it
// stops: middle or Alt+left orbits, right or Shift+middle pans, the wheel
// zooms, and a plain left button is left to picking and the gizmo.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { resolvePerspectiveCamera, THREE, type SceneCameraJson } from '@waica/engine'
import type { CameraPose } from './workspace'

/** One keyboard step (issue #173 inference 12). */
const ORBIT_STEP = THREE.MathUtils.degToRad(5)
const PAN_STEP = 0.5
/** A frame never comes closer than this to what it frames. */
const MIN_FRAME_RADIUS = 0.5

const vectorOf = (point: THREE.Vector3): [number, number, number] => [point.x, point.y, point.z]

export class EditorCamera {
  readonly camera = new THREE.PerspectiveCamera()
  readonly controls: OrbitControls
  private readonly listeners = new Set<(pose: CameraPose) => void>()

  constructor(private readonly element: HTMLElement) {
    // Before OrbitControls listens: Alt arms the left button for the drag it starts.
    element.addEventListener('pointerdown', this.armLeftButton, { capture: true })
    this.controls = new OrbitControls(this.camera, element)
    this.controls.enableDamping = false
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }
    this.controls.addEventListener('end', this.emit)
  }

  /** Copies the scene camera's lens (fov, near, far) and pose (position, target). */
  adoptSceneCamera(json: SceneCameraJson | undefined): void {
    const scene = resolvePerspectiveCamera(json?.kind === 'perspective' ? json : undefined)
    this.camera.fov = scene.fov
    this.camera.near = scene.near
    this.camera.far = scene.far
    this.camera.updateProjectionMatrix()
    this.setPose({ position: scene.position, target: scene.target })
  }

  /** Where the camera sits and the point it orbits. */
  get pose(): CameraPose {
    return { position: vectorOf(this.camera.position), target: vectorOf(this.controls.target) }
  }

  setPose(pose: CameraPose): void {
    this.camera.position.set(...pose.position)
    this.controls.target.set(...pose.target)
    this.controls.update()
    this.emit()
  }

  /** Orbits by 5° steps around the target: a positive yaw moves the camera to its right, a positive pitch up. */
  orbit(yawSteps: number, pitchSteps: number): void {
    this.controls.rotateLeft(-yawSteps * ORBIT_STEP)
    this.controls.rotateUp(pitchSteps * ORBIT_STEP)
    this.emit()
  }

  /** Pans camera and target together by 0.5-unit steps, along the view's right and up. */
  pan(rightSteps: number, upSteps: number): void {
    this.camera.updateMatrix()
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0).multiplyScalar(rightSteps * PAN_STEP)
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1).multiplyScalar(upSteps * PAN_STEP)
    const offset = right.add(up)
    this.move(this.camera.position.clone().add(offset), this.controls.target.clone().add(offset))
  }

  /** Scales the distance to the target by `factor`: below 1 comes closer. */
  zoom(factor: number): void {
    const target = this.controls.target.clone()
    const offset = this.camera.position.clone().sub(target).multiplyScalar(factor)
    this.move(target.clone().add(offset), target)
  }

  /** Aims at the center of `bounds` from as far as fits their bounding sphere in the vertical fov, keeping the view direction. */
  frame(bounds: THREE.Box3): void {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, MIN_FRAME_RADIUS)
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    const direction = this.camera.position.clone().sub(this.controls.target).normalize()
    this.move(sphere.center.clone().addScaledVector(direction, distance), sphere.center)
  }

  /** A client point as fractions of the element the camera navigates on, or null while it has no size. */
  fractionAt(clientX: number, clientY: number): { nx: number; ny: number } | null {
    const rect = this.element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return { nx: (clientX - rect.left) / rect.width, ny: (clientY - rect.top) / rect.height }
  }

  /** `listener` hears every pose the camera settles at: a gesture's end, a step, a frame, a reset. */
  onPoseChange(listener: (pose: CameraPose) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.armLeftButton, { capture: true })
    this.controls.removeEventListener('end', this.emit)
    this.controls.dispose()
    this.listeners.clear()
  }

  private move(position: THREE.Vector3, target: THREE.Vector3): void {
    this.setPose({ position: vectorOf(position), target: vectorOf(target) })
  }

  private readonly armLeftButton = (event: PointerEvent): void => {
    this.controls.mouseButtons.LEFT = event.altKey ? THREE.MOUSE.ROTATE : null
  }

  private readonly emit = (): void => {
    const pose = this.pose
    for (const listener of this.listeners) listener(pose)
  }
}
