import {
  isPerspectiveCameraJson,
  resolvePerspectiveCamera,
  resolveSceneCamera,
  type ParamSpec,
  type PerspectiveSceneCameraJson,
  type ResolvedSceneCamera,
  type SceneCameraJson,
  type SceneSpace,
} from '@waica/engine'
import type { ResolutionSetting } from '../../project/game'
import { cameraViewSize } from '../box-math'
import { NumberField } from '../NumberField'
import { PropRow, RoRow } from './PropRow'
import { Vec3Row } from './Vec3Row'

/** Inspector metadata for the camera's tunable numbers (sliders). */
const CAMERA_SPECS: Record<string, ParamSpec> = {
  zoom: { label: 'Zoom (world height)', min: 2, max: 80, step: 0.25 },
  deadzoneWidth: { label: 'Deadzone width', min: 0, max: 10, step: 0.25 },
  deadzoneHeight: { label: 'Deadzone height', min: 0, max: 10, step: 0.25 },
  lookahead: { label: 'Lookahead', min: 0, max: 6, step: 0.25 },
  lookaheadY: { label: 'Lookahead (vertical)', min: 0, max: 6, step: 0.25 },
  smoothing: { label: 'Smoothing', min: 1, max: 20, step: 0.5 },
}

/** The perspective camera's field of view, in degrees: the span `validate_project` accepts, (0, 180), so no valid lens is shown pinned to an end. */
const FOV_SPEC: ParamSpec = { label: 'Field of view', min: 1, max: 179, step: 1 }

/** Fresh limits when the user turns them on: roomy around the origin. */
const DEFAULT_LIMITS = { minX: -20, maxX: 20, minY: -12, maxY: 12 }

type ResolvedCamera = ResolvedSceneCamera
type CameraProp = (key: string, value: unknown) => void

interface CameraSectionProps {
  cam: ResolvedCamera
  onProp: CameraProp
}

function CameraSlider({
  cam,
  name,
  onProp,
}: CameraSectionProps & {
  name: 'zoom' | 'deadzoneWidth' | 'deadzoneHeight' | 'lookahead' | 'lookaheadY' | 'smoothing'
}) {
  return (
    <PropRow
      label={name}
      spec={CAMERA_SPECS[name]}
      value={cam[name]}
      onChange={(value) => onProp(name, value)}
    />
  )
}

function CameraPosition({ cam, onProp }: CameraSectionProps) {
  const [x, y] = cam.position
  if (cam.follow) {
    // Following: the camera rides its target, so a manual position would
    // be a lie — the game overrides it the moment play starts.
    return <RoRow label="position" value={`on ${cam.follow}`} />
  }
  return (
    <div className="ed-row ed-row-xy">
      <span>position</span>
      <NumberField step={0.5} value={x} onChange={(t) => onProp('position', [Number(t), y])} />
      <NumberField step={0.5} value={y} onChange={(t) => onProp('position', [x, Number(t)])} />
    </div>
  )
}

/** Zoom and what it shows, in world units and in art pixels. */
function FramingSection({
  cam,
  onProp,
  pixelsPerUnit,
  resolution,
}: CameraSectionProps & { pixelsPerUnit: number; resolution: ResolutionSetting }) {
  const view = cameraViewSize(cam.zoom, resolution.width / resolution.height)
  // The zoom that shows exactly the game resolution's height in art pixels.
  const resolutionZoom = Math.round((resolution.height / pixelsPerUnit) * 1000) / 1000
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Framing</header>
      <CameraSlider cam={cam} name="zoom" onProp={onProp} />
      <RoRow label="visible area" value={`${view.width} × ${view.height} units`} />
      <RoRow
        label="in art pixels"
        value={`${Math.round(view.width * pixelsPerUnit)} × ${Math.round(view.height * pixelsPerUnit)} px`}
      />
      {Math.abs(cam.zoom - resolutionZoom) > 0.001 && (
        <button
          className="ed-wide"
          title={`Sets zoom to ${resolutionZoom} so the camera shows exactly ${resolution.width}×${resolution.height} px of art at ${pixelsPerUnit} px/unit — 1 image pixel = 1 screen pixel`}
          onClick={() => onProp('zoom', resolutionZoom)}
        >
          🎯 Match game resolution ({resolution.width}×{resolution.height})
        </button>
      )}
      <div className="ed-hint">
        zoom is how many world units tall the view is — at {pixelsPerUnit} px/unit (Project →
        game) that's the art the player sees
        {resolution.mode === 'fill' &&
          `; width assumes a ${resolution.width}×${resolution.height} window (fill mode follows the real window's shape)`}
      </div>
    </div>
  )
}

