import { applyTransformJson, loadScene, type Game, type SceneCameraJson } from '@waica/engine'
import { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useRef, type Ref, type RefObject } from 'react'
import { createFrameOverlays, type OverlayHost } from './viewport-frame-overlays'
import { createEditView3d, type EditView3d, type ScenePoses } from './viewport-3d-view'
import { isThreeDView } from './viewport-camera'
import { canPreview, endBlendPreview, stepBlendPreview, type BlendPreviewTarget } from './viewport-blend-preview'
import { createViewportGame, liveComponent, mountGameCanvas, restoreEditCamera, startFailureMessage } from './viewport-game'
import type { EditCamera, ViewportHandle, ViewportLive } from './viewport-live'

export interface ViewportGameOptions {
  /** Structural changes (create/delete) bump the epoch and recreate the game. */
  epoch: number
  mode: 'edit' | 'play'
  background: number
  showCamera: boolean
  /** Initial camera height in world units (zoom still applies). */
  viewHeight: number
  onSelect: (name: string | null) => void
}

interface SceneSwapTarget {
  gameRef: RefObject<Game | null>
  liveRef: RefObject<ViewportLive>
  camRef: RefObject<EditCamera>
  lastLoadedScenePathRef: RefObject<string | null>
  onSelect: (name: string | null) => void
}

/**
 * Opening a different scene FILE: load it over the SAME Game (ADR 0011)
 * instead of remounting — the [epoch, mode] effect still owns structural
 * (epoch) and edit/play (mode) rebuilds. Keyed on the path, so an ordinary
 * edit (which always produces a new SceneJson) is not mistaken for opening
 * another scene, and so the load the [epoch, mode] effect just did is not
 * repeated on mount.
 */
function useSceneFileSwap(scenePath: string | undefined, target: SceneSwapTarget): void {
  const { gameRef, liveRef, camRef, lastLoadedScenePathRef, onSelect } = target
  const loadOpenedScene = useEffectEvent((path: string | null): void => {
    const game = gameRef.current
    if (!game || path === null || path === lastLoadedScenePathRef.current) return
    lastLoadedScenePathRef.current = path
    loadScene(game, liveRef.current.scene, liveRef.current.registry)
    onSelect(null)
    // The grid overlay, selection/multi-selection gizmos, camera gizmo and
    // edit-mode UI preview all read live state through liveRef and are
    // attached directly to game.scene — untouched by Entity-level unload —
    // so they pick up the new scene on the next frame with no extra wiring.
    // loadScene reframed the camera per the incoming scene's own block (or
    // the constructor's viewHeight with none): restore the editor's pan/zoom.
    if (liveRef.current.mode === 'edit') restoreEditCamera(game, camRef.current)
  })
  useEffect(() => {
    loadOpenedScene(scenePath ?? null)
  }, [scenePath])
}

/**
 * A 3D scene's camera block edited in the Inspector: re-adopt it on the live
 * Game, since nothing else re-places the perspective camera. A 2D scene needs
 * no such push: its overlays read the block every frame.
 */
function useLiveSceneCamera(gameRef: RefObject<Game | null>, camera: SceneCameraJson | undefined): void {
  useEffect(() => {
    const game = gameRef.current
    if (game?.space === '3d') game.setSceneCamera(camera)
  }, [gameRef, camera])
}

/** The editor's own views of a live Game: the 2D pan and zoom it remembers, in edit mode the 3D edit view, and the blend the Inspector previews. */
interface EditorViews {
  cam: RefObject<EditCamera>
  view3d: EditView3d | null
  preview: RefObject<BlendPreviewTarget | null>
}

/**
 * Runs the Game, once its renderer is ready, with the editor overlays drawn every frame, remembering the
 * edit camera's pan as it moves (in 3D, the edit view keeps the Editor Camera); returns what disposes them.
 */
