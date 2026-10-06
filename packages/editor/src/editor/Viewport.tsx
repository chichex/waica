import { forwardRef } from 'react'
import type { CollisionPoint, GameResolution, InputBindings, SceneJson, SceneRegistry, StatValue } from '@waica/engine'
import { DEFAULT_EDITOR_SETTINGS, type GridSettings } from '../project/editor-settings'
import { effectiveGrid } from './effective-grid'
import type { TilemapBrushSelection } from './tilemap-brush'
import { usePrefabDrop } from './use-prefab-drop'
import { useViewportGame, useViewportHandle } from './use-viewport-game'
import { useViewportPointer } from './use-viewport-pointer'
import { frameEditView, zoomEditView } from './viewport-game'
import type { ViewportComponentVisibility, ViewportHandle } from './viewport-live'
import { ViewportGridTools, ViewportNavTools } from './ViewportTools'

export type { ViewportComponentVisibility, ViewportHandle } from './viewport-live'

const DEFAULT_COMPONENT_VISIBILITY: ViewportComponentVisibility = {
  appearance: true,
  collision: true,
}

interface Props {
  scene: SceneJson
  /**
   * The file `scene` came from. A change means another scene was opened, and
   * only that reloads the live Game; edits keep the same path. Absent on the
   * prefab stage, which has no scene file and remounts by React key instead.
   */
  scenePath?: string
  /** Every project scene by catalog name, so Play can resolve a SceneTransition. */
  sceneCatalog?: Record<string, SceneJson>
  /** Components + project-owned prefabs used to load the scene. */
  registry: SceneRegistry
  /** Structural changes (create/delete) bump the epoch and recreate the game. */
  epoch: number
  mode: 'edit' | 'play'
  /** Project control overrides for play mode (action → key codes). */
  bindings?: InputBindings
  /** Project stats (initial values) for play mode. */
  stats?: Record<string, StatValue>
  /**
   * The archetype's own looping music bed (`ArchetypeManifest.music`, a
   * "waica:" registry uri), started only in Play mode — mirroring what the
   * shipped template's `main.ts` does on boot (review finding 2: Play mode
   * is meant to be the game, and it built its own Game without ever doing
   * this). Absent for archetypes that ship no music.
   */
  music?: string
  /** Initial camera height in world units (zoom still applies). */
  viewHeight?: number
  /** Clear color; the prefab stage tints it so the context reads at a glance. */
  background?: number
  /** Fixed game resolution (Project → game): letterboxes play mode. */
  resolution?: GameResolution
  /** Draws the scene camera's frame gizmo (scene viewports; not the prefab stage). */
  showCamera?: boolean
  /** Grid overlay + snap settings (defaults until the project file loads). */
  grid?: GridSettings
  onGridChange?(next: GridSettings): void
  /** Editor-only visibility of the selected entity's internal viewport layers. */
  componentVisibility?: ViewportComponentVisibility
  tilemapBrush?: TilemapBrushSelection | null
  onTilemapStroke?(name: string, cells: number[]): void
  /** The selected entity name, or CAMERA_NODE for the scene camera. */
  selected: string | null
  /** Names in the multi-selection; dragging any member moves the whole group. */
  multiSelected?: string[]
  onSelect(name: string | null): void
  /** Shift-click on an entity: toggles it in the multi-selection. */
  onToggleSelect?(name: string): void
  /** Marquee (Shift-drag on empty space): replaces the selection wholesale. */
  onRangeSelect?(names: string[]): void
  onSelectCamera?(): void
  onMoved(name: string, position: [number, number]): void
  /** Commits a group drag as one undo step (multi-selection moves). */
  onMovedMany?(moves: Array<{ name: string; position: [number, number] }>): void
  /** Reports a scene-camera drag on pointer-up. */
  onCameraMoved?(position: [number, number]): void
  /**
   * Reports a box resize (collision or appearance corner-handle drag) on
   * pointer-up. The dragged corner moves and the opposite one stays pinned,
   * so the box's center shifts too — hence the offset.
   */
  onBoxResized?(
    name: string,
    componentType: string,
    size: [number, number],
    offset: [number, number],
  ): void
  /** Reports a component box offset after its outline is dragged. */
  onBoxMoved?(name: string, componentType: string, offset: [number, number]): void
  /** Reports freeform collision vertices after a polygon handle drag. */
  onPolygonChanged?(name: string, componentType: string, points: CollisionPoint[]): void
  /** Accepts 'waica/prefab' drops (refs); omit to reject drops (prefab stage). */
  onDropPrefab?(ref: string, world: [number, number]): void
}

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(
  { scene, scenePath, sceneCatalog, registry, epoch, mode, bindings, stats, music, viewHeight = 12, background = 0x1a1a2e, resolution, showCamera = false, grid = DEFAULT_EDITOR_SETTINGS.grid, onGridChange, componentVisibility = DEFAULT_COMPONENT_VISIBILITY, tilemapBrush, onTilemapStroke, selected, multiSelected, onSelect, onToggleSelect, onRangeSelect, onSelectCamera, onMoved, onMovedMany, onCameraMoved, onBoxResized, onBoxMoved, onPolygonChanged, onDropPrefab },
  ref,
) {
  const live = { scene, scenePath, sceneCatalog, registry, bindings, stats, music, resolution, selected, multiSelected, mode, grid: effectiveGrid(scene, grid), componentVisibility, tilemapBrush }
  const session = useViewportGame(live, { epoch, mode, background, showCamera, viewHeight, onSelect })
  const { surfaceRef, uiFrameRef, uiScaleRef, gameRef } = session
  useViewportHandle(ref, gameRef)
  const pointer = useViewportPointer(
    { ...session, showCamera },
    { onSelect, onToggleSelect, onRangeSelect, onSelectCamera, onMoved, onMovedMany, onCameraMoved, onBoxResized, onBoxMoved, onPolygonChanged, onTilemapStroke },
  )
  const drop = usePrefabDrop({ ...session, onDropPrefab })

  return (
    <>
      <div
        ref={surfaceRef}
        className={`ed-viewport ${mode === 'edit' ? 'is-edit' : 'is-play'} ${drop.dropHover ? 'is-dropping' : ''}`}
        {...pointer.handlers}
        {...drop.handlers}
      />
      {pointer.marqueeRect && <div className="ed-marquee" style={pointer.marqueeRect} />}
      {mode === 'edit' && showCamera && (
        <div ref={uiFrameRef} className="ed-vp-ui">
          <div ref={uiScaleRef} />
        </div>
      )}
      {mode === 'edit' && onGridChange && <ViewportGridTools grid={grid} onGridChange={onGridChange} />}
      {mode === 'edit' && (
        <ViewportNavTools
          onZoom={(factor) => zoomEditView(session, factor)}
          onFrameCamera={showCamera ? () => frameEditView(session) : undefined}
        />
      )}
    </>
  )
})
