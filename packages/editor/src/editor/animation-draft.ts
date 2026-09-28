import { sheetFrameCount, type ClipDef, type SheetDef } from '@waica/engine'
import { dropFrame, sheetsOf, SLICE_KEYS, type AnimatedProps } from '../project/clips'

/**
 * The AnimationEditor's edits as pure transforms of its draft: sheets
 * (patch, add, remove, delete a cell) and clips (patch, frames, rename,
 * delete). Frames number consecutively across sheets, so every sheet edit
 * that removes frames also renumbers the clips that use later ones.
 */

export type SliceKey = (typeof SLICE_KEYS)[number]

/** Global index of each sheet's first frame. */
export function sheetBases(sheets: SheetDef[]): number[] {
  const bases: number[] = []
  let base = 0
  for (const sheet of sheets) {
    bases.push(base)
    base += sheetFrameCount(sheet)
  }
  return bases
}

/** Patches sheet `index`: 0 is the draft's own main sheet, later ones are extraSheets. */
export function patchSheet(d: AnimatedProps, index: number, p: Partial<SheetDef>): AnimatedProps {
  if (index === 0) return { ...d, ...p }
  const extras = [...(d.extraSheets ?? [])]
  const cur = extras[index - 1]
  if (!cur) return d
  extras[index - 1] = { ...cur, ...p }
  return { ...d, extraSheets: extras }
}

/**
 * The patch for one slicing param typed as `raw`: any non-positive entry
 * falls back to the default (0 / auto cell), stored as undefined so saved
 * JSON stays minimal.
 */
export function slicePatch(key: SliceKey, raw: string): Partial<SheetDef> {
  const value = Number(raw)
  return { [key]: Number.isFinite(value) && value > 0 ? value : undefined }
}

/** Appends a new 1×1 sheet showing `texture`. */
export function addSheet(d: AnimatedProps, texture: string): AnimatedProps {
  return { ...d, extraSheets: [...(d.extraSheets ?? []), { texture, cols: 1, rows: 1 }] }
}

/** Removes a sheet, dropping its frames from clips and shifting later ones down. */
export function removeSheet(d: AnimatedProps, index: number): AnimatedProps {
  const defs = sheetsOf(d)
  const removed = defs[index]
  // The first remaining sheet becomes the main one; a lone sheet has none.
  const [main, ...extraSheets] = defs.filter((_, i) => i !== index)
  if (!removed || !main) return d
  const base = defs.slice(0, index).reduce((sum, def) => sum + sheetFrameCount(def), 0)
  const count = sheetFrameCount(removed)
  const clips: Record<string, ClipDef> = {}
  for (const [name, c] of Object.entries(d.clips)) {
    const frames = c.frames
      .filter((f) => f < base || f >= base + count)
      .map((f) => (f >= base + count ? f - count : f))
    clips[name] = { ...c, frames }
  }
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
}

/** Deletes one cell of a sheet, dropping its frame from every clip. */
export function deleteCell(d: AnimatedProps, sheetIndex: number, cellIndex: number): AnimatedProps {
  const defs = sheetsOf(d)
  const sheet = defs[sheetIndex]
  if (!sheet?.cells) return d
  const base = defs.slice(0, sheetIndex).reduce((sum, def) => sum + sheetFrameCount(def), 0)
  const cells = sheet.cells.filter((_, i) => i !== cellIndex)
  const clips = dropFrame(d.clips, base + cellIndex)
  const next = { ...d, clips }
  const patched: Partial<SheetDef> = { cells: cells.length ? cells : undefined }
  if (sheetIndex === 0) return { ...next, ...patched }
  const extras = [...(next.extraSheets ?? [])]
  // sheetsOf lists extraSheets as-is after the main sheet, so `sheet` is extras[sheetIndex - 1].
  extras[sheetIndex - 1] = { ...sheet, ...patched }
  return { ...next, extraSheets: extras }
}

/** Patches one clip; an unknown clip leaves the draft unchanged. */
export function patchClip(d: AnimatedProps, name: string, c: Partial<ClipDef>): AnimatedProps {
  const cur = d.clips[name]
  return cur ? { ...d, clips: { ...d.clips, [name]: { ...cur, ...c } } } : d
}

/** Adds frame `frame` to the clip, or removes it when the clip already uses it. */
export function toggleFrame(d: AnimatedProps, name: string, frame: number): AnimatedProps {
  const cur = d.clips[name]
  if (!cur) return d
  const frames = cur.frames.includes(frame) ? cur.frames.filter((f) => f !== frame) : [...cur.frames, frame]
  return { ...d, clips: { ...d.clips, [name]: { ...cur, frames } } }
}

/** Removes the clip's frame at position `index` (a clip may repeat a frame). */
export function removeFrameAt(d: AnimatedProps, name: string, index: number): AnimatedProps {
  const cur = d.clips[name]
  if (!cur) return d
  const frames = cur.frames.filter((_, i) => i !== index)
  return { ...d, clips: { ...d.clips, [name]: { ...cur, frames } } }
}

/** Renames a clip in place, keeping its order and the initial clip pointing at it. */
export function renameClip(d: AnimatedProps, from: string, to: string): AnimatedProps {
  const clips: Record<string, ClipDef> = {}
  for (const [n, c] of Object.entries(d.clips)) clips[n === from ? to : n] = c
  return { ...d, clips, initialClip: d.initialClip === from ? to : d.initialClip }
}

/** Deletes a clip; the initial clip falls back to automatic when it was this one. */
export function deleteClip(d: AnimatedProps, name: string): AnimatedProps {
  const clips = { ...d.clips }
  delete clips[name]
  return { ...d, clips, initialClip: d.initialClip === name ? undefined : d.initialClip }
}
