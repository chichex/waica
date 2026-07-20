import * as THREE from 'three'

/**
 * The scene camera: a built-in, singular part of every scene — not a
 * component you attach to an entity. The scene JSON carries its framing
 * (position, zoom), an optional follow target and world limits; the Game
 * drives the real THREE camera from it while simulating.
 */

/** World-space rectangle the camera view may never leave. */
export interface CameraLimitsJson {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface SceneCameraJson {
  /** Where the camera starts (and stays, without a follow target). */
  position?: [number, number]
  /** Visible world height in units — the camera's zoom. */
  zoom?: number
  /** Entity name to follow; absent or empty = fixed camera. */
  follow?: string
  deadzoneWidth?: number
  deadzoneHeight?: number
  lookahead?: number
  smoothing?: number
  limits?: CameraLimitsJson
}

export interface ResolvedSceneCamera {
  position: [number, number]
  zoom: number
  follow: string
  deadzoneWidth: number
  deadzoneHeight: number
  lookahead: number
  smoothing: number
  limits: CameraLimitsJson | null
}

export const CAMERA_DEFAULTS = {
  position: [0, 0] as [number, number],
  zoom: 12,
  follow: '',
  deadzoneWidth: 2,
  deadzoneHeight: 2.5,
  lookahead: 1.5,
  smoothing: 6,
} as const

/** Fills a scene's camera block with the engine defaults. */
export function resolveSceneCamera(json?: SceneCameraJson): ResolvedSceneCamera {
  return {
    position: json?.position ?? CAMERA_DEFAULTS.position,
    zoom: json?.zoom ?? CAMERA_DEFAULTS.zoom,
    follow: json?.follow ?? CAMERA_DEFAULTS.follow,
    deadzoneWidth: json?.deadzoneWidth ?? CAMERA_DEFAULTS.deadzoneWidth,
    deadzoneHeight: json?.deadzoneHeight ?? CAMERA_DEFAULTS.deadzoneHeight,
    lookahead: json?.lookahead ?? CAMERA_DEFAULTS.lookahead,
    smoothing: json?.smoothing ?? CAMERA_DEFAULTS.smoothing,
    limits: json?.limits ?? null,
  }
}

/** Clamps a camera center so the view stays inside the limits on one axis. */
function clampAxis(center: number, halfView: number, min: number, max: number): number {
  // Limits narrower than the view: center the view on them.
  if (max - min <= halfView * 2) return (min + max) / 2
  return Math.min(Math.max(center, min + halfView), max - halfView)
}

export interface CameraStepInput {
  /** Current camera center. */
  x: number
  y: number
  /** Half the visible world extents (from zoom and aspect). */
  halfW: number
  halfH: number
  /** Followed entity's position, if the target exists. */
  target: { x: number; y: number } | null
  /** Followed entity's horizontal velocity, for lookahead. */
  vx: number
  dt: number
}

/**
 * One simulation step of the camera: deadzone-follow with lookahead and
 * exponential smoothing, then limits. Pure — returns the next center.
 */
export function stepSceneCamera(
  cam: ResolvedSceneCamera,
  input: CameraStepInput,
): { x: number; y: number } {
  let x = input.x
  let y = input.y

  if (input.target) {
    let wantX = x
    let wantY = y
    const dx = input.target.x - x
    const dy = input.target.y - y
    const halfDzW = cam.deadzoneWidth / 2
    const halfDzH = cam.deadzoneHeight / 2
    if (Math.abs(dx) > halfDzW) wantX = input.target.x - Math.sign(dx) * halfDzW
    if (Math.abs(dy) > halfDzH) wantY = input.target.y - Math.sign(dy) * halfDzH
    if (Math.abs(input.vx) > 1) wantX += Math.sign(input.vx) * cam.lookahead
    x = THREE.MathUtils.damp(x, wantX, cam.smoothing, input.dt)
    y = THREE.MathUtils.damp(y, wantY, cam.smoothing, input.dt)
  }

  if (cam.limits) {
    x = clampAxis(x, input.halfW, cam.limits.minX, cam.limits.maxX)
    y = clampAxis(y, input.halfH, cam.limits.minY, cam.limits.maxY)
  }

  return { x, y }
}
