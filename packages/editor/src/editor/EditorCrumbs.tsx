import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import { refBase, type ExplorerView } from './Explorer'
import { entityIcon, prefabIcon, sceneLabel } from './icons'
import type { ArchetypeManifest } from '../project/archetype'

/** Breadcrumb over the center pane: what you're editing, and the way back. */
export function EditorCrumbs({ core }: { core: EditorCore }) {
  const { view } = core.view
  if (!view) return null
  const tone =
    view.kind === 'prefab' ? 'prefab' : view.kind === 'ui' ? 'ui' : view.kind === 'scene' ? 'scene' : 'neutral'
  return (
    <div className={`ed-crumbs is-ctx-${tone}`}>
      {view.kind === 'scene' ? <SceneCrumbs core={core} /> : <ViewCrumbs core={core} view={view} />}
    </div>
  )
}

/** The scene, and the entity (or camera, or group) picked in it. */
function SceneCrumbs({ core }: { core: EditorCore }) {
  const { openScenePath, scene } = core.scenes
  const { selected, multi } = core.selection
  const [prefabLib] = core.library.prefabLib
  const sceneName = openScenePath ? sceneLabel(openScenePath) : null
  if (!selected) {
    return (
      <span className="ed-crumb is-current">
        <span className="ed-x-ico">🎬</span>
        {sceneName}
      </span>
    )
  }
  const entity =
    scene && selected !== ops.CAMERA_NODE ? scene.entities.find((e) => e.name === selected) : undefined
  const isMulti = multi.length > 1
  const isCamera = selected === ops.CAMERA_NODE
  const icon = isMulti ? '▣' : isCamera ? '🎥' : entity ? entityIcon(entity, prefabLib, core.code.archetype) : '▢'
  return (
    <>
      <button className="ed-crumb" title="Back to the scene" onClick={() => core.selection.setSelected(null)}>
        <span className="ed-x-ico">🎬</span>
        {sceneName}
      </button>
      <span className="ed-crumb-sep">▸</span>
      <span className="ed-crumb is-current">
        <span className="ed-x-ico">{icon}</span>
        {isMulti ? `${multi.length} entities` : isCamera ? 'Camera' : selected}
      </span>
    </>
  )
}

/** Any other view: the way back to the open scene, then what is open. */
function ViewCrumbs({ core, view }: { core: EditorCore; view: Exclude<ExplorerView, { kind: 'scene' }> }) {
  const { openScenePath } = core.scenes
  const current = currentCrumb(view, core.code.archetype)
  return (
    <>
      {openScenePath && (
        <button
          className="ed-crumb"
          title="Back to the scene"
          onClick={() => core.view.openView({ kind: 'scene', path: openScenePath })}
        >
          ← <span className="ed-x-ico">🎬</span>
          {sceneLabel(openScenePath)}
        </button>
      )}
      {openScenePath && <span className="ed-crumb-sep">▸</span>}
      <span className="ed-crumb is-current">
        <span className="ed-x-ico">{current.icon}</span>
        {current.label}
      </span>
      {view.kind === 'prefab' && <span className="ed-crumb-chip is-prefab">edits reach every instance</span>}
    </>
  )
}

function currentCrumb(
  view: Exclude<ExplorerView, { kind: 'scene' }>,
  archetype: ArchetypeManifest,
): { icon: string; label: string } {
  switch (view.kind) {
    case 'prefab':
      return { icon: prefabIcon(refBase(view.ref), archetype), label: view.ref.replace('/', ' / ') }
    case 'ui':
      return { icon: '🧩', label: view.name }
    case 'script':
      return { icon: '📜', label: view.name }
    case 'stateFile':
    case 'componentFile':
      return { icon: '📜', label: view.path.split('/').pop() ?? view.path }
    case 'art':
      return { icon: '🖼️', label: view.label }
    case 'controls':
      return { icon: '🎮', label: 'controls' }
    case 'stats':
      return { icon: '📊', label: 'stats' }
    case 'game':
      return { icon: '🕹️', label: 'game' }
  }
}
