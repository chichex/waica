// Everything the editor draws over the live Game, refreshed once per frame
// from the latest committed props: the grid, the selection gizmos, the
// scene-camera gizmo, each Light's radius and the edit-mode UI preview.
import { THREE, type Game } from '@waica/engine'
import type { RefObject } from 'react'
import type { GridSettings } from '../project/editor-settings'
import { createCameraGizmo, sceneCameraFrame } from './viewport-camera-gizmo'
import { gridCoverKey, gridLineVertices } from './grid'
import type { ViewportLive } from './viewport-live'
import { createLightGizmos } from './viewport-light-gizmos'
import { addOverlay, createSelectionGizmos } from './viewport-selection-gizmos'
import { createUiPreview, type UiPreviewHost } from './viewport-ui-preview'

export interface OverlayHost extends UiPreviewHost {
  live: RefObject<ViewportLive>
  /** Live scene-camera position while its gizmo is dragged (committed on pointer-up). */
  cameraDrag: RefObject<{ x: number; y: number } | null>
  /** Draws the scene camera's frame gizmo (scene viewports; not the prefab stage). */
  showCamera: boolean
  /** The mode this Game was built for; the UI preview exists only in edit mode. */
  mode: 'edit' | 'play'
}

/**
 * Grid lines covering the visible rect, behind the scene. Regenerated only
 * when the cover key changes (pan across a cell boundary, zoom, or a
 * settings change).
 */
function createGridOverlay(game: Game) {
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x3a3a5e, transparent: true, opacity: 0.45 }),
  )
  lines.position.z = -1
  lines.frustumCulled = false
  lines.visible = false
  addOverlay(game, lines)
  let coverKey = ''
  return {
    sync(grid: GridSettings, editing: boolean): void {
      lines.visible = editing && grid.show
      if (!lines.visible) return
      const c = game.camera
      const rect = {
        minX: c.position.x + c.left,
        maxX: c.position.x + c.right,
        minY: c.position.y + c.bottom,
        maxY: c.position.y + c.top,
      }
      const key = gridCoverKey(grid, rect)
      if (key === coverKey) return
      coverKey = key
      lines.geometry.dispose()
      lines.geometry = new THREE.BufferGeometry()
      lines.geometry.setAttribute('position', new THREE.BufferAttribute(gridLineVertices(grid, rect), 3))
    },
  }
}

export function createFrameOverlays(game: Game, host: OverlayHost) {
  const grid = createGridOverlay(game)
  const selection = createSelectionGizmos(game)
  const lights = createLightGizmos(game)
  const camera = host.showCamera ? createCameraGizmo(game) : null
  const uiPreview = host.mode === 'edit' && host.showCamera ? createUiPreview(game, host) : null

  const syncCamera = (live: ViewportLive): void => {
    if (!camera) return
    if (live.mode !== 'edit') {
      camera.hide()
      return
    }
    const frame = sceneCameraFrame(game, live, host.cameraDrag.current)
    camera.show(frame)
    // The scene's UI pieces ride the frame, live HTML previewing play.
    uiPreview?.sync(live, frame)
  }

  return {
    update(): void {
      const live = host.live.current
      grid.sync(live.grid, live.mode === 'edit')
      selection.sync(live)
      lights.sync(live.mode)
      syncCamera(live)
    },
    dispose(): void {
      selection.restore()
      uiPreview?.dispose()
    },
  }
}
