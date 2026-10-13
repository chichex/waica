import { MIN_GRID_SIZE, type GridSettings } from '../project/editor-settings'
import type { GizmoMode, GizmoSettings, SnapSteps } from './editor-view-settings'
import { NumberField } from './NumberField'

interface GridToolsProps {
  grid: GridSettings
  onGridChange: (next: GridSettings) => void
  /** A 3D scene: no 2D snap toggle (Ctrl snaps a gizmo drag), and the helpers toggle (issue #173 CA-16, CA-17). */
  threeD?: { helpers: boolean; onHelpersChange: (helpers: boolean) => void }
}

/** Grid overlay, snapping and cell size toggles over the edit viewport. */
export function ViewportGridTools({ grid, onGridChange, threeD }: GridToolsProps) {
  return (
    <div className="ed-vp-tools">
      <button
        title="Show grid"
        aria-pressed={threeD ? grid.show : undefined}
        className={grid.show ? 'is-on' : ''}
        onClick={() => onGridChange({ ...grid, show: !grid.show })}
      >
        ⊞
      </button>
      {!threeD && (
        <button
          title="Snap to grid (hold Shift to invert)"
          className={grid.snap ? 'is-on' : ''}
          onClick={() => onGridChange({ ...grid, snap: !grid.snap })}
        >
          🧲
        </button>
      )}
      <NumberField
        title="Grid cell size (world units)"
        min={MIN_GRID_SIZE}
        step={0.25}
        value={grid.size}
        onChange={(t) => {
          const size = Number(t)
          if (isFinite(size) && size >= MIN_GRID_SIZE) onGridChange({ ...grid, size })
        }}
      />
      {threeD && <HelpersToggle {...threeD} />}
    </div>
  )
}

/** 👁: the 3D helpers and icons on or off (issue #173 CA-17). */
function HelpersToggle({ helpers, onHelpersChange }: NonNullable<GridToolsProps['threeD']>) {
  return (
    <button title="Show helpers" aria-pressed={helpers} className={helpers ? 'is-on' : ''} onClick={() => onHelpersChange(!helpers)}>
      👁
    </button>
  )
}

interface NavToolsProps {
  onZoom: (factor: number) => void
  /** Present on scene viewports: jumps to the scene camera's framing (2D) or pose (3D). */
  onFrameCamera?: () => void
  /** A 3D scene: 🎥 goes to the scene camera's pose, and F frames the selection (issue #173 CA-12, CA-15). */
  onFrameSelection?: () => void
}

/** Zoom buttons and, on scene viewports, the jump to the scene camera's framing; in 3D, framing the selection. */
export function ViewportNavTools({ onZoom, onFrameCamera, onFrameSelection }: NavToolsProps) {
  const threeD = onFrameSelection !== undefined
  return (
    <div className="ed-vp-nav">
      <button title="Zoom in" onClick={() => onZoom(1 / 1.25)}>
        ＋
      </button>
      <button title="Zoom out" onClick={() => onZoom(1.25)}>
        −
      </button>
      {onFrameCamera && (
        <button title={threeD ? "Go to the scene camera's pose" : "Go to the scene camera's framing"} onClick={onFrameCamera}>
          🎥
        </button>
      )}
      {onFrameSelection && (
        <button title="Frame selection (F)" onClick={onFrameSelection}>
          F
        </button>
      )}
    </div>
  )
}

const MODE_BUTTONS: ReadonlyArray<{ mode: GizmoMode; title: string; glyph: string }> = [
  { mode: 'translate', title: 'Move (W)', glyph: '✥' },
  { mode: 'rotate', title: 'Rotate (E)', glyph: '⟳' },
  { mode: 'scale', title: 'Scale (R)', glyph: '⤢' },
]

const SNAP_FIELDS: ReadonlyArray<{ step: keyof SnapSteps; label: string; glyph: string; increment: number }> = [
  { step: 'position', label: 'Position snap step', glyph: '🧲', increment: 0.25 },
  { step: 'rotation', label: 'Rotation snap step (degrees)', glyph: '∠', increment: 5 },
  { step: 'scale', label: 'Scale snap step', glyph: '⇲', increment: 0.05 },
]

interface TransformToolsProps {
  gizmo: GizmoSettings
  onGizmoChange: (next: GizmoSettings) => void
}

/** The 3D gizmo's mode (W, E, R), its space, and the steps a drag snaps to while Ctrl is held (issue #173 CA-18, CA-20). */
export function ViewportTransformTools({ gizmo, onGizmoChange }: TransformToolsProps) {
  const other = gizmo.space === 'world' ? 'local' : 'world'
  return (
    <div className="ed-vp-tools is-transform">
      {MODE_BUTTONS.map(({ mode, title, glyph }) => (
        <button key={mode} title={title} aria-pressed={gizmo.mode === mode} className={gizmo.mode === mode ? 'is-on' : ''} onClick={() => onGizmoChange({ ...gizmo, mode })}>
          {glyph}
        </button>
      ))}
      <button className="is-wide" title={`Transform space: ${gizmo.space} (click for ${other})`} onClick={() => onGizmoChange({ ...gizmo, space: other })}>
        {gizmo.space === 'world' ? '🌐 World' : '⌖ Local'}
      </button>
      {SNAP_FIELDS.map(({ step, label, glyph, increment }) => (
        <span key={step} className="ed-vp-snap" title={`${label} (hold Ctrl while dragging)`}>
          {glyph}
          <NumberField
            aria-label={label}
            min={0}
            step={increment}
            value={gizmo.snap[step]}
            onChange={(text) => {
              const value = Number(text)
              // A step of 0 or less snaps nothing: the field keeps the last valid one.
              if (Number.isFinite(value) && value > 0) onGizmoChange({ ...gizmo, snap: { ...gizmo.snap, [step]: value } })
            }}
          />
        </span>
      ))}
    </div>
  )
}
