import type * as THREE from 'three/webgpu'

/** A world-space point or direction as scene JSON stores it. */
export type Vec3Json = [number, number, number]

/**
 * A scene's perspective camera (3D scenes, ADR 0027). Fixed by the scene; game
 * code may move it. Y is up and the camera looks from `position` at `target`.
 */
export interface PerspectiveSceneCameraJson {
  kind: 'perspective'
  /** Where the camera sits. Default `[0, 5, 10]`. */
  position?: Vec3Json
  /** The point it looks at. Default `[0, 0, 0]`. */
  target?: Vec3Json
  /** Vertical field of view in degrees, in (0, 180). Default 60. */
  fov?: number
  /** Near clipping plane, above 0. Default 0.1. */
  near?: number
  /** Far clipping plane, above `near`. Default 1000. */
  far?: number
  // The orthographic block's fields, declared as absent: a perspective block
  // cannot follow, zoom or clamp, and reading them off the union stays legal.
  zoom?: never
  follow?: never
  deadzoneWidth?: never
  deadzoneHeight?: never
  lookahead?: never
  lookaheadY?: never
  smoothing?: never
  limits?: never
}

export interface ResolvedPerspectiveCamera {
  kind: 'perspective'
  position: Vec3Json
  target: Vec3Json
  fov: number
  near: number
  far: number
}

export const PERSPECTIVE_DEFAULTS = {
  position: [0, 5, 10] as Vec3Json,
  target: [0, 0, 0] as Vec3Json,
  fov: 60,
  near: 0.1,
  far: 1000,
} as const

/** True for a perspective camera block; everything else (or none) is the orthographic one. */
export function isPerspectiveCameraJson(json: { kind?: string } | undefined): json is PerspectiveSceneCameraJson {
  return json?.kind === 'perspective'
}

/** Fills a perspective camera block with the engine defaults. */
export function resolvePerspectiveCamera(json: PerspectiveSceneCameraJson = { kind: 'perspective' }): ResolvedPerspectiveCamera {
  return {
    kind: 'perspective',
    position: json.position ?? PERSPECTIVE_DEFAULTS.position,
    target: json.target ?? PERSPECTIVE_DEFAULTS.target,
    fov: json.fov ?? PERSPECTIVE_DEFAULTS.fov,
    near: json.near ?? PERSPECTIVE_DEFAULTS.near,
    far: json.far ?? PERSPECTIVE_DEFAULTS.far,
  }
}

/** Points `camera` as the resolved block says, at the given aspect ratio. */
export function placePerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  resolved: ResolvedPerspectiveCamera,
  aspect: number,
): void {
  camera.fov = resolved.fov
  camera.near = resolved.near
  camera.far = resolved.far
  camera.aspect = aspect
  camera.position.set(...resolved.position)
  camera.lookAt(...resolved.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

/** One field of a scene's render, camera or entity transform that is invalid, for validate_project. */
export interface SceneFieldIssue {
  field: string
  message: string
}

/** A JSON value as a message quotes it: strings in quotes, everything else as `String()` shows it. */
export const shown = (value: unknown): string => (typeof value === 'string' ? JSON.stringify(value) : String(value))

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function vectorIssue(field: string, value: unknown, issues: SceneFieldIssue[]): void {
  if (value === undefined) return
  if (Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)) return
  issues.push({ field, message: `${field} must be three finite numbers [x, y, z]; got ${JSON.stringify(value)}.` })
}

function fovIssue(value: unknown, issues: SceneFieldIssue[]): void {
  if (value === undefined) return
  if (isFiniteNumber(value) && value > 0 && value < 180) return
  issues.push({ field: 'camera.fov', message: `camera.fov must be a number above 0 and below 180; got ${shown(value)}.` })
}

/** `position` and `target` as the camera would use them, when both are well-formed (declared or default). */
function resolvedAim(block: Record<string, unknown>): { position: Vec3Json; target: Vec3Json } | null {
  const position = block.position ?? PERSPECTIVE_DEFAULTS.position
  const target = block.target ?? PERSPECTIVE_DEFAULTS.target
  const wellFormed = (value: unknown): value is Vec3Json =>
    Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
  return wellFormed(position) && wellFormed(target) ? { position, target } : null
}

function aimIssue(block: Record<string, unknown>, issues: SceneFieldIssue[]): void {
  const aim = resolvedAim(block)
  if (!aim || aim.position.some((value, axis) => value !== aim.target[axis])) return
  issues.push({
    field: 'camera.target',
    message: `camera.target must differ from camera.position (${JSON.stringify(aim.position)}): a camera needs a direction to look in.`,
  })
}

function planeIssues(near: unknown, far: unknown, issues: SceneFieldIssue[]): void {
  const nearIsValid = isFiniteNumber(near) && near > 0
  if (near !== undefined && !nearIsValid) {
    issues.push({ field: 'camera.near', message: `camera.near must be a number above 0; got ${shown(near)}.` })
  }
  const nearValue = nearIsValid ? near : PERSPECTIVE_DEFAULTS.near
  if (far !== undefined && !(isFiniteNumber(far) && far > nearValue)) {
    issues.push({ field: 'camera.far', message: `camera.far must be a number above near (${nearValue}); got ${shown(far)}.` })
  }
}

/** The orthographic block's fields, which a perspective block does not accept. */
const ORTHOGRAPHIC_ONLY_FIELDS = [
  'follow',
  'zoom',
  'deadzoneWidth',
  'deadzoneHeight',
  'lookahead',
  'lookaheadY',
  'smoothing',
  'limits',
] as const

function orthographicFieldIssues(block: Record<string, unknown>, issues: SceneFieldIssue[]): void {
  for (const field of ORTHOGRAPHIC_ONLY_FIELDS) {
    if (block[field] === undefined) continue
    issues.push({ field: `camera.${field}`, message: `camera.${field} belongs to an orthographic camera; a perspective camera does not accept it.` })
  }
}

/**
 * Every field of a perspective camera block outside its range: `fov` in
 * (0, 180), `near` above 0, `far` above `near`, and `position` and `target`
 * three finite numbers, and none of the orthographic block's fields. Anything
 * that is not a perspective block reports none.
 */
export function perspectiveCameraIssues(camera: unknown): SceneFieldIssue[] {
  if (typeof camera !== 'object' || camera === null) return []
  const block: Record<string, unknown> = { ...camera }
  if (block.kind !== 'perspective') return []
  const issues: SceneFieldIssue[] = []
  vectorIssue('camera.position', block.position, issues)
  vectorIssue('camera.target', block.target, issues)
  fovIssue(block.fov, issues)
  aimIssue(block, issues)
  planeIssues(block.near, block.far, issues)
  orthographicFieldIssues(block, issues)
  return issues
}
