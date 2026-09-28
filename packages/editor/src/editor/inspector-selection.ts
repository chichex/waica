import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import type { ExplorerView } from './Explorer'
import type { InspectorSelection } from './Inspector'
import { sceneLabel } from './icons'

/** What the Inspector shows for the open view and the scene selection. */
export function inspectorSelection(core: EditorCore): InspectorSelection {
  const { view, artDims } = core.view
  if (!view) return null
  if (view.kind === 'scene') return sceneSelection(core)
  if (view.kind === 'prefab') {
    const [prefabLib] = core.library.prefabLib
    const prefab = prefabLib[view.ref]
    return prefab ? { kind: 'prefab', ref: view.ref, prefab } : null
  }
  return fileSelection(view, artDims)
}

/** Views that are a file or a settings form: the Inspector describes the view itself. */
function fileSelection(
  view: Exclude<ExplorerView, { kind: 'scene' | 'prefab' }>,
  artDims: [number, number] | null,
): InspectorSelection {
  switch (view.kind) {
    case 'ui':
      return { kind: 'ui', name: view.name }
    case 'script':
      return { kind: 'script', name: view.name }
    case 'art':
      return { kind: 'art', label: view.label, dims: artDims }
    case 'controls':
    case 'stats':
    case 'game':
      return { kind: view.kind }
    case 'stateFile':
    case 'componentFile':
      return null
  }
}

/** The camera, a multi-selection, one entity, or — nothing picked — the scene itself. */
function sceneSelection(core: EditorCore): InspectorSelection {
  const { scene, openScenePath } = core.scenes
  const { selected, multi } = core.selection
  if (!scene) return null
  const sceneName = openScenePath ? sceneLabel(openScenePath) : null
  if (selected === ops.CAMERA_NODE) {
    return { kind: 'camera', camera: scene.camera, entityNames: scene.entities.map((e) => e.name) }
  }
  if (multi.length > 1) {
    return {
      kind: 'multi',
      entities: scene.entities.filter((e) => multi.includes(e.name)),
      sceneName: sceneName ?? '',
    }
  }
  if (selected) {
    const entity = scene.entities.find((e) => e.name === selected)
    return entity ? { kind: 'entity', entity, sceneName: sceneName ?? '' } : null
  }
  // Scene open, nothing picked: you're editing the scene itself.
  return { kind: 'scene', name: sceneName ?? 'scene', scene }
}
