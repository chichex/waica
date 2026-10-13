// The edit view of a 3D scene (issue #173, ADR 0030), one per edit-mode Game:
// the Editor Camera the Game draws through while the live scene is 3D, its
// first pose (remembered for the scene, else the scene camera's), the pose it
// remembers per scene, and the moves the viewport's keys and buttons make.
import { THREE, type Entity, type Game } from '@waica/engine'
import type { RefObject } from 'react'
import { EditorCamera } from './editor-camera'
import type { ViewportLive } from './viewport-live'
import { loadCameraPose, saveCameraPose, type CameraPose } from './workspace'

/** The pose the editor camera last settled at, for the scene it was in: kept across Game rebuilds. */
export interface ScenePose {
  scenePath: string | null
  pose: CameraPose
}

export interface EditView3dHost {
  live: RefObject<ViewportLive>
  pose: RefObject<ScenePose | null>
}

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

/**
 * The pose the Editor Camera keeps per scene (CA-12): every pose it settles at
 * is remembered for the session and stored under the project; seeding a
 * scene takes the scene camera's lens, then this session's pose, else the
 * stored one, else the scene camera's own.
 */
function scenePoseMemory(editor: EditorCamera, host: EditView3dHost) {
  let seeding = false
  const scenePath = (): string | null => host.live.current.scenePath ?? null
  editor.onPoseChange((pose) => {
    if (seeding) return
    const path = scenePath()
    host.pose.current = { scenePath: path, pose }
    const project = host.live.current.project
    if (project && path) saveCameraPose(project, path, pose)
  })
  return {
    seed(): void {
      const path = scenePath()
      const project = host.live.current.project
      const kept = host.pose.current?.scenePath === path ? host.pose.current.pose : project && path ? loadCameraPose(project, path) : null
      seeding = true
      try {
        editor.adoptSceneCamera(host.live.current.scene.camera)
        if (kept) editor.setPose(kept)
      } finally {
        seeding = false
      }
    },
  }
}

export type EditView3d = ReturnType<typeof createEditView3d>

export function createEditView3d(game: Game, canvas: HTMLCanvasElement, host: EditView3dHost) {
  const editor = new EditorCamera(canvas)
  const memory = scenePoseMemory(editor, host)
  /** The scene path the pose was seeded for; undefined while the live scene is 2D. */
  let seededFor: string | null | undefined
  const scenePath = (): string | null => host.live.current.scenePath ?? null

  /** Draws a 3D scene through the editor camera and a 2D one through its own; reseeds when another scene opens. */
  const sync = (): void => {
    const threeD = game.space === '3d'
    editor.controls.enabled = threeD
    if (!threeD) {
      seededFor = undefined
      return
    }
    if (seededFor !== scenePath()) {
      memory.seed()
      seededFor = scenePath()
    }
    if (game.camera !== editor.camera) game.cameraRig.setViewCamera(editor.camera)
  }

  const isActive = (): boolean => game.space === '3d' && host.live.current.mode === 'edit'

  sync()
  return {
    camera: editor,
    sync,
    /** True while the live scene is 3D and edited: the moves below apply. */
    isActive,
    /** Zooms the Editor Camera by `factor` (the toolbar's ＋ and −). */
    zoom: (factor: number): void => {
      if (isActive()) editor.zoom(factor)
    },
    /** Back to the scene camera's lens and pose (🎥). */
    resetToScene: (): void => {
      if (isActive()) editor.adoptSceneCamera(host.live.current.scene.camera)
    },
    /** Frames the selection (F); a no-op with none. */
    frameSelection: (): void => {
      const bounds = isActive() ? selectionBounds(game, host.live.current) : null
      if (bounds) editor.frame(bounds)
    },
    dispose: (): void => {
      if (game.camera === editor.camera) game.cameraRig.setViewCamera(null)
      editor.dispose()
    },
  }
}
