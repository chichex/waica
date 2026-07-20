import type { ClipDef } from '@waica/engine'

/** The AnimatedSprite props the animation editor works on. */
export interface AnimatedProps {
  texture: string
  cols: number
  rows: number
  clips: Record<string, ClipDef>
  initialClip?: string
  width: number
  height: number
  pixelArt?: boolean
  layer?: number
}

export function frameCount(cols: number, rows: number): number {
  return Math.max(1, Math.floor(cols)) * Math.max(1, Math.floor(rows))
}

/**
 * Drops frames outside the sheet (after a cols/rows shrink), deletes clips
 * left empty, clears a dangling initialClip, and defaults initialClip to the
 * first clip — so an animated object plays as soon as it has one clip.
 */
export function sanitizeAnimated(props: AnimatedProps): AnimatedProps {
  const max = frameCount(props.cols, props.rows)
  const clips: Record<string, ClipDef> = {}
  for (const [name, clip] of Object.entries(props.clips)) {
    const frames = clip.frames.filter((f) => Number.isInteger(f) && f >= 0 && f < max)
    if (frames.length) clips[name] = { ...clip, frames }
  }
  const out: AnimatedProps = { ...props, clips }
  const first = Object.keys(clips)[0]
  if (props.initialClip && clips[props.initialClip]) out.initialClip = props.initialClip
  else if (first) out.initialClip = first
  else delete out.initialClip
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
  if (p.initialClip !== undefined) out.initialClip = p.initialClip
  if (p.pixelArt !== undefined) out.pixelArt = p.pixelArt
  if (p.layer !== undefined) out.layer = p.layer
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
