import { useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import type { SheetCell } from '@waica/engine'
import {
  cellBoxStyle,
  drawnBox,
  imagePoint,
  MIN_CELL,
  movedCell,
  resizeDrag,
  resizedCell,
  type CellDrag,
  type ImagePoint,
} from './cell-drag'

interface CellEditingOptions {
  cells: SheetCell[]
  dims: [number, number] | undefined
  editing: boolean
  /** The sheet element the image fills: pointer positions are measured against it. */
  sheetRef: RefObject<HTMLDivElement | null>
  onCells: (cells: SheetCell[]) => void
}

/** The pointer's position in image pixels over `sheet`, once the image size is known. */
function pointerOnSheet(
  e: PointerEvent,
  sheet: HTMLElement | null,
  dims: [number, number] | undefined,
): ImagePoint | null {
  return sheet && dims ? imagePoint(e, sheet.getBoundingClientRect(), dims) : null
}

/**
 * Draw, move and resize drags over the cell overlay (`overlayRef`), committed
 * through `onCells`; the box being drawn is shown until the drag ends.
 */
function useCellEditing(
  { cells, dims, editing, sheetRef, onCells }: CellEditingOptions,
  overlayRef: RefObject<HTMLDivElement | null>,
) {
  const [drawBox, setDrawBox] = useState<SheetCell | null>(null)
  const drag = useRef<CellDrag | null>(null)

  const dragTo = (d: CellDrag, p: ImagePoint, imageDims: [number, number]): void => {
    if (d.kind === 'draw') {
      setDrawBox(drawnBox({ x: d.startX, y: d.startY }, p))
      return
    }
    const cell = cells[d.index]
    if (!cell) return
    const next =
      d.kind === 'move'
        ? movedCell(cell, { x: p.x - d.grabX, y: p.y - d.grabY }, imageDims)
        : resizedCell({ x: d.anchorX, y: d.anchorY }, p)
    onCells(cells.map((c, i) => (i === d.index ? next : c)))
  }
  /** Routes the rest of the drag to the overlay even when the pointer leaves it. */
  const startDrag = (pointerId: number, next: CellDrag): void => {
    drag.current = next
    overlayRef.current?.setPointerCapture(pointerId)
  }

  return {
    drawBox,
    onPointerDown: (e: PointerEvent): void => {
      if (!editing || e.target !== e.currentTarget) return
      const p = pointerOnSheet(e, sheetRef.current, dims)
      if (!p) return
      drag.current = { kind: 'draw', startX: p.x, startY: p.y }
      setDrawBox({ x: p.x, y: p.y, width: 0, height: 0 })
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent): void => {
      const p = drag.current && pointerOnSheet(e, sheetRef.current, dims)
      if (drag.current && p && dims) dragTo(drag.current, p, dims)
    },
    onPointerUp: (): void => {
      const d = drag.current
      drag.current = null
      if (d?.kind !== 'draw' || !drawBox) return
      if (drawBox.width >= MIN_CELL && drawBox.height >= MIN_CELL) onCells([...cells, drawBox])
      setDrawBox(null)
    },
    startMove: (e: PointerEvent, cellIndex: number): void => {
      const cell = cells[cellIndex]
      if (!editing || !cell) return
      e.stopPropagation()
      const p = pointerOnSheet(e, sheetRef.current, dims)
      if (p) startDrag(e.pointerId, { kind: 'move', index: cellIndex, grabX: p.x - cell.x, grabY: p.y - cell.y })
    },
    startResize: (e: PointerEvent, cellIndex: number, corner: string): void => {
      const cell = cells[cellIndex]
      if (!cell) return
      e.stopPropagation()
      startDrag(e.pointerId, resizeDrag(cellIndex, cell, corner))
    },
  }
}

interface SheetCellsOverlayProps extends CellEditingOptions {
  /** Global index of the sheet's first frame. */
  base: number
  selectedClip: string | null
  clipFrames: number[]
  onToggleFrame: (frame: number) => void
  onDeleteCell: (cellIndex: number) => void
}

/**
 * The explicit cells of a packed sheet over its image: frame toggles
 * normally; in edit mode, cells to draw, move, resize and delete by hand.
 */
export function SheetCellsOverlay(props: SheetCellsOverlayProps) {
  const { cells, dims, editing, base } = props
  const overlayRef = useRef<HTMLDivElement>(null)
  const edit = useCellEditing(props, overlayRef)
  return (
    <div
      ref={overlayRef}
      className={`ed-sheet-cells ${editing ? 'is-editing' : ''}`}
      onPointerDown={edit.onPointerDown}
      onPointerMove={edit.onPointerMove}
      onPointerUp={edit.onPointerUp}
    >
      {dims &&
        cells.map((cell, i) => (
          <CellBox
            key={i}
            frame={base + i}
            style={cellBoxStyle(cell, dims)}
            on={props.clipFrames.includes(base + i)}
            editing={editing}
            selectedClip={props.selectedClip}
            onToggle={() => props.onToggleFrame(base + i)}
            onDelete={() => props.onDeleteCell(i)}
            onMoveStart={(e) => edit.startMove(e, i)}
            onResizeStart={(e, corner) => edit.startResize(e, i, corner)}
          />
        ))}
      {edit.drawBox && <div className="ed-sheet-cellbox is-drawing" style={cellBoxStyle(edit.drawBox, dims)} />}
    </div>
  )
}

interface CellBoxProps {
  frame: number
  style: CSSProperties
  /** The selected clip uses this frame. */
  on: boolean
  editing: boolean
  selectedClip: string | null
  onToggle: () => void
  onDelete: () => void
  onMoveStart: (e: PointerEvent) => void
  onResizeStart: (e: PointerEvent, corner: string) => void
}

/** One cell: a frame toggle filling it, or — in edit mode — its number, delete and resize corners. */
function CellBox({ frame, style, on, editing, selectedClip, ...handlers }: CellBoxProps) {
  const title = editing
    ? `frame ${frame} — drag to move`
    : selectedClip
      ? `frame ${frame} — toggle in "${selectedClip}"`
      : `frame ${frame} — select a clip first`
  return (
    <div
      className={`ed-sheet-cell ed-sheet-cellbox ${on ? 'is-on' : ''}`}
      style={style}
      title={title}
      onPointerDown={handlers.onMoveStart}
    >
      {!editing && (
        // Filling the cell: a keyboard-operable frame toggle.
        <button type="button" className="ed-sheet-cell-toggle" aria-pressed={on} onClick={handlers.onToggle}>
          {frame}
        </button>
      )}
      {editing && (
        <>
          {frame}
          <CellEditHandles onDelete={handlers.onDelete} onResizeStart={handlers.onResizeStart} />
        </>
      )}
    </div>
  )
}

/** A cell's hand-editing controls: delete, and a resize handle per corner. */
function CellEditHandles({
  onDelete,
  onResizeStart,
}: {
  onDelete: () => void
  onResizeStart: (e: PointerEvent, corner: string) => void
}) {
  return (
    <>
      <button
        className="ed-cell-delete"
        title="Delete cell"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        ✕
      </button>
      {['nw', 'ne', 'sw', 'se'].map((corner) => (
        <span
          key={corner}
          className={`ed-cell-handle is-${corner}`}
          onPointerDown={(e) => onResizeStart(e, corner)}
        />
      ))}
    </>
  )
}
