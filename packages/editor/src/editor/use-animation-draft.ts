import { useState } from 'react'
import type { ClipDef, SheetDef } from '@waica/engine'
import { uniqueClipName, type AnimatedProps } from '../project/clips'
import * as edit from './animation-draft'

/**
 * The AnimationEditor's working copy of the sprite and the clip being
 * edited: every edit is one of animation-draft's transforms, and clip
 * edits that add, rename or delete the selected clip keep the selection
 * pointing at the right one.
 */
export function useAnimationDraft(initial: AnimatedProps) {
  const [draft, setDraft] = useState<AnimatedProps>(() => structuredClone(initial))
  const [selectedClip, setSelectedClip] = useState<string | null>(Object.keys(initial.clips)[0] ?? null)

  const addClip = (): void => {
    const name = uniqueClipName(draft.clips, 'clip')
    setDraft((d) => ({ ...d, clips: { ...d.clips, [name]: { frames: [], fps: 8 } } }))
    setSelectedClip(name)
  }
  const renameClip = (from: string, to: string): void => {
    if (!to || to === from || draft.clips[to]) return
    setDraft((d) => edit.renameClip(d, from, to))
    setSelectedClip((s) => (s === from ? to : s))
  }
  const deleteClip = (name: string): void => {
    setDraft((d) => edit.deleteClip(d, name))
    setSelectedClip((s) => (s === name ? null : s))
  }

  return {
    draft,
    selectedClip,
    setSelectedClip,
    patch: (p: Partial<AnimatedProps>): void => setDraft((d) => ({ ...d, ...p })),
    patchSheet: (index: number, p: Partial<SheetDef>): void => setDraft((d) => edit.patchSheet(d, index, p)),
    addSheet: (texture: string): void => setDraft((d) => edit.addSheet(d, texture)),
    removeSheet: (index: number): void => setDraft((d) => edit.removeSheet(d, index)),
    deleteCell: (sheetIndex: number, cellIndex: number): void =>
      setDraft((d) => edit.deleteCell(d, sheetIndex, cellIndex)),
    patchClip: (name: string, c: Partial<ClipDef>): void => setDraft((d) => edit.patchClip(d, name, c)),
    /** Toggles a frame in the selected clip; without one, frames have nowhere to go. */
    toggleFrame: (frame: number): void => {
      if (selectedClip) setDraft((d) => edit.toggleFrame(d, selectedClip, frame))
    },
    removeFrameAt: (name: string, index: number): void => setDraft((d) => edit.removeFrameAt(d, name, index)),
    addClip,
    renameClip,
    deleteClip,
  }
}

export type AnimationDraft = ReturnType<typeof useAnimationDraft>
