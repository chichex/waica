// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THREE, type SceneCameraJson } from '@waica/engine'
import { EditorCamera } from './editor-camera'
import type { CameraPose } from './workspace'

const SCENE_CAMERA: SceneCameraJson = { kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0], fov: 60, near: 0.5, far: 400 }

let canvas: HTMLCanvasElement

beforeEach(() => {
  canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } })
  document.body.append(canvas)
})

afterEach(() => {
  canvas.remove()
})

function editorCamera(): EditorCamera {
  const camera = new EditorCamera(canvas)
  camera.adoptSceneCamera(SCENE_CAMERA)
  return camera
}

/** Three decimals, with -0 read as 0. */
const round = (values: readonly number[]): number[] => values.map((value) => Math.round(value * 1000) / 1000 + 0)
const poseOf = (camera: EditorCamera): { position: number[]; target: number[] } => ({ position: round(camera.pose.position), target: round(camera.pose.target) })

/** One mouse drag of `button` across the canvas, 60 px right and 30 px down, with the given modifiers. */
function mouseDrag(button: number, modifiers: { altKey?: boolean; shiftKey?: boolean } = {}): void {
  const at = (clientX: number, clientY: number) => ({ clientX, clientY, pageX: clientX, pageY: clientY, button, buttons: 1 << button, pointerId: 1, pointerType: 'mouse', bubbles: true, ...modifiers })
  canvas.dispatchEvent(new PointerEvent('pointerdown', at(400, 300)))
  canvas.dispatchEvent(new PointerEvent('pointermove', at(430, 315)))
  canvas.dispatchEvent(new PointerEvent('pointermove', at(460, 330)))
  canvas.dispatchEvent(new PointerEvent('pointerup', at(460, 330)))
}

const distanceOf = (pose: CameraPose): number => new THREE.Vector3(...pose.position).distanceTo(new THREE.Vector3(...pose.target))

describe('the editor camera starts as the scene camera (issue #173 CA-9)', () => {
  it("copies the scene camera's position, target, fov, near and far", () => {
    const camera = editorCamera()

    expect(poseOf(camera)).toEqual({ position: [0, 5, 10], target: [0, 0, 0] })
    expect(camera.camera.fov).toBe(60)
    expect(camera.camera.near).toBe(0.5)
    expect(camera.camera.far).toBe(400)
    const ahead = camera.camera.getWorldDirection(new THREE.Vector3())
    expect(round(ahead.toArray())).toEqual(round([0, -5 / Math.sqrt(125), -10 / Math.sqrt(125)]))
  })
})

describe('mouse navigation through OrbitControls (issue #173 CA-10)', () => {
  it('orbits with the middle button and with Alt+left, pans with the right button and Shift+middle, never with damping', () => {
    const camera = editorCamera()
    expect(camera.controls.enableDamping).toBe(false)
    expect(camera.controls.mouseButtons).toEqual({ LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN })
  })

  it('orbits on a middle drag: the target stays and the distance holds', () => {
    const camera = editorCamera()
    mouseDrag(1)
    expect(poseOf(camera).target).toEqual([0, 0, 0])
    expect(poseOf(camera).position).not.toEqual([0, 5, 10])
    expect(distanceOf(camera.pose)).toBeCloseTo(Math.sqrt(125), 6)
  })

  it('orbits on an Alt+left drag', () => {
    const camera = editorCamera()
    expect(poseOf(camera).position).toEqual([0, 5, 10])
    mouseDrag(0, { altKey: true })
    expect(poseOf(camera).target).toEqual([0, 0, 0])
    expect(poseOf(camera).position).not.toEqual([0, 5, 10])
    expect(distanceOf(camera.pose)).toBeCloseTo(Math.sqrt(125), 6)
  })

})

