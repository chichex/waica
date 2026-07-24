import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ClipPlayer,
  locateFrame,
  missingClips,
  sheetCell,
  sheetFrameCount,
  type AnimationContract,
  type ClipDef,
  type SheetCell,
  type SheetDef,
} from '@waica/engine'
import {
  dropFrame,
  sanitizeAnimated,
  sheetsOf,
  totalFrames,
  uniqueClipName,
  SLICE_KEYS,
  type AnimatedProps,
} from '../project/clips'
import { NumberField } from './NumberField'
import { ArtSearchGrid } from './ArtPicker'
import { detectCellsFromUrl } from './sheet-detect'
import {
  artDisplayPath,
  collectDroppedFiles,
  IMAGE_RE,
  type ArtItem,
  type DroppedFile,
} from './use-project-art'

type SliceKey = (typeof SLICE_KEYS)[number]

/** Which sheet a picked texture lands on: an existing slot, or a new sheet. */
type PickTarget = number | 'add' | null

export interface AnimationEditorProps {
  /** Shown in the header: the prefab ref or entity name being edited. */
  title: string
  initial: AnimatedProps
  /** Required-clips checklist (characters only). */
  contract?: AnimationContract
  art: ArtItem[]
  urlFor(uri: string): string
  onImportArt(files: DroppedFile[]): Promise<void>
  onSave(next: AnimatedProps): void
  onCancel(): void
}

/**
 * Modal spritesheet/clip editor: pick or drop sheets, slice each one — by
 * uniform grid, by auto-detected transparency islands, or by hand-drawn
 * cells — and build named clips by clicking cells, previewing them live.
 * Frames number consecutively across the sheets, so clips can mix cells
 * from any of them. Pure DOM/CSS — the preview replays the engine's own
 * ClipPlayer over background-position.
 */