function startEditorLoop(game: Game, host: OverlayHost, { cam, view3d, preview }: EditorViews): () => void {
  const overlays = createFrameOverlays(game, host)
  game.onUpdate((dt) => {
    view3d?.sync()
    overlays.update()
    if (host.live.current.mode === 'edit') stepBlendPreview(game, preview.current, dt)
    if (host.live.current.mode !== 'edit' || isThreeDView(game)) return
    cam.current.x = game.camera.position.x
    cam.current.y = game.camera.position.y
  })
  let disposed = false
  // The first frame waits for the renderer (ADR 0025). A Game disposed in
  // the meantime (StrictMode's double mount, a quick mode switch) never
  // starts, and its renderer's fate is no longer the editor's to report.
  game.ready().then(
    () => {
      if (!disposed) game.start()
    },
    (error: unknown) => {
      if (!disposed) console.error(startFailureMessage(game), error)
    },
  )
  return () => {
    disposed = true
    // A rebuilt Game drops the blend preview: its Animator is a new one.
    preview.current = null
    overlays.dispose()
    view3d?.dispose()
    game.dispose()
  }
}

interface EditViewRefs {
  cam: RefObject<EditCamera>
  /** Set once the 2D view was framed like the scene camera: once per mount. */
  camSeeded: RefObject<boolean>
  live: RefObject<ViewportLive>
  pose3d: RefObject<ScenePoses>
  showCamera: boolean
}

/** The edit views of a new edit-mode Game: the 2D pan and zoom put back (framed like the scene camera the first time), and the 3D edit view. */
function startEditViews(game: Game, canvas: HTMLCanvasElement, refs: EditViewRefs): EditView3d {
  // loadScene framed the scene camera (centered on its follow target): the 2D view starts there, once per mount.
  const seed = !refs.camSeeded.current && refs.showCamera && refs.live.current.scene.camera != null && !isThreeDView(game)
  refs.camSeeded.current = true
  if (seed) refs.cam.current = { x: game.camera.position.x, y: game.camera.position.y, view: game.view }
  restoreEditCamera(game, refs.cam.current)
  return createEditView3d(game, canvas, { live: refs.live, pose: refs.pose3d })
}

/**
 * A fresh canvas in `surface` for one Game, published through `canvasRef`
 * until released. Never the previous Game's canvas: disposing a renderer
 * can lose its canvas's context (three's WebGL2 backend), and a canvas
 * hands every renderer that same context (review #2).
 */
function claimGameCanvas(surface: HTMLElement, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const canvas = mountGameCanvas(surface)
  canvasRef.current = canvas
  return {
    canvas,
    release: (): void => {
      canvas.remove()
      if (canvasRef.current === canvas) canvasRef.current = null
    },
  }
}

/**
 * Owns the live Game behind the Viewport: builds it per [epoch, mode], keeps
 * the latest props readable from its loop, and reloads another scene file
 * over it.
 */
