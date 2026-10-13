// What the 3D edit view draws over the scene (issue #173), refreshed once per
// frame from the latest props: the XZ grid (CA-16), a box around each selected
// entity (CA-13), the icons a click selects through (CA-14) and the helpers
// (CA-17). All of it exists only while a 3D scene is edited; in Play the edit
// view, and so this, is never built.
import { THREE, type Entity, type Game, type PickTarget } from '@waica/engine'
import type { GridSettings } from '../project/editor-settings'
import { createHelpers3d } from './viewport-3d-helpers'
import { createIcons3d } from './viewport-3d-icons'
import type { ViewportLive } from './viewport-live'
import { addOverlay, SELECTION_AMBER } from './viewport-selection-gizmos'

/** Half the side of the cube that stands for an entity with no mesh. */
const MESHLESS_HALF = 0.5

/** An entity's world bounds: its meshes', or a unit cube around it when it has none (issue #173 inference 23). */
export function entityBounds3d(entity: Entity): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(entity.node)
  if (!box.isEmpty()) return box
  const center = entity.node.getWorldPosition(new THREE.Vector3())
  return new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3().setScalar(MESHLESS_HALF * 2))
}

/** The names the selection holds: the multi-selection when it has several, else the single one. */
export function selectedNames(live: ViewportLive): string[] {
  const multi = live.multiSelected ?? []
  if (multi.length > 1) return multi
  return live.selected ? [live.selected] : []
}

/** The union bounds of the selection's live entities; null with nothing to frame. */
export function selectionBounds(game: Game, live: ViewportLive): THREE.Box3 | null {
  const entities = selectedNames(live).map((name) => game.find(name)).filter((entity) => entity !== undefined)
  if (entities.length === 0) return null
  return entities.reduce((box, entity) => box.union(entityBounds3d(entity)), new THREE.Box3())
}

/** A line box around each selected entity's world bounds, in the 2D selection color, pooled. */
function createSelectionBoxes(game: Game) {
  const boxes: THREE.Box3Helper[] = []
  return {
    sync(live: ViewportLive, visible: boolean): void {
      const entities = visible ? selectedNames(live).flatMap((name) => game.find(name) ?? []) : []
      while (boxes.length < entities.length) {
        const box = new THREE.Box3Helper(new THREE.Box3(), SELECTION_AMBER)
        box.name = 'waica:editor-selection'
        addOverlay(game, box)
        boxes.push(box)
      }
      boxes.forEach((box, index) => {
        const entity = entities[index]
        box.visible = entity !== undefined
        if (entity) box.box.copy(entityBounds3d(entity))
      })
    },
  }
}

/** Cells from the origin to the grid's edge, and a major line every MAJOR_EVERY cells (issue #173 inference 11). */
const GRID_HALF_CELLS = 50
const MAJOR_EVERY = 10
const GRID_COLORS = { minor: 0x34345a, major: 0x5c5c92, xAxis: 0xd8484f, zAxis: 0x4a74e0 }

/** The unit XZ grid at y=0: 101 lines along X and 101 along Z, the X axis red and the Z axis blue. */
function gridLines(): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const color = new THREE.Color()
  const line = (from: [number, number, number], to: [number, number, number], hex: number): void => {
    positions.push(...from, ...to)
    color.setHex(hex)
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
  }
  for (let cell = -GRID_HALF_CELLS; cell <= GRID_HALF_CELLS; cell += 1) {
    const plain = cell % MAJOR_EVERY === 0 ? GRID_COLORS.major : GRID_COLORS.minor
    line([-GRID_HALF_CELLS, 0, cell], [GRID_HALF_CELLS, 0, cell], cell === 0 ? GRID_COLORS.xAxis : plain)
    line([cell, 0, -GRID_HALF_CELLS], [cell, 0, GRID_HALF_CELLS], cell === 0 ? GRID_COLORS.zAxis : plain)
  }
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
}

/** The 3D grid (CA-16): 100 × 100 cells of the grid size, shown with the grid toggle. */
function createGrid3d(game: Game) {
  const lines = new THREE.LineSegments(gridLines(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }))
  lines.name = 'waica:editor-grid-3d'
  lines.frustumCulled = false
  lines.visible = false
  addOverlay(game, lines)
  return (grid: GridSettings, visible: boolean): void => {
    lines.visible = visible
    lines.scale.set(grid.size, 1, grid.size)
  }
}

export type Overlays3d = ReturnType<typeof createOverlays3d>

export function createOverlays3d(game: Game) {
  const grid = createGrid3d(game)
  const selection = createSelectionBoxes(game)
  const icons = createIcons3d(game)
  const helpers = createHelpers3d(game)
  return {
    /** Draws everything while `active` (a 3D scene being edited), and hides it otherwise. */
    update(live: ViewportLive, active: boolean): void {
      grid(live.grid, active && live.grid.show)
      selection.sync(live, active)
      icons.sync(live, active)
      helpers.sync(live, active && live.helpers3d !== false)
    },
    /** The extra targets a click is tested against beside the Model roots. */
    targets: (): PickTarget[] => icons.targets(),
  }
}