export function AnimationEditor({
  title,
  initial,
  contract,
  art,
  urlFor,
  onImportArt,
  onSave,
  onCancel,
}: AnimationEditorProps) {
  const [draft, setDraft] = useState<AnimatedProps>(() => structuredClone(initial))
  const [selectedClip, setSelectedClip] = useState<string | null>(
    Object.keys(initial.clips)[0] ?? null,
  )
  const [playing, setPlaying] = useState(true)
  const [previewFrame, setPreviewFrame] = useState(0)
  const [picking, setPicking] = useState<PickTarget>(null)
  const [droppingSheet, setDroppingSheet] = useState(false)
  // Each sheet image's natural pixel size, keyed by texture uri — the
  // slicing params are in these units.
  const [dims, setDims] = useState<Record<string, [number, number]>>({})
  const filePicker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Escape backs out of the picker first, then closes the modal.
      if (picking !== null && draft.texture) setPicking(null)
      else onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, picking, draft.texture])

  const sheets = sheetsOf(draft)
  const bases: number[] = []
  {
    let base = 0
    for (const sheet of sheets) {
      bases.push(base)
      base += sheetFrameCount(sheet)
    }
  }
  const max = totalFrames(draft)
  const clip = selectedClip ? draft.clips[selectedClip] : undefined
  const pixelated = draft.pixelArt !== false

  useEffect(() => {
    if (!playing || !clip || clip.frames.length === 0) return
    const player = new ClipPlayer()
    player.set(clip)
    setPreviewFrame(player.advance(0))
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      setPreviewFrame(player.advance((now - last) / 1000))
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clip])

  const patch = (p: Partial<AnimatedProps>): void => setDraft((d) => ({ ...d, ...p }))

  const patchSheet = (index: number, p: Partial<SheetDef>): void => {
    if (index === 0) {
      patch(p)
      return
    }
    setDraft((d) => {
      const extras = [...(d.extraSheets ?? [])]
      const cur = extras[index - 1]
      if (!cur) return d
      extras[index - 1] = { ...cur, ...p }
      return { ...d, extraSheets: extras }
    })
  }

  // Slicing params: any non-positive entry falls back to the default (0 /
  // auto cell), stored as undefined so saved JSON stays minimal.
  const patchSlice = (index: number, key: SliceKey, raw: string): void => {
    const value = Number(raw)
    patchSheet(index, { [key]: Number.isFinite(value) && value > 0 ? value : undefined })
  }

  /** Removes a sheet, dropping its frames from clips and shifting later ones down. */
  const removeSheet = (index: number): void =>
    setDraft((d) => {
      const defs = sheetsOf(d)
      const removed = defs[index]
      if (defs.length <= 1 || !removed) return d
      const base = defs.slice(0, index).reduce((sum, def) => sum + sheetFrameCount(def), 0)
      const count = sheetFrameCount(removed)
      const clips: Record<string, ClipDef> = {}
      for (const [name, c] of Object.entries(d.clips)) {
        const frames = c.frames
          .filter((f) => f < base || f >= base + count)
          .map((f) => (f >= base + count ? f - count : f))
        clips[name] = { ...c, frames }
      }
      const rest = defs.filter((_, i) => i !== index)
      const main = rest[0]!
      const extraSheets = rest.slice(1)
      const next: AnimatedProps = {
        ...d,
        clips,
        texture: main.texture,
        cols: main.cols,
        rows: main.rows,
        cells: main.cells,
        extraSheets: extraSheets.length ? extraSheets : undefined,
      }
      for (const key of SLICE_KEYS) next[key] = main[key]
      return next
    })

  /** Deletes one cell of a sheet, dropping its frame from every clip. */
  const deleteCell = (sheetIndex: number, cellIndex: number): void =>
    setDraft((d) => {
      const defs = sheetsOf(d)
      const sheet = defs[sheetIndex]
      if (!sheet?.cells) return d
      const base = defs
        .slice(0, sheetIndex)
        .reduce((sum, def) => sum + sheetFrameCount(def), 0)
      const cells = sheet.cells.filter((_, i) => i !== cellIndex)
      const clips = dropFrame(d.clips, base + cellIndex)
      const next = { ...d, clips }
      const patched: Partial<SheetDef> = { cells: cells.length ? cells : undefined }
      if (sheetIndex === 0) return { ...next, ...patched }
      const extras = [...(next.extraSheets ?? [])]
      extras[sheetIndex - 1] = { ...extras[sheetIndex - 1]!, ...patched }
      return { ...next, extraSheets: extras }
    })

  const patchClip = (name: string, c: Partial<ClipDef>): void =>
    setDraft((d) => {
      const cur = d.clips[name]
      return cur ? { ...d, clips: { ...d.clips, [name]: { ...cur, ...c } } } : d
    })

  const toggleFrame = (i: number): void => {
    if (!selectedClip) return
    setDraft((d) => {
      const cur = d.clips[selectedClip]
      if (!cur) return d
      const frames = cur.frames.includes(i)
        ? cur.frames.filter((f) => f !== i)
        : [...cur.frames, i]
      return { ...d, clips: { ...d.clips, [selectedClip]: { ...cur, frames } } }
    })
  }

  const removeFrameAt = (name: string, index: number): void =>
    setDraft((d) => {
      const cur = d.clips[name]
      if (!cur) return d
      const frames = cur.frames.filter((_, i) => i !== index)
      return { ...d, clips: { ...d.clips, [name]: { ...cur, frames } } }
    })

  const addClip = (): void => {
    const name = uniqueClipName(draft.clips, 'clip')
    setDraft((d) => ({ ...d, clips: { ...d.clips, [name]: { frames: [], fps: 8 } } }))
    setSelectedClip(name)
  }

  const renameClip = (from: string, to: string): void => {
    if (!to || to === from || draft.clips[to]) return
    setDraft((d) => {
      const clips: Record<string, ClipDef> = {}
      for (const [n, c] of Object.entries(d.clips)) clips[n === from ? to : n] = c
      return { ...d, clips, initialClip: d.initialClip === from ? to : d.initialClip }
    })
    setSelectedClip((s) => (s === from ? to : s))
  }

  const deleteClip = (name: string): void => {
    setDraft((d) => {
      const clips = { ...d.clips }
      delete clips[name]
      return { ...d, clips, initialClip: d.initialClip === name ? undefined : d.initialClip }
    })
    setSelectedClip((s) => (s === name ? null : s))
  }

  const chooseTexture = (uri: string): void => {
    if (picking === 'add') {
      setDraft((d) => ({
        ...d,
        extraSheets: [...(d.extraSheets ?? []), { texture: uri, cols: 1, rows: 1 }],
      }))
    } else {
      patchSheet(typeof picking === 'number' ? picking : 0, { texture: uri })
    }
    setPicking(null)
  }

  const importSheet = async (files: DroppedFile[]): Promise<void> => {
    const image = files.find((f) => IMAGE_RE.test(f.file.name))
    if (!image) return
    await onImportArt(files)
    // importArt writes to src/art/<relativePath>, so the stored uri is deterministic.
    chooseTexture(`src/art/${image.relativePath}`)
  }

  const noteDims = (uri: string, next: [number, number]): void =>
    setDims((d) => {
      const cur = d[uri]
      return cur && cur[0] === next[0] && cur[1] === next[1] ? d : { ...d, [uri]: next }
    })

  // Background-position trick: p% aligns p% of the image's overflow past the
  // box, so the cell rect (x,·,w,·) shows at position x/(imgW-w). Before the
  // image loads, fall back to plain uniform-grid percentages.
  const located = locateFrame(sheets, previewFrame)
  const previewSheet = sheets[located.sheet]
  const previewUrl = previewSheet?.texture ? urlFor(previewSheet.texture) : null
  const previewStyle: CSSProperties =
    previewSheet && previewUrl
      ? (() => {
          const base: CSSProperties = {
            backgroundImage: `url(${previewUrl})`,
            imageRendering: pixelated ? 'pixelated' : undefined,
          }
          const sheetDims = dims[previewSheet.texture]
          if (sheetDims) {
            const [imgW, imgH] = sheetDims
            const cell = sheetCell(
              imgW,
              imgH,
              previewSheet.cols,
              previewSheet.rows,
              located.frame,
              previewSheet,
            )
            const pos = (x: number, img: number, size: number): number =>
              img > size ? (x / (img - size)) * 100 : 0
            return {
              ...base,
              backgroundSize: `${(imgW / cell.width) * 100}% ${(imgH / cell.height) * 100}%`,
              backgroundPosition: `${pos(cell.x, imgW, cell.width)}% ${pos(cell.y, imgH, cell.height)}%`,
            }
          }
          const cols = Math.max(1, previewSheet.cols)
          const rows = Math.max(1, previewSheet.rows)
          const col = located.frame % cols
          const row = Math.floor(located.frame / cols)
          return {
            ...base,
            backgroundSize: `${cols * 100}% ${rows * 100}%`,
            backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${
              rows > 1 ? (row / (rows - 1)) * 100 : 0
            }%`,
          }
        })()
      : {}

  // Cell sheets vary in frame size: mimic the runtime's bottom-center anchor
  // by shrinking the preview box to the frame's share of the largest cell.
  const previewScale = (() => {
    const cells = previewSheet?.cells
    if (!cells?.length) return null
    const cell = cells[Math.min(located.frame, cells.length - 1)]!
    const maxW = Math.max(...cells.map((c) => c.width))
    const maxH = Math.max(...cells.map((c) => c.height))
    return { x: maxW > 0 ? cell.width / maxW : 1, y: maxH > 0 ? cell.height / maxH : 1 }
  })()

  const showPicker = picking !== null || !draft.texture

  return (
    <div
      className="ed-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="ed-modal">
        <header className="ed-modal-head">
          <span>Animation — {title}</span>
          <button className="ed-mini" onClick={onCancel}>
            ✕
          </button>
        </header>

        <div className="ed-modal-body">
          <div className="ed-modal-left">
            {showPicker ? (
              <div
                className={`ed-anim-picker ${droppingSheet ? 'is-dropping' : ''}`}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                  setDroppingSheet(true)
                }}
                onDragLeave={() => setDroppingSheet(false)}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  setDroppingSheet(false)
                  const dataTransfer = e.dataTransfer
                  void collectDroppedFiles(dataTransfer).then(importSheet)
                }}
              >
                <div className="ed-hint">Drop a PNG spritesheet here, or pick one:</div>
                <ArtSearchGrid art={art} onPick={chooseTexture} />
                <button className="ed-mini" onClick={() => filePicker.current?.click()}>
                  Import image…
                </button>
                {draft.texture && (
                  <button className="ed-mini" onClick={() => setPicking(null)}>
                    {picking === 'add' ? 'Cancel' : 'Keep current sheet'}
                  </button>
                )}
                <input
                  ref={filePicker}
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  hidden
                  onChange={(e) => {
                    const files = [...(e.currentTarget.files ?? [])].map((file) => ({
                      file,
                      relativePath: file.name,
                    }))
                    void importSheet(files)
                    e.currentTarget.value = ''
                  }}
                />
              </div>
            ) : (
              <>
                {sheets.map((sheet, index) => (
                  <SheetPane
                    key={index}
                    index={index}
                    sheet={sheet}
                    base={bases[index] ?? 0}
                    label={(() => {
                      const item = art.find((a) => a.uri === sheet.texture)
                      return item ? artDisplayPath(item) : sheet.texture
                    })()}
                    showTitle={sheets.length > 1}
                    canRemove={sheets.length > 1}
                    dims={dims[sheet.texture]}
                    url={urlFor(sheet.texture)}
                    pixelated={pixelated}
                    selectedClip={selectedClip}
                    clipFrames={clip?.frames ?? []}
                    onDims={noteDims}
                    onPatch={(p) => patchSheet(index, p)}
                    onPatchSlice={(key, raw) => patchSlice(index, key, raw)}
                    onChangeSheet={() => setPicking(index)}
                    onRemove={() => removeSheet(index)}
                    onToggleFrame={toggleFrame}
                    onDeleteCell={(cellIndex) => deleteCell(index, cellIndex)}
                  />
                ))}
                <button className="ed-mini ed-add-sheet" onClick={() => setPicking('add')}>
                  + add sheet
                </button>
              </>
            )}
          </div>

          <div className="ed-modal-right">
            <header className="ed-sec-head">Clips</header>
            {Object.entries(draft.clips).map(([name, c]) => (
              <div
                key={name}
                className={`ed-clip ${selectedClip === name ? 'is-active' : ''}`}
                onClick={() => setSelectedClip(name)}
              >
                <div className="ed-clip-row">
                  <input
                    className="ed-clip-name"
                    type="text"
                    defaultValue={name}
                    onBlur={(e) => renameClip(name, e.target.value.trim())}
                  />
                  <label>
                    fps
                    <NumberField
                      min={1}
                      value={c.fps}
                      onChange={(t) => patchClip(name, { fps: Math.max(1, Number(t) || 1) })}
                    />
                  </label>
                  <label>
                    loop
                    <input
                      type="checkbox"
                      checked={c.loop ?? true}
                      onChange={(e) => patchClip(name, { loop: e.target.checked })}
                    />
                  </label>
                  <button
                    className="ed-mini"
                    title="Delete clip"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteClip(name)
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="ed-clip-frames">
                  {c.frames.length === 0 && (
                    <span className="ed-hint">click sheet cells to add frames</span>
                  )}
                  {c.frames.map((f, i) => (
                    <button
                      key={`${i}.${f}`}
                      className={`ed-frame-chip ${f >= max ? 'is-invalid' : ''}`}
                      title={f >= max ? 'outside the sheets — dropped on save' : 'remove frame'}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFrameAt(name, i)
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button className="ed-mini" onClick={addClip}>
              + clip
            </button>
            <label className="ed-row">
              <span>initial clip</span>
              <select
                value={draft.initialClip ?? ''}
                onChange={(e) => patch({ initialClip: e.target.value || undefined })}
              >
                <option value="">(auto)</option>
                {Object.keys(draft.clips).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <header className="ed-sec-head">Preview</header>
            <div className="ed-checker ed-anim-preview-wrap">
              <div className="ed-anim-preview-box">
                <div
                  className="ed-anim-preview"
                  style={
                    previewScale
                      ? {
                          ...previewStyle,
                          width: `${previewScale.x * 96}px`,
                          height: `${previewScale.y * 96}px`,
                        }
                      : previewStyle
                  }
                />
              </div>
            </div>
            <button
              className="ed-mini"
              disabled={!clip || clip.frames.length === 0}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? '⏸ pause' : '▶ play'}
            </button>

            {contract && (
              <div className="ed-contract-list">
                <header className="ed-sec-head">Required clips</header>
                {contract.required.map((name) => {
                  const ok = name in draft.clips
                  return (
                    <div key={name} className="ed-row">
                      <span>{name}</span>
                      <span className={ok ? 'ed-clip-ok' : 'ed-clip-missing'}>
                        {ok ? '✓' : '✗ missing'}
                      </span>
                    </div>
                  )
                })}
                {missingClips(contract, Object.keys(draft.clips)).length > 0 && (
                  <div className="ed-hint">
                    a state without its clip keeps the previous animation at runtime
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="ed-modal-foot">
          <button className="ed-mini" onClick={onCancel}>
            Cancel
          </button>
          <button className="ed-primary" onClick={() => onSave(sanitizeAnimated(draft))}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}

/** An in-flight pointer interaction over the cell overlay (edit mode). */
type CellDrag =
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; index: number; grabX: number; grabY: number }
  | { kind: 'resize'; index: number; anchorX: number; anchorY: number }

const MIN_CELL = 3

/**
 * One sheet's slicing controls and clickable frame overlay, frames numbered
 * from `base`. Two modes: uniform grid (cols/rows + slice params) or explicit
 * cells — auto-detected from transparency and/or edited by hand (draw, move,
 * resize, delete).
 */
function SheetPane({
  index,
  sheet,
  base,
  label,
  showTitle,
  canRemove,
  dims,
  url,
  pixelated,
  selectedClip,
  clipFrames,
  onDims,
  onPatch,
  onPatchSlice,
  onChangeSheet,
  onRemove,
  onToggleFrame,
  onDeleteCell,
}: {
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
  onDims(uri: string, dims: [number, number]): void
  onPatch(p: Partial<SheetDef>): void
  onPatchSlice(key: SliceKey, raw: string): void
  onChangeSheet(): void
  onRemove(): void
  onToggleFrame(frame: number): void
  onDeleteCell(cellIndex: number): void
}) {
  const cells = sheet.cells
  const count = sheetFrameCount(sheet)
  const [editing, setEditing] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [drawBox, setDrawBox] = useState<SheetCell | null>(null)
  const drag = useRef<CellDrag | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const detect = (): void => {
    setDetecting(true)
    setDetectError(null)
    void detectCellsFromUrl(url)
      .then((found) => {
        if (found.length === 0) setDetectError('no frames found — the image has no opaque pixels')
        else onPatch({ cells: found })
      })
      .catch(() => setDetectError('could not read the image'))
      .finally(() => setDetecting(false))
  }

  /** Pointer position in image pixels, clamped to the image. */
  const toImagePx = (e: React.PointerEvent): { x: number; y: number } | null => {
    const el = sheetRef.current
    if (!el || !dims) return null
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * dims[0]
    const y = ((e.clientY - rect.top) / rect.height) * dims[1]
    return {
      x: Math.round(Math.min(Math.max(0, x), dims[0])),
      y: Math.round(Math.min(Math.max(0, y), dims[1])),
    }
  }

  const patchCellAt = (cellIndex: number, next: SheetCell): void => {
    if (!cells) return
    const copy = [...cells]
    copy[cellIndex] = next
    onPatch({ cells: copy })
  }

  const onOverlayPointerDown = (e: React.PointerEvent): void => {
    if (!editing || e.target !== e.currentTarget) return
    const p = toImagePx(e)
    if (!p) return
    drag.current = { kind: 'draw', startX: p.x, startY: p.y }
    setDrawBox({ x: p.x, y: p.y, width: 0, height: 0 })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onOverlayPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const p = toImagePx(e)
    if (!p || !dims) return
    if (d.kind === 'draw') {
      setDrawBox({
        x: Math.min(d.startX, p.x),
        y: Math.min(d.startY, p.y),
        width: Math.abs(p.x - d.startX),
        height: Math.abs(p.y - d.startY),
      })
    } else if (d.kind === 'move' && cells?.[d.index]) {
      const cell = cells[d.index]!
      patchCellAt(d.index, {
        ...cell,
        x: Math.min(Math.max(0, p.x - d.grabX), dims[0] - cell.width),
        y: Math.min(Math.max(0, p.y - d.grabY), dims[1] - cell.height),
      })
    } else if (d.kind === 'resize' && cells?.[d.index]) {
      patchCellAt(d.index, {
        x: Math.min(d.anchorX, p.x),
        y: Math.min(d.anchorY, p.y),
        width: Math.max(MIN_CELL, Math.abs(p.x - d.anchorX)),
        height: Math.max(MIN_CELL, Math.abs(p.y - d.anchorY)),
      })
    }
  }

  const onOverlayPointerUp = (): void => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'draw' && drawBox) {
      if (drawBox.width >= MIN_CELL && drawBox.height >= MIN_CELL) {
        onPatch({ cells: [...(cells ?? []), drawBox] })
      }
      setDrawBox(null)
    }
  }

  /** Routes the rest of the drag to the overlay even when the pointer leaves it. */
  const captureOnOverlay = (pointerId: number): void => {
    sheetRef.current?.querySelector('.ed-sheet-cells')?.setPointerCapture(pointerId)
  }

  const startMove = (e: React.PointerEvent, cellIndex: number): void => {
    if (!editing || !cells?.[cellIndex]) return
    e.stopPropagation()
    const p = toImagePx(e)
    if (!p) return
    const cell = cells[cellIndex]!
    drag.current = { kind: 'move', index: cellIndex, grabX: p.x - cell.x, grabY: p.y - cell.y }
    captureOnOverlay(e.pointerId)
  }

  const startResize = (e: React.PointerEvent, cellIndex: number, corner: string): void => {
    if (!cells?.[cellIndex]) return
    e.stopPropagation()
    const cell = cells[cellIndex]!
    // The dragged corner's opposite stays anchored.
    const anchorX = corner.includes('w') ? cell.x + cell.width : cell.x
    const anchorY = corner.includes('n') ? cell.y + cell.height : cell.y
    drag.current = { kind: 'resize', index: cellIndex, anchorX, anchorY }
    captureOnOverlay(e.pointerId)
  }

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

  // The overlays live in percentages of the image, so they survive the
  // pane's responsive scaling.
  const pct = (value: number, total: number): string => `${(value / total) * 100}%`
  const cellStyle = (cell: SheetCell): CSSProperties =>
    dims
      ? {
          left: pct(cell.x, dims[0]),
          top: pct(cell.y, dims[1]),
          width: pct(cell.width, dims[0]),
          height: pct(cell.height, dims[1]),
        }
      : {}

  // Grid mode's cell overlay. Without slicing params it spans the whole image.
  const overlayStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${sheet.cols}, 1fr)`,
    gridTemplateRows: `repeat(${sheet.rows}, 1fr)`,
  }
  if (dims && !cells?.length) {
    const [imgW, imgH] = dims
    const cell = sheetCell(imgW, imgH, sheet.cols, sheet.rows, 0, sheet)
    const sx = Math.max(0, sheet.spacingX ?? 0)
    const sy = Math.max(0, sheet.spacingY ?? 0)
    const regionW = sheet.cols * cell.width + (sheet.cols - 1) * sx
    const regionH = sheet.rows * cell.height + (sheet.rows - 1) * sy
    Object.assign(overlayStyle, {
      left: `${(cell.x / imgW) * 100}%`,
      top: `${(cell.y / imgH) * 100}%`,
      width: `${(regionW / imgW) * 100}%`,
      height: `${(regionH / imgH) * 100}%`,
      columnGap: `${(sx / regionW) * 100}%`,
      rowGap: `${(sy / regionH) * 100}%`,
    })
  }

  return (
    <div className="ed-sheet-section">
      {showTitle && (
        <div className="ed-sheet-title">
          <span title={label}>
            sheet {index + 1} · {label}
          </span>
          <span>
            frames {base}–{base + count - 1}
          </span>
        </div>
      )}
      {cells?.length ? (
        <div className="ed-row ed-anim-gridrow ed-sheet-cellrow">
          <span>{cells.length} cells</span>
          <button className="ed-mini" disabled={detecting} onClick={detect} title="Re-run transparency detection">
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
              setEditing(false)
              onPatch({ cells: undefined })
            }}
          >
            grid…
          </button>
          <button className="ed-mini" onClick={onChangeSheet}>
            change sheet…
          </button>
          {canRemove && (
            <button
              className="ed-mini"
              title="Remove this sheet (drops its frames from clips)"
              onClick={onRemove}
            >
              ✕
            </button>
          )}
        </div>
      ) : (
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
              disabled={!dims || detecting}
              title="Find frames by transparency — for packed sheets that don't sit on a grid"
              onClick={detect}
            >
              {detecting ? 'detecting…' : '✂ detect frames'}
            </button>
            <button className="ed-mini" onClick={onChangeSheet}>
              change sheet…
            </button>
            {canRemove && (
              <button
                className="ed-mini"
                title="Remove this sheet (drops its frames from clips)"
                onClick={onRemove}
              >
                ✕
              </button>
            )}
          </div>
          <div className="ed-row ed-anim-gridrow ed-anim-slicerow">
            <span title="Top-left corner of the first cell, in image px">offset</span>
            <NumberField
              min={0}
              step="any"
              placeholder="0"
              value={sheet.gridOffsetX ?? ''}
              onChange={(t) => onPatchSlice('gridOffsetX', t)}
            />
            <NumberField
              min={0}
              step="any"
              placeholder="0"
              value={sheet.gridOffsetY ?? ''}
              onChange={(t) => onPatchSlice('gridOffsetY', t)}
            />
            <span title="Gap between cells, in image px">gap</span>
            <NumberField
              min={0}
              step="any"
              placeholder="0"
              value={sheet.spacingX ?? ''}
              onChange={(t) => onPatchSlice('spacingX', t)}
            />
            <NumberField
              min={0}
              step="any"
              placeholder="0"
              value={sheet.spacingY ?? ''}
              onChange={(t) => onPatchSlice('spacingY', t)}
            />
            <span title="Cell size in image px — empty splits what the offset leaves up to the image's edge">
              cell
            </span>
            <NumberField
              min={0}
              step="any"
              placeholder={autoCell ? px(autoCell.width) : 'auto'}
              value={sheet.cellWidth ?? ''}
              onChange={(t) => onPatchSlice('cellWidth', t)}
            />
            <NumberField
              min={0}
              step="any"
              placeholder={autoCell ? px(autoCell.height) : 'auto'}
              value={sheet.cellHeight ?? ''}
              onChange={(t) => onPatchSlice('cellHeight', t)}
            />
          </div>
        </>
      )}
      {detectError && <div className="ed-hint ed-warn">{detectError}</div>}
      {editing && cells?.length ? (
        <div className="ed-hint">
          drag on empty space to draw a cell · drag a cell to move it · corners resize · ✕ deletes
        </div>
      ) : null}
      <div className="ed-checker ed-sheet-wrap">
        <div className="ed-sheet" ref={sheetRef}>
          <img
            src={url || undefined}
            alt={sheet.texture}
            style={{ imageRendering: pixelated ? 'pixelated' : undefined }}
            onLoad={(e) =>
              onDims(sheet.texture, [e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])
            }
          />
          {cells?.length ? (
            <div
              className={`ed-sheet-cells ${editing ? 'is-editing' : ''}`}
              onPointerDown={onOverlayPointerDown}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
            >
              {dims &&
                cells.map((cell, i) => (
                  <div
                    key={i}
                    className={`ed-sheet-cell ed-sheet-cellbox ${
                      clipFrames.includes(base + i) ? 'is-on' : ''
                    }`}
                    style={cellStyle(cell)}
                    title={
                      editing
                        ? `frame ${base + i} — drag to move`
                        : selectedClip
                          ? `frame ${base + i} — toggle in "${selectedClip}"`
                          : `frame ${base + i} — select a clip first`
                    }
                    onPointerDown={(e) => startMove(e, i)}
                    onClick={() => {
                      if (!editing) onToggleFrame(base + i)
                    }}
                  >
                    {base + i}
                    {editing && (
                      <>
                        <button
                          className="ed-cell-delete"
                          title="Delete cell"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteCell(i)
                          }}
                        >
                          ✕
                        </button>
                        {['nw', 'ne', 'sw', 'se'].map((corner) => (
                          <span
                            key={corner}
                            className={`ed-cell-handle is-${corner}`}
                            onPointerDown={(e) => startResize(e, i, corner)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                ))}
              {drawBox && <div className="ed-sheet-cellbox is-drawing" style={cellStyle(drawBox)} />}
            </div>
          ) : (
            <div className="ed-sheet-grid" style={overlayStyle}>
              {Array.from({ length: count }, (_, i) => (
                <button
                  key={i}
                  className={`ed-sheet-cell ${clipFrames.includes(base + i) ? 'is-on' : ''}`}
                  title={
                    selectedClip
                      ? `frame ${base + i} — toggle in "${selectedClip}"`
                      : `frame ${base + i} — select a clip first`
                  }
                  onClick={() => onToggleFrame(base + i)}
                >
                  {base + i}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
