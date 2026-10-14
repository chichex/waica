import { isFiniteNumber, shown, type SceneFieldIssue } from './scene-field-issues.js'

/**
 * The orbit fields of a scene's perspective camera block (issue #181, ADR
 * 0031): with `follow`, the camera orbits that entity instead of staying
 * where `position` and `target` put it. Angles are degrees; `yaw` 0 looks
 * toward -z (the camera sits on +z), 90 toward +x; `pitch` is the camera's
 * height above the look point, positive looking down.
 */
export interface OrbitCameraJson {
  /** The entity to orbit; absent or empty keeps the camera fixed. */
  follow?: string
  /** The chosen distance from the look point. Default 6. */
  distance?: number
  /** The wheel's closest distance. Default 2. */
  minDistance?: number
  /** The wheel's farthest distance. Default 12. */
  maxDistance?: number
  /** Initial yaw, in degrees. Default 0. */
  yaw?: number
  /** Initial pitch, in degrees, in (-89, 89). Default 20. */
  pitch?: number
  /** Lowest pitch, in (-89, 89). Default -10. */
  minPitch?: number
  /** Highest pitch, in (-89, 89). Default 70. */
  maxPitch?: number
  /** How far above the followed entity's position the camera looks. Default 1.2. */
  lookHeight?: number
  /** Degrees of orbit per CSS pixel of locked mouse movement. Default 0.2. */
  sensitivity?: number
  /** Degrees per second the orbit Actions turn at full value. Default 120. */
  orbitSpeed?: number
  /** Flips the mouse's vertical orbit. Default false. */
  invertY?: boolean
  /** The Action that orbits left (yaw down). Default `look_left`. */
  orbitLeftAction?: string
  /** The Action that orbits right (yaw up). Default `look_right`. */
  orbitRightAction?: string
  /** The Action that looks up (pitch down). Default `look_up`. */
  orbitUpAction?: string
  /** The Action that looks down (pitch up). Default `look_down`. */
  orbitDownAction?: string
}

const ACTION_FIELDS = ['orbitLeftAction', 'orbitRightAction', 'orbitUpAction', 'orbitDownAction'] as const

/** Every orbit field resolved; `follow` names the entity. */
export type ResolvedOrbit = Required<OrbitCameraJson>

export const ORBIT_DEFAULTS = {
  distance: 6,
  minDistance: 2,
  maxDistance: 12,
  yaw: 0,
  pitch: 20,
  minPitch: -10,
  maxPitch: 70,
  lookHeight: 1.2,
  sensitivity: 0.2,
  orbitSpeed: 120,
  invertY: false,
  orbitLeftAction: 'look_left',
  orbitRightAction: 'look_right',
  orbitUpAction: 'look_up',
  orbitDownAction: 'look_down',
} as const satisfies Omit<ResolvedOrbit, 'follow'>

/** The orbit a block declares with its defaults filled, or null for a fixed camera (no `follow`). */
export function resolveOrbit(json: OrbitCameraJson): ResolvedOrbit | null {
  if (!json.follow) return null
  return { follow: json.follow, ...resolveFraming(json), ...resolveControls(json) }
}

/** Where the camera sits: distances, angles and the look height. */
function resolveFraming(json: OrbitCameraJson): Pick<ResolvedOrbit, 'distance' | 'minDistance' | 'maxDistance' | 'yaw' | 'pitch' | 'minPitch' | 'maxPitch' | 'lookHeight'> {
  return {
    distance: json.distance ?? ORBIT_DEFAULTS.distance,
    minDistance: json.minDistance ?? ORBIT_DEFAULTS.minDistance,
    maxDistance: json.maxDistance ?? ORBIT_DEFAULTS.maxDistance,
    yaw: json.yaw ?? ORBIT_DEFAULTS.yaw,
    pitch: json.pitch ?? ORBIT_DEFAULTS.pitch,
    minPitch: json.minPitch ?? ORBIT_DEFAULTS.minPitch,
    maxPitch: json.maxPitch ?? ORBIT_DEFAULTS.maxPitch,
    lookHeight: json.lookHeight ?? ORBIT_DEFAULTS.lookHeight,
  }
}

/** How input turns it: the mouse, the orbit Actions and their speed. */
function resolveControls(json: OrbitCameraJson): Pick<ResolvedOrbit, 'sensitivity' | 'orbitSpeed' | 'invertY' | (typeof ACTION_FIELDS)[number]> {
  return {
    sensitivity: json.sensitivity ?? ORBIT_DEFAULTS.sensitivity,
    orbitSpeed: json.orbitSpeed ?? ORBIT_DEFAULTS.orbitSpeed,
    invertY: json.invertY ?? ORBIT_DEFAULTS.invertY,
    orbitLeftAction: json.orbitLeftAction ?? ORBIT_DEFAULTS.orbitLeftAction,
    orbitRightAction: json.orbitRightAction ?? ORBIT_DEFAULTS.orbitRightAction,
    orbitUpAction: json.orbitUpAction ?? ORBIT_DEFAULTS.orbitUpAction,
    orbitDownAction: json.orbitDownAction ?? ORBIT_DEFAULTS.orbitDownAction,
  }
}

