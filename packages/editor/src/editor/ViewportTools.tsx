import { MIN_GRID_SIZE, type GridSettings } from '../project/editor-settings'
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

/** 👁: the 3D helpers on or off (the icons stay: they pick lights and the camera) (issue #173 CA-17). */
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
