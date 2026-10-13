import type { ComponentProps, RefObject } from 'react'
import type { SceneJson } from '@waica/engine'
import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import { refBase } from './Explorer'
import { setPrefabProp } from './prefab-commands'
import { dropPrefab } from './scene-entity-commands'
import { Viewport, type ViewportHandle } from './Viewport'

type ViewportProps = ComponentProps<typeof Viewport>

/** What both stages share: the registry they load from and when they rebuild. */
export interface StageProps {
  registry: ViewportProps['registry']
  epoch: number
}

/** The ref the mounted stage fills with its imperative handle. */
type ViewportRef = RefObject<ViewportHandle | null>

/** The open scene on the stage: edited in place, or played. */
export function SceneViewport({
  core,
  scene,
  stage,
  viewportRef,
}: {
  core: EditorCore
  scene: { path: string; scene: SceneJson }
  stage: StageProps
  viewportRef: ViewportRef
}) {
  const [sceneLibrary] = core.stage.sceneLibrary
  const [visibility] = core.stage.visibility
  const [tilemapBrush] = core.stage.tilemapBrush
  return (
    <Viewport
      ref={viewportRef}
      scene={scene.scene}
      scenePath={scene.path}
      sceneCatalog={sceneLibrary}
      registry={stage.registry}
      epoch={stage.epoch}
      mode={core.view.mode}
      showCamera
      componentVisibility={visibility}
      tilemapBrush={tilemapBrush}
      {...projectSettingsProps(core)}
      {...sceneSelectHandlers(core, scene.path)}
      {...sceneMoveHandlers(core, scene.scene)}
      {...sceneShapeHandlers(core, scene.scene)}
    />
  )
}

/** What the project gives the stage: its controls, stats, music, resolution and grid, and its name (the 3D pose memory's key). */
function projectSettingsProps(core: EditorCore) {
  const { settings } = core
  const resolution = settings.gameSettings?.resolution
  return {
    bindings: settings.controls ?? undefined,
    stats: settings.stats ?? undefined,
    music: core.code.archetype.music,
    resolution: resolution?.mode === 'fixed' ? resolution : undefined,
    grid: settings.editorSettings?.grid,
    onGridChange: settings.commitGrid,
    project: core.fs.name,
  } satisfies Partial<ViewportProps>
}

/** Picking on the stage: entities, the multi-selection and the scene camera. */
function sceneSelectHandlers(core: EditorCore, path: string) {
  const { selection } = core
  return {
    selected: selection.selected,
    multiSelected: selection.multi,
    onSelect: selection.selectEntity,
    onToggleSelect: selection.toggleEntity,
    onRangeSelect: selection.rangeEntities,
    onSelectCamera: () => {
      core.view.setView({ kind: 'scene', path })
      selection.selectEntity(ops.CAMERA_NODE)
    },
  } satisfies Partial<ViewportProps>
}

function sceneMoveHandlers(core: EditorCore, scene: SceneJson) {
  return {
    onMoved: (name, position) => core.commit(ops.moveEntity(scene, name, position)),
    onMovedMany: (moves) => {
      let next = scene
      for (const { name, position } of moves) next = ops.moveEntity(next, name, position)
      core.commit(next)
    },
    onCameraMoved: (position) => core.commit(ops.moveCamera(scene, position)),
    onDropPrefab: (data, world) => dropPrefab(core, data, world),
    // A released 3D gizmo drag: every dragged entity's transform as one commit, one undo (issue #173 CA-19, CA-21).
    onTransformed: (changes) => core.commit(changes.reduce((next, { name, transform }) => ops.setEntityTransform(next, name, transform), scene)),
  } satisfies Partial<ViewportProps>
}

/** Box, polygon and tilemap edits made directly on the stage. */
function sceneShapeHandlers(core: EditorCore, scene: SceneJson) {
  const [prefabLib] = core.library.prefabLib
  /** The scene with `props` set on one entity's component, in their order. */
  const withProps = (name: string, type: string, props: Record<string, unknown>): SceneJson => {
    let next = scene
    for (const [key, value] of Object.entries(props)) {
      next = ops.setComponentProp(next, name, type, key, value, prefabLib)
    }
    return next
  }
  return {
    onTilemapStroke: (name, cells) => core.commit(withProps(name, 'Tilemap', { cells })),
    // The viewport already holds the live values: non-structural commit.
    // Anchored resize moves the center too, so the offset lands in the
    // same undo step as the size.
    onBoxResized: (name, compType, [w, h], [ox, oy]) => {
      core.commit(withProps(name, compType, { width: w, height: h, offsetX: ox, offsetY: oy }))
    },
    onBoxMoved: (name, compType, [x, y]) => core.commit(withProps(name, compType, { offsetX: x, offsetY: y })),
    onPolygonChanged: (name, compType, points) => core.commit(withProps(name, compType, { points })),
  } satisfies Partial<ViewportProps>
}

/** A prefab alone on a tinted stage: edits reach every instance. */
export function PrefabViewport({
  core,
  prefabRef,
  scene,
  stage,
  viewportRef,
}: {
  core: EditorCore
  prefabRef: string
  /** The one-entity scene that instances the prefab. */
  scene: SceneJson
  stage: StageProps
  viewportRef: ViewportRef
}) {
  const [visibility] = core.stage.visibility
  return (
    <Viewport
      key={`prefab:${prefabRef}`}
      ref={viewportRef}
      scene={scene}
      registry={stage.registry}
      epoch={stage.epoch}
      mode="edit"
      viewHeight={5}
      background={0x211a33}
      grid={core.settings.editorSettings?.grid}
      onGridChange={core.settings.commitGrid}
      componentVisibility={visibility}
      selected={refBase(prefabRef)}
      onSelect={() => {}}
      onMoved={() => {}}
      {...prefabShapeHandlers(core, prefabRef)}
    />
  )
}

/** Box and polygon edits on the prefab stage land on the prefab itself. */
function prefabShapeHandlers(core: EditorCore, prefabRef: string) {
  const [prefabLib] = core.library.prefabLib
  const patch = (compType: string, props: Record<string, unknown>): void => {
    const prefab = prefabLib[prefabRef]
    if (!prefab) return
    let next = prefab
    for (const [key, value] of Object.entries(props)) next = setPrefabProp(next, compType, key, value)
    core.commitPrefab(prefabRef, next)
  }
  return {
    onBoxResized: (_name, compType, [w, h], [ox, oy]) =>
      patch(compType, { width: w, height: h, offsetX: ox, offsetY: oy }),
    onBoxMoved: (_name, compType, [x, y]) => patch(compType, { offsetX: x, offsetY: y }),
    onPolygonChanged: (_name, compType, points) => patch(compType, { points }),
  } satisfies Partial<ViewportProps>
}
