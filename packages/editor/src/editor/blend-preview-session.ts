import type { EditorCore } from './editor-commits'
import type { BlendPreview } from './inspector/blend-preview'
import { inspectorSelection } from './inspector-selection'
import type { ViewportAccess } from './use-viewport-handle'

/** Why the open view cannot preview a blend on the stage, or null when it can. */
function unavailableReason(core: EditorCore): string | null {
  const selection = inspectorSelection(core)
  if (core.view.mode === 'play') return 'Preview runs in edit mode.'
  // The prefab stage draws every prefab in a 2D scene, where an Animator creates nothing.
  if (selection?.kind === 'prefab') return 'The prefab stage is 2D: preview this blend on an instance in a 3D scene.'
  if (selection?.kind !== 'entity') return 'Nothing on the stage to preview on.'
  return selection.space === '3d' ? null : 'A 2D scene has no live Animator to preview on.'
}

/**
 * The Inspector's blend preview over the stage (issue 205 CA-21): the scene
 * entity it shows, through the stage's handle, in edit mode. Its session
 * changes with the entity, the scene, the mode and every stage rebuild, so a
 * running preview ends with any of them.
 */
export function blendPreviewOf(core: EditorCore, viewport: ViewportAccess): BlendPreview {
  const selection = inspectorSelection(core)
  const entity = selection?.kind === 'entity' ? selection.entity.name : null
  const [epoch] = core.stage.epoch
  const unavailable = unavailableReason(core)
  return {
    session: [core.scenes.openScenePath ?? '', entity ?? '', core.view.mode, epoch + core.art.loads].join('|'),
    unavailable,
    start: (blend, param, value) => (entity !== null && unavailable === null ? (viewport()?.previewBlend({ entity, blend, param, value }) ?? false) : false),
    stop: () => viewport()?.stopBlendPreview(),
  }
}
