import type { CollisionPoint, Game, GameResolution, InputBindings, SceneJson, SceneRegistry, StatValue, TransformJson } from '@waica/engine'
import type { GridSettings } from '../project/editor-settings'
import type { GizmoSettings } from './editor-view-settings'
import type { TilemapBrushSelection } from './tilemap-brush'
import type { BlendPreviewTarget } from './viewport-blend-preview'

export interface ViewportHandle {
  /** Applies a prop change to the live instance (without recreating the game). */
  applyProp(entity: string, componentType: string, key: string, value: unknown): void
  applyMove(entity: string, x: number, y: number): void
  /** Applies a 3D scene's position, rotation (degrees) or scale edit to the live entity. */
  applyTransform(entity: string, patch: TransformJson): void
  /** The live Game instance, or null before the first mount effect runs. */
  game(): Game | null
  /**
   * Plays the target's blend with its param at its value on the entity's live
   * Animator, one step per frame, in edit mode only (issue 205 CA-21); false
   * when it has no Animator able to play the blend now.
   */
  previewBlend(target: BlendPreviewTarget): boolean
  /** Ends the running blend preview: its Animator back on its initial clip. */
  stopBlendPreview(): void
}

export interface ViewportComponentVisibility {
  appearance: boolean
  collision: boolean
}

/**
 * The latest committed Viewport props the game loop and pointer handlers read
 * live, without rebuilding the Game. Written after commit (never during
 * render), before the passive effects that build or reload the Game.
 */
export interface ViewportLive {
  scene: SceneJson
  scenePath?: string
  sceneCatalog?: Record<string, SceneJson>
  registry: SceneRegistry
  bindings?: InputBindings
  stats?: Record<string, StatValue>
  music?: string
  resolution?: GameResolution
  selected: string | null
  multiSelected?: string[]
  mode: 'edit' | 'play'
  /** The project grid with the scene's projection applied (effectiveGrid). */
  grid: GridSettings
  componentVisibility: ViewportComponentVisibility
  tilemapBrush?: TilemapBrushSelection | null
  /** The project's name: its 3D scenes remember the editor camera's pose under it (issue #173 CA-12). */
  project?: string
  /** Draws the 3D helpers (camera frustum, lights, colliders) in edit mode; the icons do not follow it (issue #173 CA-17). */
  helpers3d?: boolean
  /** The 3D gizmo's mode, space and snap steps (issue #173 CA-18, CA-20). */
  gizmo?: GizmoSettings
  /** Commits the transforms a released gizmo drag left (issue #173 CA-19, CA-21). */
  onTransformed?: (changes: TransformChange[]) => void
}

/** One entity's transform after a gizmo drag, as scene JSON. */
export interface TransformChange {
  name: string
  transform: TransformJson
}

/** The editor's own pan/zoom, kept across Game rebuilds and scene swaps. */
export interface EditCamera {
  x: number
  y: number
  view: number
}

/** The live Game together with the props it is being edited under. */
export interface EditorWorld {
  game: Game
  live: ViewportLive
}

/** The pointer during a drag: its world point and whether Shift inverts snapping. */
export interface DragPointer {
  point: CollisionPoint
  shiftKey: boolean
}
