// The live Game behind the Viewport: how one is built for an [epoch, mode]
// pair, and the imperative operations the editor applies to it (live props,
// its own pan/zoom, framing the scene camera).
import { Game, loadScene, resolveSceneCamera, type Component } from '@waica/engine'
import type { RefObject } from 'react'
import { projectionOf } from './viewport-boxes'
import type { EditCamera, ViewportLive } from './viewport-live'
import { renderPoint } from './viewport-space'

export interface GameBuild {
  mode: 'edit' | 'play'
  background: number
  viewHeight: number
}

/** A Game over `canvas` with the live scene loaded, simulating (and playing music) only in Play. */
export function createViewportGame(canvas: HTMLCanvasElement, live: ViewportLive, build: GameBuild): Game {
  const { mode, background, viewHeight } = build
  // Bindings/stats are read live: project edits apply on the next Play (new Game).
  const game = new Game({
    canvas,
    viewHeight,
    background,
    // Edit mode always fills the canvas; play previews the real letterbox.
    resolution: mode === 'play' ? live.resolution : undefined,
    bindings: live.bindings,
    stats: live.stats,
  })
  // Registered before the load so a scene's own code can already resolve
  // its siblings. Without it a SceneTransition crossed in Play would only
  // log `unknown scene` — the editor would host the feature it cannot run.
  if (live.sceneCatalog) {
    game.registerSceneCatalog({ scenes: live.sceneCatalog, registry: live.registry })
  }
  loadScene(game, live.scene, live.registry)
  game.simulate = mode === 'play'
  // Play mode is meant to be the game (review finding 2): start the
  // archetype's music bed the same way the shipped template's main.ts
  // does on boot, mirrored here because Play builds its own Game instead
  // of running that file. game.audio resolves the "waica:" uri itself
  // through the scene catalog registered just above — no manual
  // resolveAsset step, matching the template. Gated on mode rather than
  // "a Game was built", so it never starts in edit mode; the Viewport's
  // [epoch, mode] cleanup disposes this Game (and with it every live
  // sound, CA-10) when Play ends, so the bed never survives into edit mode.
  if (mode === 'play' && live.music) {
    game.audio.play(live.music, { channel: 'music', loop: true, scope: 'session' })
  }
  return game
}

/** Puts the editor's own pan/zoom back over whatever loadScene framed. */
export function restoreEditCamera(game: Game, cam: EditCamera): void {
  game.camera.position.x = cam.x
  game.camera.position.y = cam.y
  game.setViewHeight(cam.view)
}

/** The first live component of `componentType` on the named entity, if any. */
export function liveComponent(game: Game | null, entityName: string, componentType: string): Component | undefined {
  const entity = game?.find(entityName)
  return entity?.components.find(
    (candidate) =>
      (candidate.constructor as { componentName?: string }).componentName === componentType,
  )
}

/** Zooms the edit view by `factor`, remembering the result as the editor's own zoom. */
function zoomEditCamera(game: Game, cam: EditCamera, factor: number): void {
  game.setViewHeight(game.view * factor)
  cam.view = game.view
}

/** Jumps the view to the scene camera's framing (its target's, when following); returns the new pan/zoom. */
export function frameSceneCamera(game: Game, live: ViewportLive): EditCamera {
  const sceneCam = resolveSceneCamera(live.scene.camera)
  const target = sceneCam.follow ? game.find(sceneCam.follow) : undefined
  const [x, y] = target
    ? renderPoint(projectionOf(live.scene), target.position.x, target.position.y)
    : sceneCam.position
  game.camera.position.x = x
  game.camera.position.y = y
  game.setViewHeight(sceneCam.zoom)
  return { x, y, view: game.view }
}

/** The refs behind the editor's own view of the live Game. */
export interface EditViewSession {
  gameRef: RefObject<Game | null>
  liveRef: RefObject<ViewportLive>
  camRef: RefObject<EditCamera>
}

/** Zooms the edit view (buttons and wheel); a no-op outside edit mode. */
export function zoomEditView({ gameRef, liveRef, camRef }: EditViewSession, factor: number): void {
  const game = gameRef.current
  if (!game || liveRef.current.mode !== 'edit') return
  zoomEditCamera(game, camRef.current, factor)
}

/** Jumps the edit view to the scene camera's framing; a no-op outside edit mode. */
export function frameEditView({ gameRef, liveRef, camRef }: EditViewSession): void {
  const game = gameRef.current
  if (!game || liveRef.current.mode !== 'edit') return
  camRef.current = frameSceneCamera(game, liveRef.current)
}
