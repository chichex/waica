/**
 * What the scene validators share (the camera, orbit, render and simulation
 * blocks): the issue they report and how a message quotes a JSON value. A
 * leaf module, so the orbit fields can use them without importing the
 * perspective camera that imports them.
 */

/** One field of a scene's render, camera or entity transform that is invalid, for validate_project: an error unless it is a `'warning'`. */
export interface SceneFieldIssue {
  field: string
  message: string
  /** A field the runtime accepts as written but adjusts (a clamp): reported as a warning. */
  severity?: 'warning'
}

/** A JSON value as a message quotes it: strings in quotes, everything else as `String()` shows it. */
export const shown = (value: unknown): string => (typeof value === 'string' ? JSON.stringify(value) : String(value))

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
