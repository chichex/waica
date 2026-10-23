import { useState } from 'react'
import type { EditorCore } from './editor-commits'
import { stageEpoch } from './editor-state'
import type { BlendPreview } from './inspector/blend-preview'
import type { InspectorSelection } from './Inspector'
import { inspectorSelection } from './inspector-selection'
import type { ViewportAccess } from './use-viewport-handle'

/** Why the open view cannot preview a blend on the stage, or null when it can. */
function unavailableReason(mode: 'edit' | 'play', selection: InspectorSelection): string | null {
  if (mode === 'play') return 'Preview runs in edit mode.'
  // The prefab stage draws every prefab in a 2D scene, where an Animator creates nothing.
  if (selection?.kind === 'prefab') return 'The prefab stage is 2D: preview this blend on an instance in a 3D scene.'
  if (selection?.kind !== 'entity') return 'Nothing on the stage to preview on.'
  return selection.space === '3d' ? null : 'A 2D scene has no live Animator to preview on.'
}

/**
 * The Inspector's blend preview over the stage (issue 205 CA-21): the scene
 * entity it shows, through the stage's handle, in edit mode. Its session
 * changes with the entity, the scene, the mode and every stage rebuild, so a
 * running preview ends with any of them. The stage runs one preview at a
 * time: `active` names its blend, and starting another takes its place.
 */
export function useBlendPreview(core: EditorCore, viewport: ViewportAccess): BlendPreview {
  const [running, setRunning] = useState<{ session: string; blend: string } | null>(null)
  const selection = inspectorSelection(core)
  const entity = selection?.kind === 'entity' ? selection.entity.name : null
  const session = [core.scenes.openScenePath ?? '', entity ?? '', core.view.mode, stageEpoch(core)].join('|')
  const unavailable = unavailableReason(core.view.mode, selection)
  return {
    session,
    unavailable,
    active: running?.session === session ? running.blend : null,
    start: (blend, param, value) => {
      const handle = viewport()
      if (entity === null || unavailable !== null || !handle) return 'not-loaded'
      const refusal = handle.previewBlend({ entity, blend, param, value })
      if (refusal === null) setRunning((current) => (current?.session === session && current.blend === blend ? current : { session, blend }))
      return refusal
    },
    stop: (blend) => {
      if (entity !== null) viewport()?.stopBlendPreview({ entity, blend })
      setRunning((current) => (current?.blend === blend ? null : current))
    },
  }
}
