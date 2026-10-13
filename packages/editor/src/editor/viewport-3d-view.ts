// The edit view of a 3D scene (issue #173, ADR 0030), one per edit-mode Game:
// the Editor Camera the Game draws through while the live scene is 3D, its
// first pose (remembered for the scene, else the scene camera's), the pose it
// remembers per scene, and the moves the viewport's keys and buttons make.
import { raycastPick, type Game, type PickedTarget, type RaycastPick } from '@waica/engine'
import type { RefObject } from 'react'
import { EditorCamera } from './editor-camera'
import { createOverlays3d, selectionBounds, type Overlays3d } from './viewport-3d-overlays'
import type { ViewportLive } from './viewport-live'
import { loadCameraPose, saveCameraPose, type CameraPose } from './workspace'

/** The pose the editor camera last settled at, per scene path: kept across Game rebuilds. */
export type ScenePoses = Map<string | null, CameraPose>

export interface EditView3dHost {
  live: RefObject<ViewportLive>
  pose: RefObject<ScenePoses>
}

/**
 * The pose the Editor Camera keeps per scene (CA-12): every pose it settles at
 * is remembered for the session, per scene path and stored under the project; seeding a
 * scene takes the scene camera's lens, then this session's pose, else the
 * stored one, else the scene camera's own.
 */
function scenePoseMemory(editor: EditorCamera, host: EditView3dHost) {
  let seeding = false
  const scenePath = (): string | null => host.live.current.scenePath ?? null
  editor.onPoseChange((pose) => {
    if (seeding) return
    const path = scenePath()
    host.pose.current.set(path, pose)
    const project = host.live.current.project
    if (project && path) saveCameraPose(project, path, pose)
  })
  return {
    seed(): void {
      const path = scenePath()
      const project = host.live.current.project
      const kept = host.pose.current.get(path) ?? (project && path ? loadCameraPose(project, path) : null)
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

/**
 * Keeps the Game drawing through the Editor Camera while its scene is 3D, and
 * through its own camera while it is 2D; seeds the pose when another scene opens.
 */
function cameraSession(game: Game, editor: EditorCamera, host: EditView3dHost) {
  const memory = scenePoseMemory(editor, host)
  /** The scene path the pose was seeded for; undefined while the live scene is 2D. */
  let seededFor: string | null | undefined
  return (): void => {
    const threeD = game.space === '3d'
    editor.controls.enabled = threeD
    if (!threeD) {
      seededFor = undefined
      return
    }
    const path = host.live.current.scenePath ?? null
    if (seededFor !== path) {
      memory.seed()
      seededFor = path
    }
    if (game.camera !== editor.camera) game.cameraRig.setViewCamera(editor.camera)
  }
}

export type EditView3d = ReturnType<typeof createEditView3d>

export function createEditView3d(game: Game, canvas: HTMLCanvasElement, host: EditView3dHost) {
  const editor = new EditorCamera(canvas)
  const syncCamera = cameraSession(game, editor, host)
  // Built when the live scene first is 3D: a 2D scene (and the prefab stage) pays nothing for it.
  let overlays: Overlays3d | null = null
  const isActive = (): boolean => game.space === '3d' && host.live.current.mode === 'edit'
  /** Once per frame: the camera the Game draws through, and the overlays of an edited 3D scene. */
  const sync = (): void => {
    syncCamera()
    const active = isActive()
    if (active) overlays ??= createOverlays3d(game)
    overlays?.update(host.live.current, active)
  }

  sync()
  return {
    camera: editor,
    sync,
    /** True while the live scene is 3D and edited: the moves below apply. */
    isActive,
    /** What a click at a client point hits through the editor camera: a Model, an icon, the ground, or nothing (CA-13, CA-14). */
    pick: (clientX: number, clientY: number): RaycastPick<PickedTarget> | null => {
      const at = isActive() ? editor.fractionAt(clientX, clientY) : null
      return at && raycastPick(editor.camera, at, game.entities, overlays?.targets() ?? [])
    },
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
      overlays?.dispose()
      editor.dispose()
    },
  }
}