export function useViewportGame(inputs: ViewportLive, options: ViewportGameOptions) {
  const { epoch, mode, background, showCamera, viewHeight, onSelect } = options
  /** The element React renders; each Game gets a fresh canvas inside it. */
  const surfaceRef = useRef<HTMLDivElement>(null)
  /** The live Game's own canvas, null between Games. */
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Edit-mode UI preview: frame-anchored box and the scaled reference box. */
  const uiFrameRef = useRef<HTMLDivElement>(null)
  const uiScaleRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const liveRef = useRef(inputs)
  const camRef = useRef<EditCamera>({ x: 0, y: 0, view: viewHeight })
  /** The edit camera starts framed like the scene camera, once per mount. */
  const camSeededRef = useRef(false)
  /** Live scene-camera position while dragging its gizmo (committed on up). */
  const camLiveRef = useRef<{ x: number; y: number } | null>(null)
  /**
   * The scene FILE last loaded into the live Game — set on (re)creation and
   * by a same-Game reload. Keyed on the path, never on the scene object:
   * every edit commits a fresh SceneJson (ops.* are pure), so an identity
   * check would treat each drag and each prop tweak as "a different scene
   * was opened" and reload the whole thing, clearing the selection mid-drag.
   */
  const lastLoadedScenePathRef = useRef<string | null>(null)
  /** The edit view of a 3D scene, one per edit-mode Game (issue #173). */
  const view3dRef = useRef<EditView3d | null>(null)
  /** The Editor Camera's last pose and its scene, kept across Game rebuilds (Play, structural edits). */
  const pose3dRef = useRef<ScenePoses>(new Map())
  /** The blend the Inspector previews on the live Game (issue 205 CA-21); a rebuilt Game drops it. */
  const previewRef = useRef<BlendPreviewTarget | null>(null)

  // The game loop and pointer handlers read the latest committed props
  // through liveRef. Written after commit (never during render), before
  // the passive effects below that build or reload the Game.
  useLayoutEffect(() => {
    liveRef.current = inputs
  })

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const { canvas, release } = claimGameCanvas(surface, canvasRef)
    const game = createViewportGame(canvas, liveRef.current, { mode, background, viewHeight: camRef.current.view })
    gameRef.current = game
    lastLoadedScenePathRef.current = liveRef.current.scenePath ?? null
    const editRefs = { cam: camRef, camSeeded: camSeededRef, live: liveRef, pose3d: pose3dRef, showCamera }
    const view3d = (view3dRef.current = mode === 'edit' ? startEditViews(game, canvas, editRefs) : null)
    const host = { canvas, live: liveRef, cameraDrag: camLiveRef, frameBox: uiFrameRef, scaleBox: uiScaleRef }
    const stop = startEditorLoop(game, { ...host, showCamera, mode }, { cam: camRef, view3d, preview: previewRef })
    return () => {
      stop()
      gameRef.current = null
      view3dRef.current = null
      release()
    }
    // Every other input is read live through liveRef; background and
    // showCamera are fixed per Viewport instance, so they never force a rebuild.
  }, [epoch, mode, background, showCamera])

  useSceneFileSwap(inputs.scenePath, { gameRef, liveRef, camRef, lastLoadedScenePathRef, onSelect })
  useLiveSceneCamera(gameRef, inputs.scene.camera)
  return { surfaceRef, canvasRef, uiFrameRef, uiScaleRef, gameRef, liveRef, camRef, camLiveRef, view3dRef, previewRef }
}

/** What the Viewport's handle reaches: the live Game, the props it runs under and the blend preview. */
interface HandleRefs {
  gameRef: RefObject<Game | null>
  liveRef: RefObject<ViewportLive>
  previewRef: RefObject<BlendPreviewTarget | null>
}

/** The handle's operations: live edits applied straight to the running Game, and the blend preview on it. */
function viewportHandle({ gameRef, liveRef, previewRef }: HandleRefs): ViewportHandle {
  return {
    applyProp(entityName, componentType, key, value) {
      const component = liveComponent(gameRef.current, entityName, componentType)
      if (component) Reflect.set(component, key, value)
    },
    applyMove(entityName, x, y) {
      // z stays: a 3-number position's depth (and in 2D, its draw order) is not part of an XY move.
      const entity = gameRef.current?.find(entityName)
      entity?.position.set(x, y, entity.position.z)
    },
    applyTransform(entityName, patch) {
      const entity = gameRef.current?.find(entityName)
      if (entity) applyTransformJson(entity, patch)
    },
    game() {
      return gameRef.current
    },
    previewBlend(target) {
      if (!canPreview(gameRef.current, liveRef.current.mode, target)) return false
      previewRef.current = target
      return true
    },
    stopBlendPreview() {
      if (liveRef.current.mode === 'edit') endBlendPreview(gameRef.current, previewRef.current)
      previewRef.current = null
    },
  }
}

/** The Viewport's imperative handle (viewportHandle). */
export function useViewportHandle(ref: Ref<ViewportHandle>, refs: HandleRefs): void {
  useImperativeHandle(ref, () => viewportHandle(refs))
}