function FollowSection({ cam, onProp, entityNames }: CameraSectionProps & { entityNames: string[] }) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Follow</header>
      <label className="ed-row">
        <span>target</span>
        <select value={cam.follow} onChange={(e) => onProp('follow', e.target.value || undefined)}>
          <option value="">none — fixed camera</option>
          {entityNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {cam.follow ? (
        <>
          <CameraSlider key="deadzoneWidth" cam={cam} name="deadzoneWidth" onProp={onProp} />
          <CameraSlider key="deadzoneHeight" cam={cam} name="deadzoneHeight" onProp={onProp} />
          <CameraSlider key="lookahead" cam={cam} name="lookahead" onProp={onProp} />
          <CameraSlider key="lookaheadY" cam={cam} name="lookaheadY" onProp={onProp} />
          <CameraSlider key="smoothing" cam={cam} name="smoothing" onProp={onProp} />
        </>
      ) : (
        <div className="ed-hint">pick a target and the camera will chase it while playing</div>
      )}
    </div>
  )
}

function LimitRow({
  cam,
  onProp,
  side,
  label,
}: CameraSectionProps & { side: keyof typeof DEFAULT_LIMITS; label: string }) {
  return (
    <label className="ed-row">
      <span>{label}</span>
      <NumberField
        step={0.5}
        value={cam.limits?.[side] ?? 0}
        onChange={(t) => onProp('limits', { ...cam.limits, [side]: Number(t) })}
      />
    </label>
  )
}

function LimitsSection({ cam, onProp }: CameraSectionProps) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Limits</header>
      <label className="ed-row">
        <span>limit the view</span>
        <input
          type="checkbox"
          checked={cam.limits != null}
          onChange={(e) => onProp('limits', e.target.checked ? DEFAULT_LIMITS : undefined)}
        />
      </label>
      {cam.limits ? (
        <>
          <LimitRow key="minX" cam={cam} onProp={onProp} side="minX" label="left" />
          <LimitRow key="maxX" cam={cam} onProp={onProp} side="maxX" label="right" />
          <LimitRow key="minY" cam={cam} onProp={onProp} side="minY" label="bottom" />
          <LimitRow key="maxY" cam={cam} onProp={onProp} side="maxY" label="top" />
          <div className="ed-hint">
            while playing, the camera never shows anything outside these world bounds
          </div>
        </>
      ) : (
        <div className="ed-hint">no limits — the camera can go anywhere</div>
      )}
    </div>
  )
}

/** A 3D scene's camera: where it sits, what it looks at and its lens. */
function PerspectiveCameraInspector({ camera, onProp }: { camera: PerspectiveSceneCameraJson | undefined; onProp: CameraProp }) {
  const cam = resolvePerspectiveCamera(camera)
  return (
    <div className="ed-pad">
      <Vec3Row label="position" value={cam.position} step={0.5} onChange={(value) => onProp('position', value)} />
      <Vec3Row label="target" value={cam.target} step={0.5} onChange={(value) => onProp('target', value)} />
      <PropRow
        label="fov"
        spec={FOV_SPEC}
        value={cam.fov}
        onChange={(value) => onProp('fov', value)}
      />
    </div>
  )
}

export function CameraInspector({
  camera,
  entityNames,
  space,
  onProp,
  pixelsPerUnit,
  resolution,
}: {
  camera: SceneCameraJson | undefined
  entityNames: string[]
  /** The open scene's space: a 3D scene is edited as perspective even when it has no camera block yet. */
  space?: SceneSpace
  onProp: CameraProp
  pixelsPerUnit: number
  resolution: ResolutionSetting
}) {
  if (isPerspectiveCameraJson(camera)) return <PerspectiveCameraInspector camera={camera} onProp={onProp} />
  if (space === '3d') return <PerspectiveCameraInspector camera={undefined} onProp={onProp} />
  const cam = resolveSceneCamera(camera)
  return (
    <div className="ed-pad">
      <CameraPosition cam={cam} onProp={onProp} />
      <FramingSection cam={cam} onProp={onProp} pixelsPerUnit={pixelsPerUnit} resolution={resolution} />
      <FollowSection cam={cam} onProp={onProp} entityNames={entityNames} />
      <LimitsSection cam={cam} onProp={onProp} />
    </div>
  )
}
