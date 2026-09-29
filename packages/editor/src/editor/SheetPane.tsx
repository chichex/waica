import { useRef, useState, type CSSProperties } from 'react'
import { sheetCell, sheetFrameCount, type SheetDef } from '@waica/engine'
import type { SliceKey } from './animation-draft'
import { NumberField } from './NumberField'
import { SheetCellsOverlay } from './SheetCellsOverlay'
import { detectCellsFromUrl } from './sheet-detect'

interface SheetPaneProps {
  index: number
  sheet: SheetDef
  /** Global index of this sheet's first frame. */
  base: number
  label: string
  showTitle: boolean
  canRemove: boolean
  dims: [number, number] | undefined
  url: string
  pixelated: boolean
  selectedClip: string | null
  clipFrames: number[]
  onDims: (uri: string, dims: [number, number]) => void
  onPatch: (p: Partial<SheetDef>) => void
  onPatchSlice: (key: SliceKey, raw: string) => void
  onChangeSheet: () => void
  onRemove: () => void
  onToggleFrame: (frame: number) => void
  onDeleteCell: (cellIndex: number) => void
}

/**
 * One sheet's slicing controls and clickable frame overlay, frames numbered
 * from `base`. Two modes: uniform grid (cols/rows + slice params) or explicit
 * cells — auto-detected from transparency and/or edited by hand (draw, move,
 * resize, delete).
 */
export function SheetPane(props: SheetPaneProps) {
  const cells = props.sheet.cells
  const [editing, setEditing] = useState(false)
  const detection = useSheetDetection(props.url, props.onPatch)

  return (
    <div className="ed-sheet-section">
      {props.showTitle && (
        <div className="ed-sheet-title">
          <span title={props.label}>
            sheet {props.index + 1} · {props.label}
          </span>
          <span>
            frames {props.base}–{props.base + sheetFrameCount(props.sheet) - 1}
          </span>
        </div>
      )}
      {cells?.length ? (
        <CellModeControls
          pane={props}
          cellCount={cells.length}
          detection={detection}
          editing={editing}
          setEditing={setEditing}
        />
      ) : (
        <GridModeControls pane={props} detection={detection} />
      )}
      {detection.error && <div className="ed-hint ed-warn">{detection.error}</div>}
      {editing && cells?.length ? (
        <div className="ed-hint">
          drag on empty space to draw a cell · drag a cell to move it · corners resize · ✕ deletes
        </div>
      ) : null}
      <SheetImage pane={props} editing={editing} />
    </div>
  )
}