describe('mouse navigation that pans, zooms or does nothing (issue #173 CA-10)', () => {
  it('pans on a right drag and on a Shift+middle drag: camera and target move together', () => {
    for (const [button, modifiers] of [[2, {}], [1, { shiftKey: true }]] as const) {
      const camera = editorCamera()
      mouseDrag(button, modifiers)
      const { position, target } = camera.pose
      expect(round(target)).not.toEqual([0, 0, 0])
      expect(round([position[0] - target[0], position[1] - target[1], position[2] - target[2]])).toEqual([0, 5, 10])
      camera.dispose()
    }
  })

  it('leaves the camera alone on a left drag without Alt', () => {
    const camera = editorCamera()
    mouseDrag(0)
    expect(poseOf(camera)).toEqual({ position: [0, 5, 10], target: [0, 0, 0] })
  })

  it('zooms on the wheel', () => {
    const camera = editorCamera()
    expect(distanceOf(camera.pose)).toBeCloseTo(Math.sqrt(125), 6)
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    expect(distanceOf(camera.pose)).toBeLessThan(Math.sqrt(125) - 0.1)
    expect(distanceOf(camera.pose)).toBeGreaterThan(1)
    expect(poseOf(camera).target).toEqual([0, 0, 0])
  })

  it('reports the pose once a gesture ends', () => {
    const camera = editorCamera()
    const changed = vi.fn()
    camera.onPoseChange(changed)
    mouseDrag(1)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenLastCalledWith(camera.pose)
  })
})

describe('keyboard steps (issue #173 CA-11)', () => {
  /** The yaw of the offset from the target, in degrees about +y. */
  const yawOf = (pose: CameraPose): number =>
    THREE.MathUtils.radToDeg(Math.atan2(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2]))

  it('orbits 5° per step around the target, keeping the distance', () => {
    const camera = editorCamera()
    camera.orbit(1, 0)
    expect(yawOf(camera.pose)).toBeCloseTo(5, 6)
    camera.orbit(-2, 0)
    expect(yawOf(camera.pose)).toBeCloseTo(-5, 6)
    const pitched = editorCamera()
    pitched.orbit(0, 1)
    expect(Math.abs(pitched.pose.position[1] - 5)).toBeGreaterThan(0.1)
    for (const each of [camera, pitched]) expect(distanceOf(each.pose)).toBeCloseTo(Math.sqrt(125), 6)
  })

  it('pans 0.5 units per step, sideways and up the view', () => {
    const camera = editorCamera()
    camera.pan(1, 0)
    expect(round(camera.pose.target)).toEqual([0.5, 0, 0])
    expect(round(camera.pose.position)).toEqual([0.5, 5, 10])
    camera.pan(0, 1)
    const target = new THREE.Vector3(...camera.pose.target)
    expect(target.distanceTo(new THREE.Vector3(0.5, 0, 0))).toBeCloseTo(0.5, 6)
    expect(target.y).toBeGreaterThan(0)
  })

  it('zooms by a factor of 1.1 per step', () => {
    const camera = editorCamera()
    camera.zoom(1 / 1.1)
    expect(distanceOf(camera.pose)).toBeCloseTo(Math.sqrt(125) / 1.1, 6)
    camera.zoom(1.1)
    camera.zoom(1.1)
    expect(distanceOf(camera.pose)).toBeCloseTo(Math.sqrt(125) * 1.1, 6)
  })
})

describe('framing (issue #173 CA-15)', () => {
  it('aims at the center of the bounds and backs off until they fit the vertical fov, keeping the view direction', () => {
    const camera = editorCamera()
    // Center (4, 1, 0), bounding sphere radius √3: at fov 60° the distance is √3 / sin 30° = 3.4641.
    camera.frame(new THREE.Box3(new THREE.Vector3(3, 0, -1), new THREE.Vector3(5, 2, 1)))
    expect(poseOf(camera)).toEqual({ target: [4, 1, 0], position: [4, 2.549, 3.098] })
  })
})

describe('setting a pose', () => {
  it('places the camera and its orbit target', () => {
    const camera = editorCamera()
    camera.setPose({ position: [1, 2, 3], target: [0, 1, 0] })
    expect(poseOf(camera)).toEqual({ position: [1, 2, 3], target: [0, 1, 0] })
    mouseDrag(1)
    expect(poseOf(camera).target).toEqual([0, 1, 0])
  })
})
