import {
  sheetFrameCount,
  type ClipDef,
  type SheetCell,
  type SheetDef,
  type SheetGridParams,
} from '@waica/engine'

/** The AnimatedSprite props the animation editor works on. */
export interface AnimatedProps extends SheetGridParams {
  texture: string
  cols: number
  rows: number
  /** Explicit frame rects for the main sheet (packed sheets); wins over the grid. */
  cells?: SheetCell[]
  /** Sheets after the main texture/cols/rows one; frames continue across them. */
  extraSheets?: SheetDef[]
  clips: Record<string, ClipDef>
  initialClip?: string
  width: number
  height: number
  pixelArt?: boolean
  layer?: number
}

/** Slicing params kept only when meaningful: absent/0 means uniform grid. */
export const SLICE_KEYS = [
  'gridOffsetX',
  'gridOffsetY',
  'spacingX',
  'spacingY',
  'cellWidth',
  'cellHeight',
] as const

export function frameCount(cols: number, rows: number): number {
  return Math.max(1, Math.floor(cols)) * Math.max(1, Math.floor(rows))
}

/** All sheets in frame order: the main texture/cols/rows one, then the extras. */
export function sheetsOf(props: AnimatedProps): SheetDef[] {
  const main: SheetDef = { texture: props.texture, cols: props.cols, rows: props.rows }
  if (props.cells?.length) main.cells = props.cells
  for (const key of SLICE_KEYS) {
    if (props[key] !== undefined) main[key] = props[key]
  }
  return [main, ...(props.extraSheets ?? [])]
}

/** A valid explicit frame rect: finite, positive size. */
export function isValidCell(cell: unknown): cell is SheetCell {
  const c = cell as SheetCell | null
  return (
    !!c &&
    [c.x, c.y, c.width, c.height].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    c.x >= 0 &&
    c.y >= 0 &&
    c.width > 0 &&
    c.height > 0
  )
}

/**
 * Drops one global frame from every clip, shifting later frames down — what
 * deleting a cell (or a whole sheet's worth, via repeated calls) implies.
 */
export function dropFrame(clips: Record<string, ClipDef>, frame: number): Record<string, ClipDef> {
  const out: Record<string, ClipDef> = {}
  for (const [name, clip] of Object.entries(clips)) {
    out[name] = {
      ...clip,
      frames: clip.frames.filter((f) => f !== frame).map((f) => (f > frame ? f - 1 : f)),
    }
  }
  return out
}

/** Total frames across every sheet — the exclusive upper bound for clip frames. */
export function totalFrames(props: AnimatedProps): number {
  return sheetsOf(props).reduce((sum, sheet) => sum + sheetFrameCount(sheet), 0)
}

function sanitizeSheet(sheet: SheetDef): SheetDef {
  const out: SheetDef = {
    ...sheet,
    cols: Math.max(1, Math.floor(sheet.cols) || 1),
    rows: Math.max(1, Math.floor(sheet.rows) || 1),
  }
  if (out.cells !== undefined) {
    const cells = out.cells.filter(isValidCell)
    if (cells.length) out.cells = cells
    else delete out.cells
  }
  for (const key of SLICE_KEYS) {
    const value = out[key]
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) delete out[key]
  }
  return out
}

/**
 * Drops frames outside the sheets (after a grid shrink or sheet removal),
 * deletes clips left empty, clears a dangling initialClip, and defaults
 * initialClip to the first clip — so an animated object plays as soon as it
 * has one clip. Extra sheets without a texture are dropped.
 */
export function sanitizeAnimated(props: AnimatedProps): AnimatedProps {
  const out: AnimatedProps = { ...props }
  if (out.cells !== undefined) {
    const cells = out.cells.filter(isValidCell)
    if (cells.length) out.cells = cells
    else delete out.cells
  }
  const extras = (props.extraSheets ?? []).filter((s) => s.texture).map(sanitizeSheet)
  if (extras.length) out.extraSheets = extras
  else delete out.extraSheets
  const max = totalFrames(out)
  const clips: Record<string, ClipDef> = {}
  for (const [name, clip] of Object.entries(props.clips)) {
    const frames = clip.frames.filter((f) => Number.isInteger(f) && f >= 0 && f < max)
    if (frames.length) clips[name] = { ...clip, frames }
  }
  out.clips = clips
  const first = Object.keys(clips)[0]
  if (props.initialClip && clips[props.initialClip]) out.initialClip = props.initialClip
  else if (first) out.initialClip = first
  else delete out.initialClip
  for (const key of SLICE_KEYS) {
    const value = out[key]
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) delete out[key]
  }
  return out
}

/** Serialized AnimatedSprite props (possibly partial) → editor-complete props. */
export function toAnimatedProps(props: Record<string, unknown> | undefined): AnimatedProps {
  const p = (props ?? {}) as Partial<AnimatedProps>
  const out: AnimatedProps = {
    texture: p.texture ?? '',
    cols: p.cols ?? 1,
    rows: p.rows ?? 1,
    clips: p.clips ?? {},
    width: p.width ?? 1,
    height: p.height ?? 1,
  }
  if (Array.isArray(p.cells)) {
    const cells = p.cells.filter(isValidCell)
    if (cells.length) out.cells = cells
  }
  if (Array.isArray(p.extraSheets)) {
    const extras = p.extraSheets.filter((s) => s && typeof s.texture === 'string')
    if (extras.length) out.extraSheets = extras
  }
  if (p.initialClip !== undefined) out.initialClip = p.initialClip
  if (p.pixelArt !== undefined) out.pixelArt = p.pixelArt
  if (p.layer !== undefined) out.layer = p.layer
  for (const key of SLICE_KEYS) {
    if (p[key] !== undefined) out[key] = p[key]
  }
  return out
}

export function clipSummary(clips: Record<string, ClipDef>): string {
  const names = Object.keys(clips)
  return names.length ? names.join(' · ') : 'no clips'
}

export function uniqueClipName(clips: Record<string, ClipDef>, base: string): string {
  if (!clips[base]) return base
  let n = 2
  while (clips[`${base}-${n}`]) n++
  return `${base}-${n}`
}
