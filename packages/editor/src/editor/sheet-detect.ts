import type { SheetCell } from '@waica/engine'

/**
 * Auto-slicing for packed spritesheets: frames separated by transparency
 * become explicit cells, replacing the uniform grid. Pure logic over an
 * alpha map so it's testable; the canvas reading lives in detectCellsFromUrl.
 */

export interface AlphaMap {
  width: number
  height: number
  /** Row-major alpha bytes (0-255), width×height entries. */
  alpha: Uint8Array | Uint8ClampedArray
}

/** Alpha above this counts as content — soft shadows below it split frames. */
const THRESHOLD = 8
/** Islands smaller than this on either axis are export dust, not frames. */
const MIN_SIZE = 3
/** Breathing room around each tight box, so soft anti-aliased edges stay in. */
const PADDING = 2

/** Contiguous true-runs of a profile: [start, end) pairs. */
function runs(profile: boolean[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start = -1
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] && start < 0) start = i
    else if (!profile[i] && start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  if (start >= 0) out.push([start, profile.length])
  return out
}

/**
 * Pads a tight box by PADDING on every side, clamped to the image and pulled
 * back wherever the expansion would swallow another frame's content.
 */
function padBox(box: SheetCell, others: SheetCell[], width: number, height: number): SheetCell {
  let x0 = Math.max(0, box.x - PADDING)
  let y0 = Math.max(0, box.y - PADDING)
  let x1 = Math.min(width, box.x + box.width + PADDING)
  let y1 = Math.min(height, box.y + box.height + PADDING)
  for (const o of others) {
    if (o === box) continue
    const ox1 = o.x + o.width
    const oy1 = o.y + o.height
    if (x0 >= ox1 || x1 <= o.x || y0 >= oy1 || y1 <= o.y) continue
    if (box.x >= ox1) x0 = Math.max(x0, ox1)
    else if (box.x + box.width <= o.x) x1 = Math.min(x1, o.x)
    if (box.y >= oy1) y0 = Math.max(y0, oy1)
    else if (box.y + box.height <= o.y) y1 = Math.min(y1, o.y)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Snaps a band of near-uniform-pitch frames to equal-size boxes at exact
 * pitch. Tight boxes hug each frame's content, but hand-animated wobble moves
 * that content a pixel or two between frames — centering every box on its own
 * content erases the drawn positions and the sprite vibrates. When content
 * centers sit on a constant pitch (the sheet is a grid in disguise), equal
 * boxes on that pitch keep the quad size constant and the wobble where the
 * artist drew it. Returns null when the band isn't uniform (truly packed).
 */
function stabilizeBand(
  boxes: SheetCell[],
  width: number,
  height: number,
): SheetCell[] | null {
  if (boxes.length < 2) return null
  const centers = boxes.map((b) => b.x + b.width / 2)
  const n = boxes.length
  const pitch = (centers[n - 1]! - centers[0]!) / (n - 1)
  if (pitch <= 0) return null
  const tolerance = Math.max(2, pitch * 0.1)
  const fitted = centers.map((_, i) => centers[0]! + i * pitch)
  if (centers.some((c, i) => Math.abs(c - fitted[i]!) > tolerance)) return null
  // The equal width: fits every frame's content (plus padding), but never
  // reaches into a neighbour's content.
  let half = 0
  boxes.forEach((b, i) => {
    half = Math.max(half, fitted[i]! - b.x, b.x + b.width - fitted[i]!)
  })
  let boxWidth = 2 * half + 2 * PADDING
  for (let i = 0; i < n - 1; i++) {
    boxWidth = Math.min(boxWidth, 2 * (boxes[i + 1]!.x - fitted[i]!))
    boxWidth = Math.min(boxWidth, 2 * (fitted[i + 1]! - (boxes[i]!.x + boxes[i]!.width)))
  }
  if (boxWidth < 2 * half) return null
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - PADDING)
  const bottom = Math.min(height, Math.max(...boxes.map((b) => b.y + b.height)) + PADDING)
  return boxes.map((_, i) => ({
    x: Math.min(width - boxWidth, Math.max(0, fitted[i]! - boxWidth / 2)),
    y: top,
    width: boxWidth,
    height: bottom - top,
  }))
}

/**
 * Finds frame rects by transparency: fully transparent rows split the image
 * into bands, fully transparent columns split each band into frames, and each
 * frame tightens vertically to its own content. Bands whose frames sit on a
 * uniform pitch snap to equal-size boxes (see stabilizeBand); packed bands
 * keep per-frame boxes with a little padding so soft edges aren't clipped.
 * Ordered top-to-bottom then left-to-right — the row-major numbering a grid
 * would give. Frames that touch pixel-to-pixel come out fused (that's what
 * manual cell editing is for).
 */
export function detectCells(map: AlphaMap): SheetCell[] {
  const { width, height, alpha } = map
  const solid = (x: number, y: number): boolean => (alpha[y * width + x] ?? 0) > THRESHOLD
  const rowFilled: boolean[] = []
  for (let y = 0; y < height; y++) {
    let filled = false
    for (let x = 0; x < width && !filled; x++) filled = solid(x, y)
    rowFilled.push(filled)
  }
  const bands: SheetCell[][] = []
  for (const [y0, y1] of runs(rowFilled)) {
    const colFilled: boolean[] = []
    for (let x = 0; x < width; x++) {
      let filled = false
      for (let y = y0; y < y1 && !filled; y++) filled = solid(x, y)
      colFilled.push(filled)
    }
    const boxes: SheetCell[] = []
    for (const [x0, x1] of runs(colFilled)) {
      let top = y1
      let bottom = y0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (solid(x, y)) {
            if (y < top) top = y
            if (y + 1 > bottom) bottom = y + 1
            break
          }
        }
      }
      const w = x1 - x0
      const h = bottom - top
      if (w >= MIN_SIZE && h >= MIN_SIZE) boxes.push({ x: x0, y: top, width: w, height: h })
    }
    if (boxes.length) bands.push(boxes)
  }
  const allTight = bands.flat()
  const out: SheetCell[] = []
  for (const boxes of bands) {
    const stabilized = stabilizeBand(boxes, width, height)
    if (stabilized) out.push(...stabilized)
    else out.push(...boxes.map((box) => padBox(box, allTight, width, height)))
  }
  return out
}

/** Draws the image to a canvas and runs detectCells over its alpha channel. */
export async function detectCellsFromUrl(url: string): Promise<SheetCell[]> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`could not load ${url}`))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const alpha = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!
  return detectCells({ width: canvas.width, height: canvas.height, alpha })
}
