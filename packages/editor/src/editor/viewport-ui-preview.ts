// Edit-mode UI preview: the scene's UI pieces as live HTML anchored to the
// scene-camera frame — the same runtime play uses, scaled into the gizmo.
import { GameUi, type Game } from '@waica/engine'
import type { RefObject } from 'react'
import type { SceneCameraFrame } from './viewport-camera-gizmo'
import type { ViewportLive } from './viewport-live'
import { uiFrameLayout, type UiFrameLayout } from './ui-preview'

export interface UiPreviewHost {
  canvas: HTMLCanvasElement
  /** Positioned over the camera frame; hidden while no piece is shown. */
  frameBox: RefObject<HTMLDivElement | null>
  /** Sized like play's canvas and scaled into the frame; the pieces mount here. */
  scaleBox: RefObject<HTMLDivElement | null>
}

interface PreviewElements {
  frameEl: HTMLDivElement
  scaleEl: HTMLDivElement
}

/** The scene's pieces shown on the preview runtime, following the scene and the project catalog. */
function createPieceSet(ui: GameUi) {
  /** Pieces currently shown, and the last piece catalog fed to defineAll. */
  const shown = new Set<string>()
  let catalog: Record<string, string> | undefined
  return {
    get empty(): boolean {
      return shown.size === 0
    },
    sync(live: ViewportLive): void {
      const pieces = live.scene.ui ?? []
      const next = live.registry.ui ?? {}
      if (catalog !== next) {
        catalog = next
        ui.defineAll(next)
      }
      // Pieces missing from the catalog are skipped, not warned: the
      // scene may list a piece deleted from the project.
      for (const name of pieces) {
        if (shown.has(name) || !(name in next)) continue
        ui.show(name)
        shown.add(name)
      }
      for (const name of [...shown].filter((piece) => !pieces.includes(piece))) {
        ui.hide(name)
        shown.delete(name)
      }
    },
  }
}

function applyFrameLayout({ frameEl, scaleEl }: PreviewElements, box: UiFrameLayout, reference: { width: number; height: number }): void {
  frameEl.style.display = 'block'
  frameEl.style.left = `${box.left}px`
  frameEl.style.top = `${box.top}px`
  frameEl.style.width = `${box.width}px`
  frameEl.style.height = `${box.height}px`
  scaleEl.style.width = `${reference.width}px`
  scaleEl.style.height = `${reference.height}px`
  scaleEl.style.transform = `scale(${box.scale})`
}

export function createUiPreview(game: Game, host: UiPreviewHost) {
  const { canvas, frameBox, scaleBox } = host
  const ui = new GameUi(game.stats, () => scaleBox.current ?? canvas.parentElement ?? document.body)
  const pieces = createPieceSet(ui)

  const layout = (elements: PreviewElements, frame: SceneCameraFrame, live: ViewportLive): void => {
    // The HTML is authored against play's canvas: the fixed game
    // resolution, or (filling play) this same viewport panel.
    const canvasSize = { width: canvas.clientWidth, height: canvas.clientHeight }
    const reference = live.resolution ?? canvasSize
    const c = game.camera
    const box = uiFrameLayout(
      { left: c.left, right: c.right, top: c.top, bottom: c.bottom, x: c.position.x, y: c.position.y },
      { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      canvasSize,
      reference,
    )
    applyFrameLayout(elements, box, reference)
  }

  return {
    sync(live: ViewportLive, frame: SceneCameraFrame): void {
      const frameEl = frameBox.current
      const scaleEl = scaleBox.current
      if (!frameEl || !scaleEl) return
      pieces.sync(live)
      if (pieces.empty) frameEl.style.display = 'none'
      else layout({ frameEl, scaleEl }, frame, live)
    },
    dispose(): void {
      ui.dispose()
    },
  }
}
