import { loadScene, type Game } from '@waica/engine'
import { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useRef, type Ref, type RefObject } from 'react'
import { createFrameOverlays, type OverlayHost } from './viewport-frame-overlays'
import { createViewportGame, liveComponent, restoreEditCamera } from './viewport-game'
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
 * Runs the Game with the editor overlays drawn every frame, remembering the
 * edit camera's pan as it moves; returns what disposes both.
 */
function startEditorLoop(game: Game, host: OverlayHost, camRef: RefObject<EditCamera>): () => void {
  const overlays = createFrameOverlays(game, host)
  game.onUpdate(() => {
    overlays.update()
    if (host.live.current.mode !== 'edit') return
    camRef.current.x = game.camera.position.x
    camRef.current.y = game.camera.position.y
  })
  game.start()
  return () => {
    overlays.dispose()
    game.dispose()
  }
}

/**
 * Owns the live Game behind the Viewport: builds it per [epoch, mode], keeps
 * the latest props readable from its loop, and reloads another scene file
 * over it.
 */
export function useViewportGame(inputs: ViewportLive, options: ViewportGameOptions) {
  const { epoch, mode, background, showCamera, viewHeight, onSelect } = options
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

  // The game loop and pointer handlers read the latest committed props
  // through liveRef. Written after commit (never during render), before
  // the passive effects below that build or reload the Game.
  useLayoutEffect(() => {
    liveRef.current = inputs
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const game = createViewportGame(canvas, liveRef.current, { mode, background, viewHeight: camRef.current.view })
    gameRef.current = game
    lastLoadedScenePathRef.current = liveRef.current.scenePath ?? null
    if (mode === 'edit') {
      // loadScene framed the scene camera (centered on its follow target):
      // the editor view starts there, once per mount.
      const seed = !camSeededRef.current && showCamera && liveRef.current.scene.camera != null
      camSeededRef.current = true
      if (seed) camRef.current = { x: game.camera.position.x, y: game.camera.position.y, view: game.view }
      restoreEditCamera(game, camRef.current)
    }
    const host = { canvas, live: liveRef, cameraDrag: camLiveRef, frameBox: uiFrameRef, scaleBox: uiScaleRef }
    const stop = startEditorLoop(game, { ...host, showCamera, mode }, camRef)
    return () => {
      stop()
      gameRef.current = null
    }
    // Every other input is read live through liveRef; background and
    // showCamera are fixed per Viewport instance, so they never force a rebuild.
  }, [epoch, mode, background, showCamera])

  useSceneFileSwap(inputs.scenePath, { gameRef, liveRef, camRef, lastLoadedScenePathRef, onSelect })
  return { canvasRef, uiFrameRef, uiScaleRef, gameRef, liveRef, camRef, camLiveRef }
}

/** The Viewport's imperative handle: live edits applied straight to the running Game. */
export function useViewportHandle(ref: Ref<ViewportHandle>, gameRef: RefObject<Game | null>): void {
  useImperativeHandle(ref, () => ({
    applyProp(entityName, componentType, key, value) {
      const component = liveComponent(gameRef.current, entityName, componentType)
      if (component) Reflect.set(component, key, value)
    },
    applyMove(entityName, x, y) {
      gameRef.current?.find(entityName)?.position.set(x, y, 0)
    },
    game() {
      return gameRef.current
    },
  }))
}
