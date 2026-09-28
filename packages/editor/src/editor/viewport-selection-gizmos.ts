// Per-frame gizmos for the selection: the selected entity's component boxes
// (with their resize handles), its margin outline, the multi-selection
// outlines, and hiding its appearance while that layer is hidden.
import { THREE, type CollisionPoint, type Entity, type Game } from '@waica/engine'
import { BOX_KINDS, boxRenderPoints, CORNERS, entityBounds, findBox, projectionOf } from './viewport-boxes'
import type { ViewportComponentVisibility, ViewportLive } from './viewport-live'
import { renderPoint, type ViewportProjection } from './viewport-space'

export const SELECTION_AMBER = 0xffb703

export function rectLoop(color: number): THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, -0.5, 0),
    new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(-0.5, 0.5, 0),
  ])
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }))
}

/** Frames `loop` around the entity's render-space bounds, with a small margin, at the loop's own depth. */
function outlineEntity(loop: THREE.LineLoop, entity: Entity, projection: ViewportProjection): void {
  const bounds = entityBounds(entity, projection)
  const [entityX, entityY] = renderPoint(projection, entity.position.x, entity.position.y)
  loop.position.set(entityX + bounds.centerX, entityY + bounds.centerY, loop.position.z)
  loop.scale.set(bounds.width + 0.2, bounds.height + 0.2, 1)
}

/** Hides one entity's appearance at a time, restoring its own visibility afterwards. */
function createAppearanceHider() {
  let hidden: { entity: Entity; wasVisible: boolean } | null = null
  const restore = (): void => {
    if (!hidden) return
    hidden.entity.node.visible = hidden.wasVisible
    hidden = null
  }
  return {
    restore,
    sync(entity: Entity | undefined, hide: boolean): void {
      if (!entity || !hide) {
        restore()
        return
      }
      if (hidden?.entity !== entity) {
        restore()
        hidden = { entity, wasVisible: entity.node.visible }
      }
      entity.node.visible = false
    },
  }
}

/** Square handle meshes, pooled, placed on render-space points at a fixed screen size. */
function createHandlePool(game: Game, color: number) {
  const handles: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>> = []
  const ensure = (count: number): void => {
    while (handles.length < count) {
      const handle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color }))
      handle.position.z = 5.1
      handle.visible = false
      game.scene.add(handle)
      handles.push(handle)
    }
  }
  ensure(CORNERS.length)
  return {
    place(points: readonly CollisionPoint[], size: number): void {
      ensure(points.length)
      handles.forEach((handle, index) => {
        const point = points[index]
        handle.visible = point != null
        if (!point) return
        handle.position.set(point[0], point[1], 5.1)
        handle.scale.set(size, size, 1)
      })
    },
    hide(): void {
      for (const handle of handles) handle.visible = false
    },
  }
}

/** One box kind's outline plus its corner (or polygon vertex) handles. */
function createBoxGizmo(game: Game, color: number) {
  const loop = rectLoop(color)
  loop.position.z = 5
  loop.visible = false
  game.scene.add(loop)
  const handles = createHandlePool(game, color)
  let outlineKey = 'rectangle'
  return {
    show(outline: readonly CollisionPoint[], handlePoints: readonly CollisionPoint[], handleSize: number): void {
      const key = JSON.stringify(outline)
      if (key !== outlineKey) {
        outlineKey = key
        loop.geometry.dispose()
        loop.geometry = new THREE.BufferGeometry().setFromPoints(outline.map(([x, y]) => new THREE.Vector3(x, y, 0)))
      }
      loop.visible = true
      loop.position.set(0, 0, 5)
      loop.scale.set(1, 1, 1)
      handles.place(handlePoints, handleSize)
    },
    hide(): void {
      loop.visible = false
      handles.hide()
    },
  }
}

/** The selected entity's collision and appearance boxes, in hit-test order. */
function createBoxGizmos(game: Game) {
  const gizmos = BOX_KINDS.map(({ types, color, role }) => ({ types, role, ...createBoxGizmo(game, color) }))
  return {
    /** Draws the boxes; returns whether the entity has an appearance box (shown or not). */
    sync(entity: Entity | undefined, projection: ViewportProjection, visibility: ViewportComponentVisibility): boolean {
      // Handles keep a constant screen size regardless of zoom.
      const handleSize = game.view * 0.018
      for (const gizmo of gizmos) {
        const box = entity && visibility[gizmo.role] ? findBox(entity, gizmo.types) : null
        if (!entity || !box) {
          gizmo.hide()
          continue
        }
        gizmo.show(
          boxRenderPoints(entity, box.comp, gizmo.role, projection, false),
          boxRenderPoints(entity, box.comp, gizmo.role, projection, true),
          handleSize,
        )
      }
      return entity != null && gizmos.some((gizmo) => gizmo.role === 'appearance' && findBox(entity, gizmo.types))
    },
  }
}

/** Outlines every member of the multi-selection so the group reads at a glance. */
function createMultiGizmos(game: Game) {
  const loops: THREE.LineLoop[] = []
  return {
    sync(names: readonly string[], projection: ViewportProjection): void {
      while (loops.length < names.length) {
        const loop = rectLoop(SELECTION_AMBER)
        loop.position.z = 4.9
        loop.visible = false
        game.scene.add(loop)
        loops.push(loop)
      }
      loops.forEach((loop, index) => {
        const name = names.length > 1 ? names[index] : undefined
        const target = name ? game.find(name) : undefined
        loop.visible = target != null
        if (target) outlineEntity(loop, target, projection)
      })
    },
  }
}

/** Every selection gizmo, synced once per frame from the live props. */
export function createSelectionGizmos(game: Game) {
  // The margin rect marks the selection when there is no appearance box.
  const margin = rectLoop(SELECTION_AMBER)
  margin.position.z = 5
  margin.visible = false
  game.scene.add(margin)
  const hider = createAppearanceHider()
  const boxes = createBoxGizmos(game)
  const multi = createMultiGizmos(game)
  return {
    restore: hider.restore,
    sync(live: ViewportLive): void {
      const editing = live.mode === 'edit'
      const entity = editing && live.selected ? game.find(live.selected) : undefined
      const projection = projectionOf(live.scene)
      hider.sync(entity, !live.componentVisibility.appearance)
      const appearanceBoxExists = boxes.sync(entity, projection, live.componentVisibility)
      // A hidden appearance stays hidden instead of being replaced by this outline.
      margin.visible = entity != null && !appearanceBoxExists
      if (entity) outlineEntity(margin, entity, projection)
      multi.sync(editing ? (live.multiSelected ?? []) : [], projection)
    },
  }
}
