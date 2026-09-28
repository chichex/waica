import { useEffect, useState, type CSSProperties } from 'react'
import { ClipPlayer, locateFrame, sheetCell, type ClipDef, type SheetDef } from '@waica/engine'

interface ClipPreviewProps {
  sheets: SheetDef[]
  /** The selected clip; nothing plays without one (or without frames). */
  clip: ClipDef | undefined
  /** Natural pixel size per sheet texture, once its image has loaded. */
  dims: Record<string, [number, number]>
  urlFor: (uri: string) => string
  pixelated: boolean
}

/**
 * The live preview of the selected clip: the engine's own ClipPlayer
 * replayed over background-position, with play/pause.
 */
export function ClipPreview({ sheets, clip, dims, urlFor, pixelated }: ClipPreviewProps) {
  const [playing, setPlaying] = useState(true)
  const previewFrame = useClipPlayback(playing ? clip : undefined)
  const located = locateFrame(sheets, previewFrame)
  const sheet = sheets[located.sheet]
  const style = sheet?.texture
    ? frameStyle(sheet, located.frame, { dims: dims[sheet.texture], url: urlFor(sheet.texture), pixelated })
    : {}
  const scale = frameScale(sheet, located.frame)

  return (
    <>
      <header className="ed-sec-head">Preview</header>
      <div className="ed-checker ed-anim-preview-wrap">
        <div className="ed-anim-preview-box">
          <div
            className="ed-anim-preview"
            style={scale ? { ...style, width: `${scale.x * 96}px`, height: `${scale.y * 96}px` } : style}
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
    </>
  )
}

/** The frame a clip shows now, advanced every animation frame while `clip` is given. */
function useClipPlayback(clip: ClipDef | undefined): number {
  const [previewFrame, setPreviewFrame] = useState(0)
  useEffect(() => {
    if (!clip || clip.frames.length === 0) return
    const player = new ClipPlayer()
    player.set(clip)
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      setPreviewFrame(player.advance((now - last) / 1000))
      last = now
      raf = requestAnimationFrame(tick)
    }
    // The clip restarts on the first animation frame, then advances per frame.
    raf = requestAnimationFrame((now) => {
      setPreviewFrame(player.advance(0))
      last = now
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [clip])
  return previewFrame
}

/** How a sheet's image is shown: its loaded size (if known), URL and scaling. */
interface SheetImage {
  dims: [number, number] | undefined
  url: string
  pixelated: boolean
}

/**
 * Background-position trick: p% aligns p% of the image's overflow past the
 * box, so the cell rect (x,·,w,·) shows at position x/(imgW-w). Before the
 * image loads, fall back to plain uniform-grid percentages.
 */
function frameStyle(sheet: SheetDef, frame: number, image: SheetImage): CSSProperties {
  const { dims: sheetDims, url, pixelated } = image
  if (!url) return {}
  const base: CSSProperties = {
    backgroundImage: `url(${url})`,
    imageRendering: pixelated ? 'pixelated' : undefined,
  }
  if (sheetDims) {
    const [imgW, imgH] = sheetDims
    const cell = sheetCell(imgW, imgH, sheet.cols, sheet.rows, frame, sheet)
    const pos = (x: number, img: number, size: number): number => (img > size ? (x / (img - size)) * 100 : 0)
    return {
      ...base,
      backgroundSize: `${(imgW / cell.width) * 100}% ${(imgH / cell.height) * 100}%`,
      backgroundPosition: `${pos(cell.x, imgW, cell.width)}% ${pos(cell.y, imgH, cell.height)}%`,
    }
  }
  const cols = Math.max(1, sheet.cols)
  const rows = Math.max(1, sheet.rows)
  const col = frame % cols
  const row = Math.floor(frame / cols)
  return {
    ...base,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
  }
}

/**
 * Cell sheets vary in frame size: mimic the runtime's bottom-center anchor
 * by shrinking the preview box to the frame's share of the largest cell.
 */
function frameScale(sheet: SheetDef | undefined, frame: number): { x: number; y: number } | null {
  const cells = sheet?.cells
  if (!cells?.length) return null
  const cell = cells[Math.min(frame, cells.length - 1)]
  if (!cell) throw new Error('locateFrame returned a frame outside the preview sheet')
  const maxW = Math.max(...cells.map((c) => c.width))
  const maxH = Math.max(...cells.map((c) => c.height))
  return { x: maxW > 0 ? cell.width / maxW : 1, y: maxH > 0 ? cell.height / maxH : 1 }
}
