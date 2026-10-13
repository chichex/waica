import {
  ORBIT_DEFAULTS,
  resolvePerspectiveCamera,
  type ParamSpec,
  type PerspectiveSceneCameraJson,
} from '@waica/engine'
import type { CameraProp } from './inspector-props'
import { PropRow, RoRow } from './PropRow'
import { Vec3Row } from './Vec3Row'

/** The perspective camera's field of view, in degrees: the span `validate_project` accepts, (0, 180), so no valid lens is shown pinned to an end. */
const FOV_SPEC: ParamSpec = { label: 'Field of view', min: 1, max: 179, step: 1 }

/** The orbit's numbers (issue #181 CA-33), in the order the Follow section lists them; pitches stay inside validate_project's (-89, 89). */
const ORBIT_SPECS = {
  distance: { label: 'Distance', min: 0.5, max: 30, step: 0.5 },
  minDistance: { label: 'Min distance', min: 0.5, max: 30, step: 0.5 },
  maxDistance: { label: 'Max distance', min: 0.5, max: 30, step: 0.5 },
  yaw: { label: 'Yaw (°)', min: -180, max: 180, step: 1 },
  pitch: { label: 'Pitch (°)', min: -88, max: 88, step: 1 },
  minPitch: { label: 'Min pitch', min: -88, max: 88, step: 1 },
  maxPitch: { label: 'Max pitch', min: -88, max: 88, step: 1 },
  lookHeight: { label: 'Look height', min: 0, max: 5, step: 0.1 },
  sensitivity: { label: 'Sensitivity (°/px)', min: 0, max: 2, step: 0.05 },
  orbitSpeed: { label: 'Orbit speed (°/s)', min: 0, max: 720, step: 10 },
} satisfies Record<string, ParamSpec>

/** The four orbit Actions, picked from the project's bindings. */
const ORBIT_ACTIONS = {
  orbitLeftAction: { label: 'Orbit left', ref: 'action' },
  orbitRightAction: { label: 'Orbit right', ref: 'action' },
  orbitUpAction: { label: 'Orbit up', ref: 'action' },
  orbitDownAction: { label: 'Orbit down', ref: 'action' },
} satisfies Record<string, ParamSpec>

type OrbitNumber = keyof typeof ORBIT_SPECS
type ResolvedOrbitNumbers = Record<OrbitNumber, number>

/**
 * Each orbit number's slider range, narrowed by its counterpart as resolved
 * now: a minimum never above its maximum and the distance between them, so no
 * edit leaves a range `validate_project` reports inverted.
 */
function orbitSpec(field: OrbitNumber, orbit: ResolvedOrbitNumbers): ParamSpec {
  const spec: ParamSpec = ORBIT_SPECS[field]
  if (field === 'minDistance') return { ...spec, max: orbit.maxDistance }
  if (field === 'maxDistance') return { ...spec, min: orbit.minDistance }
  if (field === 'distance') return { ...spec, min: orbit.minDistance, max: orbit.maxDistance }
  if (field === 'pitch') return { ...spec, min: orbit.minPitch, max: orbit.maxPitch }
  if (field === 'minPitch') return { ...spec, max: orbit.maxPitch }
  if (field === 'maxPitch') return { ...spec, min: orbit.minPitch }
  return spec
}

/** A typed or slid value kept inside the row's range. */
function within({ min = -Infinity, max = Infinity }: ParamSpec, value: unknown): unknown {
  return typeof value === 'number' ? Math.min(Math.max(value, min), max) : value
}

interface PerspectiveCameraProps {
  camera: PerspectiveSceneCameraJson | undefined
  entityNames: string[]
  onProp: CameraProp
}

/**
 * The orbit camera (issue #181 CA-33, ADR 0031): the entity it follows —
 * "none" keeps the camera fixed and removes `follow` — and, while it follows
 * one, its distances, pitch limits, mouse sensitivity, orbit speed, invert Y
 * and the four orbit Actions. The rows show the engine defaults until set,
 * and stay disabled while the camera follows nothing.
 */
function FollowSection({ camera, entityNames, onProp }: PerspectiveCameraProps) {
  const orbit = { ...ORBIT_DEFAULTS, ...camera }
  const follows = Boolean(camera?.follow)
  // A follow whose entity was deleted or renamed away still shows, so the enabled rows do not contradict the select.
  const missing = camera?.follow && !entityNames.includes(camera.follow) ? camera.follow : null
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Follow</header>
      <label className="ed-row">
        <span>follow</span>
        <select value={camera?.follow ?? ''} onChange={(e) => onProp('follow', e.target.value || undefined)}>
          <option value="">none — fixed camera</option>
          {missing && <option value={missing}>{missing} (missing)</option>}
          {entityNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {/* A disabled fieldset disables every control inside it (the HTML rule), so the rows need no flag of their own. */}
      <fieldset className="ed-fieldset" aria-label="orbit" disabled={!follows}>
        {(Object.keys(ORBIT_SPECS) as OrbitNumber[]).map((field) => {
          const spec = orbitSpec(field, orbit)
          return <PropRow key={field} label={field} spec={spec} value={orbit[field]} onChange={(value) => onProp(field, within(spec, value))} />
        })}
        <label className="ed-row">
          <span>invert Y</span>
          <input type="checkbox" checked={orbit.invertY} onChange={(e) => onProp('invertY', e.target.checked)} />
        </label>
        {Object.entries(ORBIT_ACTIONS).map(([field, spec]) => (
          <PropRow key={field} label={field} spec={spec} value={orbit[field as keyof typeof ORBIT_ACTIONS]} onChange={(value) => onProp(field, value)} />
        ))}
      </fieldset>
      {!follows && <div className="ed-hint">pick an entity and the camera will orbit it while playing</div>}
    </div>
  )
}

/** A point the orbit overrides in Play, shown as written. */
const shownPoint = (point: readonly number[]): string => point.join(', ')

/**
 * A 3D scene's camera: where it sits, what it looks at, its lens, and the
 * orbit around a followed entity. While it follows, position and target are
 * read-only (maintainer decision on issue #181): the orbit places the camera.
 */
export function PerspectiveCameraInspector({ camera, entityNames, onProp }: PerspectiveCameraProps) {
  const cam = resolvePerspectiveCamera(camera)
  const follows = Boolean(camera?.follow)
  return (
    <div className="ed-pad">
      {follows ? (
        <>
          <RoRow label="position" value={shownPoint(cam.position)} />
          <RoRow label="target" value={shownPoint(cam.target)} />
          <div className="ed-hint">the orbit places the camera while playing; pick “none” to set position and target by hand</div>
        </>
      ) : (
        <>
          <Vec3Row label="position" value={cam.position} step={0.5} onChange={(value) => onProp('position', value)} />
          <Vec3Row label="target" value={cam.target} step={0.5} onChange={(value) => onProp('target', value)} />
        </>
      )}
      <PropRow label="fov" spec={FOV_SPEC} value={cam.fov} onChange={(value) => onProp('fov', value)} />
      <FollowSection camera={camera} entityNames={entityNames} onProp={onProp} />
    </div>
  )
}
