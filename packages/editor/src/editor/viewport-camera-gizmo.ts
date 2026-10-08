// The scene-camera gizmo: the frame the game will show, its center marker
// (the camera's drag handle) and, while the camera is selected with limits
// on, the world bounds it may not leave.
import { resolveSceneCamera, THREE, type Game, type CameraLimitsJson } from '@waica/engine'
import { CAMERA_NODE } from '../scene/ops'
import { projectionOf } from './viewport-boxes'
import type { ViewportLive } from './viewport-live'
import { addOverlay, rectLoop, SELECTION_AMBER } from './viewport-selection-gizmos'
import { renderPoint } from './viewport-space'

const CAMERA_VIOLET = 0x8d79f0

/** Where the scene camera's frame sits this frame, in render space. */
export interface SceneCameraFrame {
  x: number
  y: number
  width: number
  height: number
  /** Following a target: the frame rides it and has no drag marker. */
  following: boolean
  selected: boolean
  limits: CameraLimitsJson | null
}

/**
 * The frame play would start with: on the follow target, else the live drag
 * position, else the scene camera's own position.
 */
export function sceneCameraFrame(game: Game, live: ViewportLive, dragged: { x: number; y: number } | null): SceneCameraFrame {
  const sceneCam = resolveSceneCamera(live.scene.camera)
  const target = sceneCam.follow ? game.find(sceneCam.follow) : undefined
  const targetRender = target ? renderPoint(projectionOf(live.scene), target.position.x, target.position.y) : null
  const pos = targetRender
    ? { x: targetRender[0], y: targetRender[1] }
    : (dragged ?? { x: sceneCam.position[0], y: sceneCam.position[1] })
  const res = live.resolution
  const aspect = res
    ? res.width / res.height
    : (game.camera.right - game.camera.left) / (game.camera.top - game.camera.bottom)
  const selected = live.selected === CAMERA_NODE
  return {
    ...pos,
    width: sceneCam.zoom * aspect,
    height: sceneCam.zoom,
    following: target != null,
    selected,
    limits: selected ? sceneCam.limits : null,
  }
}

export function createCameraGizmo(game: Game) {
  const frameLoop = rectLoop(CAMERA_VIOLET)
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: CAMERA_VIOLET }))
  const limitsLoop = rectLoop(0xef476f)
  frameLoop.position.z = 4.5
  marker.position.z = 4.6
  limitsLoop.position.z = 4.4
  frameLoop.visible = false
  marker.visible = false
  limitsLoop.visible = false
  addOverlay(game, frameLoop, marker, limitsLoop)

  const showLimits = (limits: CameraLimitsJson | null): void => {
    limitsLoop.visible = limits != null
    if (!limits) return
    limitsLoop.position.set((limits.minX + limits.maxX) / 2, (limits.minY + limits.maxY) / 2, 4.4)
    limitsLoop.scale.set(limits.maxX - limits.minX, limits.maxY - limits.minY, 1)
  }

  return {
    hide(): void {
      frameLoop.visible = false
      marker.visible = false
      limitsLoop.visible = false
    },
    show(frame: SceneCameraFrame): void {
      const color = frame.selected ? SELECTION_AMBER : CAMERA_VIOLET
      frameLoop.material.color.setHex(color)
      marker.material.color.setHex(color)
      frameLoop.visible = true
      frameLoop.position.set(frame.x, frame.y, 4.5)
      frameLoop.scale.set(frame.width, frame.height, 1)
      // The marker is the camera's drag handle: while following it would
      // just sit on the target and steal its clicks — hide it.
      marker.visible = !frame.following
      const markerSize = game.view * 0.03
      marker.position.set(frame.x, frame.y, 4.6)
      marker.scale.set(markerSize, markerSize, 1)
      showLimits(frame.limits)
    },
  }
}
