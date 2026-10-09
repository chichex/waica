import { resolveSceneSpace, type SceneJson } from '@waica/engine'
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

/** One entity of the open scene; a 3D scene's entity carries the space its transform rows depend on. */
function entitySelection(scene: SceneJson, name: string, sceneName: string): InspectorSelection {
  const entity = scene.entities.find((e) => e.name === name)
  if (!entity) return null
  const space = resolveSceneSpace(scene.render)
  return { kind: 'entity', entity, sceneName, ...(space === '3d' ? { space } : {}) }
}

/** The camera, a multi-selection, one entity, or — nothing picked — the scene itself. */
function sceneSelection(core: EditorCore): InspectorSelection {
  const { scene, openScenePath } = core.scenes
  const { selected, multi } = core.selection
  if (!scene) return null
  const sceneName = openScenePath ? sceneLabel(openScenePath) : null
  if (selected === ops.CAMERA_NODE) {
    const space = resolveSceneSpace(scene.render)
    return { kind: 'camera', camera: scene.camera, entityNames: scene.entities.map((e) => e.name), ...(space === '3d' ? { space } : {}) }
  }
  if (multi.length > 1) {
    return {
      kind: 'multi',
      entities: scene.entities.filter((e) => multi.includes(e.name)),
      sceneName: sceneName ?? '',
    }
  }
  if (selected) return entitySelection(scene, selected, sceneName ?? '')
  // Scene open, nothing picked: you're editing the scene itself.
  return { kind: 'scene', name: sceneName ?? 'scene', scene }
}
