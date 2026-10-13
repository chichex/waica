// The transform gizmo of the 3D edit view (issue #173 CA-18 to CA-21, ADR
// 0030): three's TransformControls on a pivot that stands for the selection
// (the entity's own pose, or the center of a group's positions). A drag moves
// the live entities as the pivot moves, turns the orbit controls off while it
// lasts, snaps while Ctrl is held, and on release commits every dragged
// entity's transform at once.
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { applyTransformJson, THREE, type Entity, type Game } from '@waica/engine'
import type { RefObject } from 'react'
import type { EditorCamera } from './editor-camera'
import { draggedTransforms, type DraggedEntity, type Pose } from './group-transform'
import { selectedNames } from './viewport-3d-overlays'
import { addOverlay } from './viewport-selection-gizmos'
import type { GizmoSettings } from './editor-view-settings'
import type { ViewportLive } from './viewport-live'

const poseOf = (object: THREE.Object3D): Pose => ({
  position: object.position.clone(),
  quaternion: object.quaternion.clone(),
  scale: object.scale.clone(),
})

/** An entity's pose: its position, and its node's rotation and scale. */
function entityStart(entity: Entity): DraggedEntity {
  return {
    name: entity.name,
    start: { position: entity.position.clone(), quaternion: entity.node.quaternion.clone(), scale: entity.node.scale.clone() },
    rotation: entity.node.rotation.clone(),
  }
}

/** Puts the pivot where the gizmo stands for `entities`: one entity's own pose, or the center of several positions. */
function placePivot(pivot: THREE.Object3D, entities: readonly Entity[]): void {
  const [only] = entities
  if (only && entities.length === 1) {
    pivot.position.copy(only.position)
    pivot.quaternion.copy(only.node.quaternion)
    pivot.scale.copy(only.node.scale)
  } else {
    pivot.position.set(0, 0, 0)
    for (const entity of entities) pivot.position.add(entity.position)
    pivot.position.divideScalar(Math.max(entities.length, 1))
    pivot.quaternion.identity()
    pivot.scale.set(1, 1, 1)
  }
  pivot.updateMatrixWorld()
}

/** Ctrl held: the drag snaps to the steps; released: it moves freely (CA-20). */
function applySnap(controls: TransformControls, settings: GizmoSettings | undefined, snapping: boolean): void {
  const steps = snapping ? settings?.snap : undefined
  controls.setTranslationSnap(steps ? steps.position : null)
  controls.setRotationSnap(steps ? THREE.MathUtils.degToRad(steps.rotation) : null)
  controls.setScaleSnap(steps ? steps.scale : null)
}

/**
 * Ctrl snaps a drag (CA-20): every pointer event and Ctrl key press sets the
 * steps, so a move snaps while Ctrl is held. Installed before TransformControls
 * listens on the element; returns what removes the listeners.
 */
function snapOnCtrl(element: HTMLElement, live: RefObject<ViewportLive>, controls: () => TransformControls | null): () => void {
  const arm = (event: PointerEvent | KeyboardEvent): void => {
    const gizmo = controls()
    if (gizmo) applySnap(gizmo, live.current.gizmo, event.ctrlKey)
  }
  element.addEventListener('pointerdown', arm, { capture: true })
  element.addEventListener('pointermove', arm, { capture: true })
  window.addEventListener('keydown', arm)
  window.addEventListener('keyup', arm)
  return () => {
    element.removeEventListener('pointerdown', arm, { capture: true })
    element.removeEventListener('pointermove', arm, { capture: true })
    window.removeEventListener('keydown', arm)
    window.removeEventListener('keyup', arm)
  }
}

/** Whether a pivot is exactly where the drag found it: a click on a handle without moving commits nothing. */
const samePose = (a: Pose, b: Pose): boolean => a.position.equals(b.position) && a.quaternion.equals(b.quaternion) && a.scale.equals(b.scale)

/**
 * A drag's life (CA-18, CA-19, CA-21): grabbed, the orbit controls stop and the
 * selected entities' starts are kept; while the pivot moves, the live entities
 * follow it; released, every dragged transform is committed at once.
 */
function followDrags(gizmo: TransformControls, pivot: THREE.Object3D, scope: { game: Game; editor: EditorCamera; live: RefObject<ViewportLive> }): void {
  const { game, editor, live } = scope
  let drag: { entities: DraggedEntity[]; pivot: Pose } | null = null
  const dragged = () => (drag ? draggedTransforms(drag.entities, drag.pivot, poseOf(pivot)) : [])
  gizmo.addEventListener('dragging-changed', (event) => {
    const grabbed = event.value === true
    editor.controls.enabled = !grabbed
    if (grabbed) {
      const entities = selectedNames(live.current).flatMap((name) => game.find(name) ?? [])
      drag = { entities: entities.map(entityStart), pivot: poseOf(pivot) }
      return
    }
    const changes = drag && samePose(drag.pivot, poseOf(pivot)) ? [] : dragged()
    drag = null
    if (changes.length > 0) live.current.onTransformed?.(changes)
  })
  gizmo.addEventListener('objectChange', () => {
    for (const { name, transform } of dragged()) {
      const entity = game.find(name)
      if (entity) applyTransformJson(entity, transform)
    }
  })
}

export type Gizmo3d = ReturnType<typeof createGizmo3d>

export function createGizmo3d(game: Game, editor: EditorCamera, live: RefObject<ViewportLive>) {
  let controls: TransformControls | null = null
  const unsnap = snapOnCtrl(editor.element, live, () => controls)
  const gizmo = new TransformControls(editor.camera, editor.element)
  controls = gizmo
  const helper = gizmo.getHelper()
  helper.name = 'waica:editor-gizmo'
  const pivot = new THREE.Object3D()
  pivot.name = 'waica:editor-gizmo-pivot'
  // Editor overlays live on the Emissive layer (the root only: the handles stay on the layer the gizmo raycasts).
  addOverlay(game, helper, pivot)
  followDrags(gizmo, pivot, { game, editor, live })

  return {
    /** Once per frame: attached to the selection of an edited 3D scene, in the toolbar's mode and space; else detached. */
    sync(active: boolean): void {
      if (gizmo.dragging) {
        editor.controls.enabled = false
        return
      }
      const entities = active ? selectedNames(live.current).flatMap((name) => game.find(name) ?? []) : []
      if (entities.length === 0) {
        if (gizmo.object) gizmo.detach()
        return
      }
      placePivot(pivot, entities)
      if (gizmo.object !== pivot) gizmo.attach(pivot)
      const settings = live.current.gizmo
      if (settings && gizmo.mode !== settings.mode) gizmo.setMode(settings.mode)
      if (settings && gizmo.space !== settings.space) gizmo.setSpace(settings.space)
    },
    /** True while the pointer holds or hovers a handle: a click there drags, it does not pick. */
    grabbing: (): boolean => gizmo.dragging || gizmo.axis !== null,
    dispose(): void {
      unsnap()
      gizmo.detach()
      gizmo.dispose()
      helper.removeFromParent()
      pivot.removeFromParent()
    },
  }
}