/** The sheet's image with its frame overlay: explicit cells, or the uniform grid. */
function SheetImage({ pane, editing }: { pane: SheetPaneProps; editing: boolean }) {
  const { sheet, url } = pane
  const sheetRef = useRef<HTMLDivElement>(null)
  return (
    <div className="ed-checker ed-sheet-wrap">
      <div className="ed-sheet" ref={sheetRef}>
        <img
          src={url || undefined}
          alt={sheet.texture}
          style={{ imageRendering: pane.pixelated ? 'pixelated' : undefined }}
          onLoad={(e) => pane.onDims(sheet.texture, [e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
        />
        {sheet.cells?.length ? (
          <SheetCellsOverlay
            cells={sheet.cells}
            dims={pane.dims}
            editing={editing}
            sheetRef={sheetRef}
            base={pane.base}
            selectedClip={pane.selectedClip}
            clipFrames={pane.clipFrames}
            onCells={(next) => pane.onPatch({ cells: next })}
            onToggleFrame={pane.onToggleFrame}
            onDeleteCell={pane.onDeleteCell}
          />
        ) : (
          <SheetGridOverlay pane={pane} count={sheetFrameCount(sheet)} />
        )}
      </div>
    </div>
  )
}

interface SheetDetection {
  detecting: boolean
  error: string | null
  detect: () => void
}

/** Transparency detection of a packed sheet's frames, stored as its cells. */
function useSheetDetection(url: string, onPatch: (p: Partial<SheetDef>) => void): SheetDetection {
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detect = (): void => {
    setDetecting(true)
    setError(null)
    void detectCellsFromUrl(url)
      .then((found) => {
        if (found.length === 0) setError('no frames found — the image has no opaque pixels')
        else onPatch({ cells: found })
      })
      .catch(() => setError('could not read the image'))
      .finally(() => setDetecting(false))
  }
  return { detecting, error, detect }
}

/** The change-sheet and (with several sheets) remove buttons both slicing modes end with. */
function SheetActions({ pane }: { pane: SheetPaneProps }) {
  return (
    <>
      <button className="ed-mini" onClick={pane.onChangeSheet}>
        change sheet…
      </button>
      {pane.canRemove && (
        <button
          className="ed-mini"
          title="Remove this sheet (drops its frames from clips)"
          onClick={pane.onRemove}
        >
          ✕
        </button>
      )}
    </>
  )
}

interface CellModeControlsProps {
  pane: SheetPaneProps
  cellCount: number
  detection: SheetDetection
  editing: boolean
  setEditing: (update: (editing: boolean) => boolean) => void
}

/** Cells mode: the cell count, re-detect, hand editing, and the way back to a grid. */
function CellModeControls({ pane, cellCount, detection, editing, setEditing }: CellModeControlsProps) {
  return (
    <div className="ed-row ed-anim-gridrow ed-sheet-cellrow">
      <span>{cellCount} cells</span>
      <button
        className="ed-mini"
        disabled={detection.detecting}
        onClick={detection.detect}
        title="Re-run transparency detection"
      >
        ↻ re-detect
      </button>
      <button
        className={`ed-mini ${editing ? 'is-active' : ''}`}
        title="Draw, move, resize or delete cells by hand"
        onClick={() => setEditing((v) => !v)}
      >
        ✎ edit cells
      </button>
      <button
        className="ed-mini"
        title="Back to uniform grid slicing (drops the cells)"
        onClick={() => {
          setEditing(() => false)
          pane.onPatch({ cells: undefined })
        }}
      >
        grid…
      </button>
      <SheetActions pane={pane} />
    </div>
  )
}

/** Grid mode: cols × rows, frame detection, and the slicing params row. */
function GridModeControls({ pane, detection }: { pane: SheetPaneProps; detection: SheetDetection }) {
  const { sheet, onPatch } = pane
  return (
    <>
      <div className="ed-row ed-anim-gridrow">
        <span>grid</span>
        <NumberField
          min={1}
          step={1}
          value={sheet.cols}
          onChange={(t) => onPatch({ cols: Math.max(1, Math.floor(Number(t) || 1)) })}
        />
        <span>×</span>
        <NumberField
          min={1}
          step={1}
          value={sheet.rows}
          onChange={(t) => onPatch({ rows: Math.max(1, Math.floor(Number(t) || 1)) })}
        />
        <button
          className="ed-mini"
          disabled={!pane.dims || detection.detecting}
          title="Find frames by transparency — for packed sheets that don't sit on a grid"
          onClick={detection.detect}
        >
          {detection.detecting ? 'detecting…' : '✂ detect frames'}
        </button>
        <SheetActions pane={pane} />
      </div>
      <SliceParamsRow sheet={sheet} dims={pane.dims} onPatchSlice={pane.onPatchSlice} />
    </>
  )
}

interface SliceParamsRowProps {
  sheet: SheetDef
  dims: [number, number] | undefined
  onPatchSlice: (key: SliceKey, raw: string) => void
}

/** Offset, gap and cell size in image px; empty fields use the defaults they show as placeholders. */
function SliceParamsRow({ sheet, dims, onPatchSlice }: SliceParamsRowProps) {
  // What an empty cell input resolves to — shown as its placeholder so the
  // auto split is visible (it assumes the grid runs to the image's edge).
  const autoCell = dims
    ? sheetCell(dims[0], dims[1], sheet.cols, sheet.rows, 0, {
        ...sheet,
        cells: undefined,
        cellWidth: undefined,
        cellHeight: undefined,
      })
    : null
  const px = (value: number): string => `${Math.round(value * 10) / 10}`
  const field = (key: SliceKey, placeholder: string) => (
    <NumberField
      min={0}
      step="any"
      placeholder={placeholder}
      value={sheet[key] ?? ''}
      onChange={(t) => onPatchSlice(key, t)}
    />
  )

  return (
    <div className="ed-row ed-anim-gridrow ed-anim-slicerow">
      <span title="Top-left corner of the first cell, in image px">offset</span>
      {field('gridOffsetX', '0')}
      {field('gridOffsetY', '0')}
      <span title="Gap between cells, in image px">gap</span>
      {field('spacingX', '0')}
      {field('spacingY', '0')}
      <span title="Cell size in image px — empty splits what the offset leaves up to the image's edge">cell</span>
      {field('cellWidth', autoCell ? px(autoCell.width) : 'auto')}
      {field('cellHeight', autoCell ? px(autoCell.height) : 'auto')}
    </div>
  )
}

/** Grid mode's frame toggles, laid over the sliced region (the whole image without slicing params). */
function SheetGridOverlay({ pane, count }: { pane: SheetPaneProps; count: number }) {
  const { base, clipFrames, selectedClip } = pane
  return (
    <div className="ed-sheet-grid" style={gridOverlayStyle(pane.sheet, pane.dims)}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={clipFrames.includes(base + i)}
          className={`ed-sheet-cell ${clipFrames.includes(base + i) ? 'is-on' : ''}`}
          title={
            selectedClip
              ? `frame ${base + i} — toggle in "${selectedClip}"`
              : `frame ${base + i} — select a clip first`
          }
          onClick={() => pane.onToggleFrame(base + i)}
        >
          {base + i}
        </button>
      ))}
    </div>
  )
}

/** The grid overlay's CSS grid, placed over the region the slicing params cut once the image size is known. */
function gridOverlayStyle(sheet: SheetDef, dims: [number, number] | undefined): CSSProperties {
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${sheet.cols}, 1fr)`,
    gridTemplateRows: `repeat(${sheet.rows}, 1fr)`,
  }
  if (!dims) return style
  const [imgW, imgH] = dims
  const cell = sheetCell(imgW, imgH, sheet.cols, sheet.rows, 0, sheet)
  const sx = Math.max(0, sheet.spacingX ?? 0)
  const sy = Math.max(0, sheet.spacingY ?? 0)
  const regionW = sheet.cols * cell.width + (sheet.cols - 1) * sx
  const regionH = sheet.rows * cell.height + (sheet.rows - 1) * sy
  return {
    ...style,
    left: `${(cell.x / imgW) * 100}%`,
    top: `${(cell.y / imgH) * 100}%`,
    width: `${(regionW / imgW) * 100}%`,
    height: `${(regionH / imgH) * 100}%`,
    columnGap: `${(sx / regionW) * 100}%`,
    rowGap: `${(sy / regionH) * 100}%`,
  }
}
