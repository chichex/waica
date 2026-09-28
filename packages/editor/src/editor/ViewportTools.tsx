import { MIN_GRID_SIZE, type GridSettings } from '../project/editor-settings'
import { NumberField } from './NumberField'

interface GridToolsProps {
  grid: GridSettings
  onGridChange: (next: GridSettings) => void
}

/** Grid overlay, snapping and cell size toggles over the edit viewport. */
export function ViewportGridTools({ grid, onGridChange }: GridToolsProps) {
  return (
    <div className="ed-vp-tools">
      <button
        title="Show grid"
        className={grid.show ? 'is-on' : ''}
        onClick={() => onGridChange({ ...grid, show: !grid.show })}
      >
        ⊞
      </button>
      <button
        title="Snap to grid (hold Shift to invert)"
        className={grid.snap ? 'is-on' : ''}
        onClick={() => onGridChange({ ...grid, snap: !grid.snap })}
      >
        🧲
      </button>
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
    </div>
  )
}

interface NavToolsProps {
  onZoom: (factor: number) => void
  /** Present on scene viewports: jumps to the scene camera's framing. */
  onFrameCamera?: () => void
}

/** Zoom buttons and, on scene viewports, the jump to the scene camera's framing. */
export function ViewportNavTools({ onZoom, onFrameCamera }: NavToolsProps) {
  return (
    <div className="ed-vp-nav">
      <button title="Zoom in" onClick={() => onZoom(1 / 1.25)}>
        ＋
      </button>
      <button title="Zoom out" onClick={() => onZoom(1.25)}>
        −
      </button>
      {onFrameCamera && (
        <button title="Go to the scene camera's framing" onClick={onFrameCamera}>
          🎥
        </button>
      )}
    </div>
  )
}
