import type {
  InputBindings,
  PrefabJson,
  SceneCameraJson,
  SceneEntityJson,
  SceneJson,
} from '@waica/engine'
import type { ResolutionSetting } from '../../project/game'
import type { MachineProps } from '../../project/states'
import type { ProjectStats } from '../../project/stats'
import type { StateTarget } from '../StateMachinePanel'
import type { TilemapBrushSelection } from '../tilemap-brush'
import type { ArtItem, DroppedFile } from '../use-project-art'
import type { ViewportComponentVisibility } from '../Viewport'

/** What the inspector is editing, mirroring the explorer view. */
export type InspectorSelection =
  | { kind: 'scene'; name: string; scene: SceneJson }
  | { kind: 'entity'; entity: SceneEntityJson; sceneName: string }
  | { kind: 'multi'; entities: SceneEntityJson[]; sceneName: string }
  | { kind: 'camera'; camera: SceneCameraJson | undefined; entityNames: string[] }
  | { kind: 'prefab'; ref: string; prefab: PrefabJson }
  | { kind: 'ui'; name: string }
  | { kind: 'script'; name: string }
  | { kind: 'art'; label: string; dims: [number, number] | null }
  | { kind: 'controls' }
  | { kind: 'stats' }
  | { kind: 'game' }
  | null

/** Whose AnimatedSprite the animation editor should open on. */
export type AnimTarget = { kind: 'prefab'; ref: string } | { kind: 'entity'; name: string }

export interface InspectorProps {
  selection: InspectorSelection
  prefabs: Record<string, PrefabJson>
  /** Project stats and merged actions available to typed-reference pickers. */
  stats: ProjectStats
  actions: InputBindings
  /**
   * The project's whole art library (images and sounds). Consumers that
   * pick a texture (Appearance, Tilemap, Animation) filter this to kind
   * 'image' themselves; a ref: 'sound' prop's picker reads from it via
   * RefTargetsContext instead.
   */
  art: ArtItem[]
  /** The project's UI piece names (src/ui/<name>.html), offered by ref: 'ui' pickers. */
  uiPieces?: readonly string[]
  urlFor(uri: string): string
  onImportArt(files: DroppedFile[]): Promise<void>
  viewportVisibility: ViewportComponentVisibility
  onViewportVisibility(role: keyof ViewportComponentVisibility, visible: boolean): void
  onRename(from: string, to: string): void
  onMove(name: string, position: [number, number]): void
  onProp(entity: string, componentType: string, key: string, value: unknown): void
  /** Writes one prop to every named entity in a single undo step (multi-selection). */
  onMultiProp(names: string[], componentType: string, key: string, value: unknown): void
  /** Clears one instance override so the prop falls back to the prefab's value. */
  onResetProp(entity: string, componentType: string, key: string): void
  /** Writes one override into the prefab (all instances) and clears it here. */
  onApplyProp(entity: string, componentType: string, key: string): void
  /** Clears every override on this instance. */
  onResetAllProps(entity: string): void
  /** Writes every override into the prefab and clears them here. */
  onApplyAllProps(entity: string): void
  onAddComponent(entity: string, type: string): void
  onRemoveComponent(entity: string, type: string): void
  onSetEntityCollision(entity: string, type: 'Hitbox' | 'Solid' | null): void
  /** Points an entity component at a texture (instance override on prefabs). */
  onSetTexture(entity: string, componentType: string, uri: string): void
  tilemapBrush?: TilemapBrushSelection | null
  onTilemapBrush?(selection: TilemapBrushSelection | null): void
  onDelete(name: string): void
  onOpenPrefab(ref: string): void
  onPrefabProp(ref: string, componentType: string, key: string, value: unknown): void
  onPrefabAddComponent(ref: string, type: string): void
  onPrefabRemoveComponent(ref: string, type: string): void
  onPrefabToggleAnimated(ref: string): void
  onPrefabSetTexture(ref: string, uri: string): void
  /** Image -> shape swap: drops the texture and any clips. */
  onPrefabSetShape(ref: string): void
  onPrefabSetCollision(ref: string, enabled: boolean): void
  onEditAnimation(target: AnimTarget): void
  /** Sets one prop of the open scene's camera block (undefined deletes it). */
  onCameraProp(key: string, value: unknown): void
  /** Sets one prop of the open scene's render block (undefined deletes it). */
  onRenderProp(key: string, value: unknown): void
  /** Project art scale (game.json), for pixel↔unit conversions. */
  pixelsPerUnit: number
  /** Project resolution (game.json), for the camera view's aspect. */
  resolution: ResolutionSetting
  /** The open scene's camera block, for "fill camera" on an entity's appearance. */
  sceneCamera: SceneCameraJson | undefined
  /** Sets an appearance's size (and optionally offset) as ONE undo step. */
  onSizeAppearance(
    entity: string,
    componentType: string,
    patch: { width: number; height: number; offsetX?: number; offsetY?: number },
  ): void
  /** Prefab-level twin of onSizeAppearance (size only — prefabs have no camera). */
  onPrefabSizeAppearance(
    ref: string,
    componentType: string,
    size: { width: number; height: number },
  ): void
  /** Basenames in src/states/ — the state code files the editor can see. */
  stateFiles: string[]
  /** Basenames in src/roles/ — the custom role files the editor can see. */
  roleFiles: string[]
  /** StateMachine props patch on an entity's own component (inline entities). */
  onMachinePatch(entity: string, patch: Partial<MachineProps>): void
  /** StateMachine props patch on a prefab — reaches every instance. */
  onPrefabMachinePatch(ref: string, patch: Partial<MachineProps>): void
  /** Scaffolds src/roles/<role>.ts (never overwrites). */
  onCreateRoleFile(role: string): void
  /** Opens the state editor modal. */
  onEditState(target: StateTarget): void
}