/** The rule each numeric orbit field must meet, and how its message says it. */
const NUMBER_RULES: ReadonlyArray<{ field: keyof OrbitCameraJson; accepts: (value: number) => boolean; rule: string }> = [
  { field: 'distance', accepts: (value) => value > 0, rule: 'a number above 0' },
  { field: 'minDistance', accepts: (value) => value > 0, rule: 'a number above 0' },
  { field: 'maxDistance', accepts: (value) => value > 0, rule: 'a number above 0' },
  { field: 'yaw', accepts: () => true, rule: 'a finite number' },
  { field: 'pitch', accepts: (value) => Math.abs(value) < 89, rule: 'a number above -89 and below 89' },
  { field: 'minPitch', accepts: (value) => Math.abs(value) < 89, rule: 'a number above -89 and below 89' },
  { field: 'maxPitch', accepts: (value) => Math.abs(value) < 89, rule: 'a number above -89 and below 89' },
  { field: 'lookHeight', accepts: () => true, rule: 'a finite number' },
  { field: 'sensitivity', accepts: (value) => value >= 0, rule: 'a number of at least 0' },
  { field: 'orbitSpeed', accepts: (value) => value >= 0, rule: 'a number of at least 0' },
]

function numberIssues(block: Record<string, unknown>, issues: SceneFieldIssue[]): void {
  for (const { field, accepts, rule } of NUMBER_RULES) {
    const value = block[field]
    if (value === undefined || (isFiniteNumber(value) && accepts(value))) continue
    issues.push({ field: `camera.${field}`, message: `camera.${field} must be ${rule}; got ${shown(value)}.` })
  }
}

function actionIssues(block: Record<string, unknown>, issues: SceneFieldIssue[]): void {
  for (const field of ACTION_FIELDS) {
    const value = block[field]
    if (value === undefined || (typeof value === 'string' && value.length > 0)) continue
    issues.push({ field: `camera.${field}`, message: `camera.${field} must be an Action name; got ${shown(value)}.` })
  }
}

function fieldIssues(block: Record<string, unknown>, issues: SceneFieldIssue[]): void {
  if (block.follow !== undefined && typeof block.follow !== 'string') {
    issues.push({ field: 'camera.follow', message: `camera.follow must be an entity name; got ${shown(block.follow)}.` })
  }
  numberIssues(block, issues)
  if (block.invertY !== undefined && typeof block.invertY !== 'boolean') {
    issues.push({ field: 'camera.invertY', message: `camera.invertY must be true or false; got ${shown(block.invertY)}.` })
  }
  actionIssues(block, issues)
}

function rangeIssue(block: Record<string, unknown>, [low, high]: readonly [string, string], issues: SceneFieldIssue[]): void {
  const min = block[low]
  const max = block[high]
  const fallback: Readonly<Record<string, unknown>> = ORBIT_DEFAULTS
  const lowValue = min ?? fallback[low]
  const highValue = max ?? fallback[high]
  if (!isFiniteNumber(lowValue) || !isFiniteNumber(highValue) || lowValue <= highValue) return
  issues.push({
    field: `camera.${low}`,
    message: `camera.${low} (${lowValue}) must not exceed camera.${high} (${highValue}).`,
  })
}

/** A declared value or its default, when it is a number its rule accepts (else the field is already an error). */
function numberOr(block: Record<string, unknown>, field: keyof typeof ORBIT_DEFAULTS): number | null {
  const fallback: Readonly<Record<string, unknown>> = ORBIT_DEFAULTS
  const value = block[field] ?? fallback[field]
  const rule = NUMBER_RULES.find((entry) => entry.field === field)
  return isFiniteNumber(value) && (rule?.accepts(value) ?? true) ? value : null
}

/** The range each initial orbit number starts inside. */
const START_RANGES = {
  distance: ['minDistance', 'maxDistance'],
  pitch: ['minPitch', 'maxPitch'],
} as const satisfies Record<string, readonly [keyof typeof ORBIT_DEFAULTS, keyof typeof ORBIT_DEFAULTS]>

/**
 * A following camera's declared initial `distance` or `pitch` outside its
 * valid range [low, high]: the camera clamps it, so it starts elsewhere than
 * the scene says, a warning (issue #181, maintainer decision). An invalid
 * value or an inverted range is already an error and is not repeated.
 */
function startIssue(block: Record<string, unknown>, field: keyof typeof START_RANGES): SceneFieldIssue | null {
  const [low, high] = START_RANGES[field]
  const value = block[field] === undefined ? null : numberOr(block, field)
  const min = numberOr(block, low)
  const max = numberOr(block, high)
  if (!block.follow || value === null || min === null || max === null || min > max) return null
  if (value >= min && value <= max) return null
  return {
    field: `camera.${field}`,
    message: `camera.${field} (${value}) is outside [camera.${low} (${min}), camera.${high} (${max})]; the camera starts at ${Math.min(Math.max(value, min), max)}.`,
    severity: 'warning',
  }
}

/**
 * Every orbit field of a perspective block outside its range: the numbers
 * (distances above 0, pitches in (-89, 89), speeds at least 0), `invertY`,
 * the Action names, and a `minDistance` or `minPitch` above its maximum
 * (errors); and a following camera's initial `distance` or `pitch` outside
 * its own range (warnings). Whether `follow` names an entity of the scene is
 * the scene validator's.
 */
export function orbitCameraIssues(block: Record<string, unknown>): SceneFieldIssue[] {
  const issues: SceneFieldIssue[] = []
  fieldIssues(block, issues)
  rangeIssue(block, ['minDistance', 'maxDistance'], issues)
  rangeIssue(block, ['minPitch', 'maxPitch'], issues)
  for (const field of ['distance', 'pitch'] as const) {
    const start = startIssue(block, field)
    if (start) issues.push(start)
  }
  return issues
}
