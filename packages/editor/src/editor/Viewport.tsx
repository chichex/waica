import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Game, GameUi, loadScene, resolveSceneCamera, THREE, type Entity, type GameResolution, type InputBindings, type SceneJson, type SceneRegistry, type StatValue } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { DEFAULT_EDITOR_SETTINGS, MIN_GRID_SIZE, type GridSettings } from '../project/editor-settings'
import { CAMERA_NODE } from '../scene/ops'
import { gridCoverKey, gridLineVertices, snapActive, snapPoint } from './grid'
import { uiFrameLayout } from './ui-preview'

export interface ViewportHandle {
  /** Applies a prop change to the live instance (without recreating the game). */
  applyProp(entity: string, componentType: string, key: string, value: unknown): void
  applyMove(entity: string, x: number, y: number): void
}

interface Props {
  scene: SceneJson
  /** Components + prefabs to load the scene with (defaults to the archetype's). */
  registry?: SceneRegistry
  /** Structural changes (create/delete) bump the epoch and recreate the game. */
  epoch: number
  mode: 'edit' | 'play'
  /** Project control overrides for play mode (action → key codes). */
  bindings?: InputBindings
  /** Project stats (initial values) for play mode. */
  stats?: Record<string, StatValue>
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
  /** The selected entity name, or CAMERA_NODE for the scene camera. */
  selected: string | null
  onSelect(name: string | null): void
  onSelectCamera?(): void
  onMoved(name: string, position: [number, number]): void
  /** Reports a scene-camera drag on pointer-up. */
  onCameraMoved?(position: [number, number]): void
  /** Reports a box resize (collision or appearance corner-handle drag) on pointer-up. */
  onBoxResized?(name: string, componentType: string, size: [number, number]): void
  /** Accepts 'waica/prefab' drops (refs); omit to reject drops (prefab stage). */
  onDropPrefab?(ref: string, world: [number, number]): void
}

/** An entity's visual size (for picking and the gizmo): the largest of its boxes. */
function entityBounds(entity: Entity): [number, number] {
  let w = 0.6
  let h = 0.6
  for (const c of entity.components) {
    const box = c as unknown as { width?: unknown; height?: unknown }
    if (typeof box.width === 'number' && typeof box.height === 'number') {
      w = Math.max(w, box.width)
      h = Math.max(h, box.height)
    }
  }
  return [w, h]
}

function rectLoop(color: number): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, -0.5, 0),
    new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(-0.5, 0.5, 0),
  ])
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }))
}

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
]

/**
 * The resizable boxes drawn on the selected entity, in hit-test order:
 * collision first (its handles win a shared corner), then the appearance
 * quad in the selection amber.
 */
const BOX_KINDS = [
  { types: ['Hitbox'], color: 0xef476f, role: 'collision' },
  { types: ['Solid'], color: 0x06d6a0, role: 'collision' },
  { types: ['Sprite', 'AnimatedSprite'], color: 0xffb703, role: 'appearance' },
] as const

/** The entity's live component of one of the given types, with its box. */
function findBox(
  entity: Entity,
  types: readonly string[],
): { comp: { width: number; height: number }; type: string } | null {
  for (const c of entity.components) {
    const type = (c.constructor as { componentName?: string }).componentName ?? ''
    if (!types.includes(type)) continue
    const comp = c as unknown as { width?: unknown; height?: unknown }
    if (typeof comp.width === 'number' && typeof comp.height === 'number') {
      return { comp: comp as { width: number; height: number }, type }
    }
  }
  return null
}

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(
  { scene, registry = ACTIVE_ARCHETYPE.registry, epoch, mode, bindings, stats, viewHeight = 12, background = 0x1a1a2e, resolution, showCamera = false, grid = DEFAULT_EDITOR_SETTINGS.grid, onGridChange, selected, onSelect, onSelectCamera, onMoved, onCameraMoved, onBoxResized, onDropPrefab },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const sceneRef = useRef(scene)
  const registryRef = useRef(registry)
  const bindingsRef = useRef(bindings)
  const statsRef = useRef(stats)
  const resolutionRef = useRef(resolution)
  const selectedRef = useRef(selected)
  const modeRef = useRef(mode)
  const gridRef = useRef(grid)
  const [dropHover, setDropHover] = useState(false)
  /** The size field's raw text, so typing "0." doesn't fight the commit. */
  const [sizeText, setSizeText] = useState(String(grid.size))
  const cam = useRef({ x: 0, y: 0, view: viewHeight })
  /** The edit camera starts framed like the scene camera, once per mount. */
  const camSeeded = useRef(false)
  const drag = useRef<{ name: string; ox: number; oy: number } | null>(null)
  const pan = useRef<{ px: number; py: number } | null>(null)
  const resize = useRef<{ name: string; compType: string } | null>(null)
  const camDrag = useRef<{ ox: number; oy: number } | null>(null)
  /** Live scene-camera position while dragging its gizmo (committed on up). */
  const camLive = useRef<{ x: number; y: number } | null>(null)
  /** Edit-mode UI preview: frame-anchored box and the scaled reference box. */
  const uiFrameRef = useRef<HTMLDivElement>(null)
  const uiScaleRef = useRef<HTMLDivElement>(null)

  sceneRef.current = scene
  registryRef.current = registry
  bindingsRef.current = bindings
  statsRef.current = stats
  resolutionRef.current = resolution
  selectedRef.current = selected
  modeRef.current = mode
  gridRef.current = grid

  useEffect(() => {
    setSizeText(String(grid.size))
  }, [grid.size])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Bindings/stats are read via refs: project edits apply on the next Play (new Game).
    const game = new Game({
      canvas,
      viewHeight: cam.current.view,
      background,
      // Edit mode always fills the canvas; play previews the real letterbox.
      resolution: mode === 'play' ? resolutionRef.current : undefined,
      bindings: bindingsRef.current,
      stats: statsRef.current,
    })
    gameRef.current = game
    loadScene(game, sceneRef.current, registryRef.current)
    game.simulate = mode === 'play'
    if (mode === 'edit') {
      if (!camSeeded.current) {
        camSeeded.current = true
        // loadScene framed the scene camera (centered on its follow target):
        // the editor view starts there.
        if (showCamera && sceneRef.current.camera) {
          cam.current = { x: game.camera.position.x, y: game.camera.position.y, view: game.view }
        }
      }
      // Restore the editor's own pan/zoom over whatever loadScene framed.
      game.camera.position.x = cam.current.x
      game.camera.position.y = cam.current.y
      game.setViewHeight(cam.current.view)
    }
    // Grid overlay: lines covering the visible rect, behind the scene.
    // Regenerated only when the cover key changes (pan across a cell
    // boundary, zoom, or a settings change).
    const gridLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x3a3a5e, transparent: true, opacity: 0.45 }),
    )
    gridLines.position.z = -1
    gridLines.frustumCulled = false
    gridLines.visible = false
    game.scene.add(gridLines)
    let gridKey = ''

    // Selection gizmo: a rectangle around the entity.
    const gizmo = rectLoop(0xffb703)
    gizmo.position.z = 5
    gizmo.visible = false
    game.scene.add(gizmo)

    // Box gizmos: the selected entity's collision and appearance boxes, with
    // corner handles to resize them by dragging.
    const boxGizmos = BOX_KINDS.map(({ types, color, role }) => {
      const loop = rectLoop(color)
      loop.position.z = 5
      loop.visible = false
      game.scene.add(loop)
      const handles = CORNERS.map(() => {
        const handle = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ color }),
        )
        handle.position.z = 5.1
        handle.visible = false
        game.scene.add(handle)
        return handle
      })
      return { types, role, loop, handles }
    })

    // Scene-camera gizmo: the frame the game will show, its center marker,
    // and (when selected, with limits on) the world bounds.
    const camGizmo = showCamera
      ? {
          frame: rectLoop(0x8d79f0),
          marker: new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ color: 0x8d79f0 }),
          ),
          limits: rectLoop(0xef476f),
        }
      : null
    if (camGizmo) {
      camGizmo.frame.position.z = 4.5
      camGizmo.marker.position.z = 4.6
      camGizmo.limits.position.z = 4.4
      camGizmo.frame.visible = false
      camGizmo.marker.visible = false
      camGizmo.limits.visible = false
      game.scene.add(camGizmo.frame, camGizmo.marker, camGizmo.limits)
    }

    // Edit-mode UI preview: the scene's UI pieces as live HTML anchored to
    // the camera frame — the same runtime play uses, scaled into the gizmo.
    const uiPreview =
      mode === 'edit' && showCamera ? new GameUi(game.stats, () => uiScaleRef.current ?? canvas.parentElement ?? document.body) : null
    /** Pieces currently shown, and the last piece catalog fed to defineAll. */
    const uiShown = new Set<string>()
    let uiCatalog: Record<string, string> | undefined

    game.onUpdate(() => {
      const g = gridRef.current
      gridLines.visible = modeRef.current === 'edit' && g.show
      if (gridLines.visible) {
        const c = game.camera
        const rect = {
          minX: c.position.x + c.left,
          maxX: c.position.x + c.right,
          minY: c.position.y + c.bottom,
          maxY: c.position.y + c.top,
        }
        const key = gridCoverKey(g, rect)
        if (key !== gridKey) {
          gridKey = key
          gridLines.geometry.dispose()
          gridLines.geometry = new THREE.BufferGeometry()
          gridLines.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(gridLineVertices(g, rect), 3),
          )
        }
      }
      const name = selectedRef.current
      const entity = name ? game.find(name) : undefined
      const editing = entity && modeRef.current === 'edit'
      // Handles keep a constant screen size regardless of zoom.
      const hs = game.view * 0.018
      let appearanceShown = false
      for (const g of boxGizmos) {
        const box = editing ? findBox(entity, g.types) : null
        if (editing && box) {
          if (g.role === 'appearance') appearanceShown = true
          g.loop.visible = true
          g.loop.position.set(entity.position.x, entity.position.y, 5)
          g.loop.scale.set(box.comp.width, box.comp.height, 1)
          g.handles.forEach((handle, i) => {
            const [cx, cy] = CORNERS[i] ?? [0, 0]
            handle.visible = true
            handle.position.set(
              entity.position.x + cx * box.comp.width,
              entity.position.y + cy * box.comp.height,
              5.1,
            )
            handle.scale.set(hs, hs, 1)
          })
        } else {
          g.loop.visible = false
          for (const handle of g.handles) handle.visible = false
        }
      }
      if (editing) {
        // The margin rect marks selection; when the appearance gizmo is up it
        // already outlines the entity in the same amber, so skip the double line.
        gizmo.visible = !appearanceShown
        const [w, h] = entityBounds(entity)
        gizmo.position.set(entity.position.x, entity.position.y, 5)
        gizmo.scale.set(w + 0.2, h + 0.2, 1)
      } else {
        gizmo.visible = false
      }
      if (camGizmo) {
        const editView = modeRef.current === 'edit'
        camGizmo.frame.visible = editView
        camGizmo.marker.visible = editView
        if (editView) {
          const sceneCam = resolveSceneCamera(sceneRef.current.camera)
          // Following: the frame rides the target and cannot be dragged, so
          // the viewport always shows the framing play would start with.
          const target = sceneCam.follow ? game.find(sceneCam.follow) : undefined
          const pos = target
            ? { x: target.position.x, y: target.position.y }
            : (camLive.current ?? { x: sceneCam.position[0], y: sceneCam.position[1] })
          const res = resolutionRef.current
          const aspect = res
            ? res.width / res.height
            : (game.camera.right - game.camera.left) / (game.camera.top - game.camera.bottom)
          const color = selectedRef.current === CAMERA_NODE ? 0xffb703 : 0x8d79f0
          ;(camGizmo.frame.material as THREE.LineBasicMaterial).color.setHex(color)
          camGizmo.marker.material.color.setHex(color)
          camGizmo.frame.position.set(pos.x, pos.y, 4.5)
          camGizmo.frame.scale.set(sceneCam.zoom * aspect, sceneCam.zoom, 1)
          // The marker is the camera's drag handle: while following it would
          // just sit on the target and steal its clicks — hide it.
          camGizmo.marker.visible = !target
          const ms = game.view * 0.03
          camGizmo.marker.position.set(pos.x, pos.y, 4.6)
          camGizmo.marker.scale.set(ms, ms, 1)
          const limits = selectedRef.current === CAMERA_NODE ? sceneCam.limits : null
          camGizmo.limits.visible = limits != null
          if (limits) {
            camGizmo.limits.position.set(
              (limits.minX + limits.maxX) / 2,
              (limits.minY + limits.maxY) / 2,
              4.4,
            )
            camGizmo.limits.scale.set(limits.maxX - limits.minX, limits.maxY - limits.minY, 1)
          }

          // The scene's UI pieces ride the frame, live HTML previewing play.
          const frameBox = uiFrameRef.current
          const scaleBox = uiScaleRef.current
          if (uiPreview && frameBox && scaleBox) {
            const pieces = sceneRef.current.ui ?? []
            const catalog = registryRef.current.ui ?? {}
            if (uiCatalog !== catalog) {
              uiCatalog = catalog
              uiPreview.defineAll(catalog)
            }
            // Pieces missing from the catalog are skipped, not warned: the
            // scene may list a piece deleted from the project.
            for (const name of pieces) {
              if (!uiShown.has(name) && name in catalog) {
                uiPreview.show(name)
                uiShown.add(name)
              }
            }
            for (const name of [...uiShown]) {
              if (!pieces.includes(name)) {
                uiPreview.hide(name)
                uiShown.delete(name)
              }
            }
            if (uiShown.size === 0) {
              frameBox.style.display = 'none'
            } else {
              // The HTML is authored against play's canvas: the fixed game
              // resolution, or (filling play) this same viewport panel.
              const canvasSize = { width: canvas.clientWidth, height: canvas.clientHeight }
              const reference = res ?? canvasSize
              const c = game.camera
              const layout = uiFrameLayout(
                { left: c.left, right: c.right, top: c.top, bottom: c.bottom, x: c.position.x, y: c.position.y },
                { x: pos.x, y: pos.y, width: sceneCam.zoom * aspect, height: sceneCam.zoom },
                canvasSize,
                reference,
              )
              frameBox.style.display = 'block'
              frameBox.style.left = `${layout.left}px`
              frameBox.style.top = `${layout.top}px`
              frameBox.style.width = `${layout.width}px`
              frameBox.style.height = `${layout.height}px`
              scaleBox.style.width = `${reference.width}px`
              scaleBox.style.height = `${reference.height}px`
              scaleBox.style.transform = `scale(${layout.scale})`
            }
          }
        } else {
          camGizmo.limits.visible = false
        }
      }
      if (modeRef.current === 'edit') {
        cam.current.x = game.camera.position.x
        cam.current.y = game.camera.position.y
      }
    })

    game.start()
    return () => {
      uiPreview?.dispose()
      game.dispose()
      gameRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, mode])

  useImperativeHandle(ref, () => ({
    applyProp(entityName, componentType, key, value) {
      const entity = gameRef.current?.find(entityName)
      const component = entity?.components.find(
        (c) => (c.constructor as { componentName?: string }).componentName === componentType,
      )
      if (component) (component as unknown as Record<string, unknown>)[key] = value
    },
    applyMove(entityName, x, y) {
      gameRef.current?.find(entityName)?.position.set(x, y, 0)
    },
  }))

  const toWorld = (e: { clientX: number; clientY: number }): [number, number] => {
    const canvas = canvasRef.current
    const game = gameRef.current
    if (!canvas || !game) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const c = game.camera
    return [
      c.position.x + c.left + nx * (c.right - c.left),
      c.position.y + c.top - ny * (c.top - c.bottom),
    ]
  }

  const pickAt = (wx: number, wy: number): Entity | null => {
    const game = gameRef.current
    if (!game) return null
    for (let i = game.entities.length - 1; i >= 0; i--) {
      const entity = game.entities[i]
      if (!entity) continue
      const [w, h] = entityBounds(entity)
      if (Math.abs(wx - entity.position.x) <= w / 2 && Math.abs(wy - entity.position.y) <= h / 2) {
        return entity
      }
    }
    return null
  }

  /** A resize corner handle of the selected entity under the pointer. */
  const hitHandle = (
    wx: number,
    wy: number,
  ): { name: string; compType: string; corner: readonly [number, number] } | null => {
    const game = gameRef.current
    const name = selectedRef.current
    if (!game || !name) return null
    const entity = game.find(name)
    if (!entity) return null
    // Slightly larger than the visual handle so it's easy to grab.
    const hs = game.view * 0.02
    for (const { types } of BOX_KINDS) {
      const box = findBox(entity, types)
      if (!box) continue
      for (const corner of CORNERS) {
        const [cx, cy] = corner
        if (
          Math.abs(wx - (entity.position.x + cx * box.comp.width)) <= hs &&
          Math.abs(wy - (entity.position.y + cy * box.comp.height)) <= hs
        ) {
          return { name, compType: box.type, corner }
        }
      }
    }
    return null
  }

  const zoomBy = (factor: number): void => {
    const game = gameRef.current
    if (!game || modeRef.current !== 'edit') return
    game.setViewHeight(game.view * factor)
    cam.current.view = game.view
  }

  /** Jumps the editor view to the scene camera's framing (its target's, when following). */
  const frameCamera = (): void => {
    const game = gameRef.current
    if (!game || modeRef.current !== 'edit') return
    const sceneCam = resolveSceneCamera(sceneRef.current.camera)
    const target = sceneCam.follow ? game.find(sceneCam.follow) : undefined
    const [x, y] = target
      ? [target.position.x, target.position.y]
      : sceneCam.position
    game.camera.position.x = x
    game.camera.position.y = y
    game.setViewHeight(sceneCam.zoom)
    cam.current = { x, y, view: game.view }
  }

  return (
    <>
    <canvas
      ref={canvasRef}
      className={`ed-viewport ${mode === 'edit' ? 'is-edit' : 'is-play'} ${dropHover ? 'is-dropping' : ''}`}
      onPointerDown={(e) => {
        if (modeRef.current !== 'edit') return
        const [wx, wy] = toWorld(e)
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // synthetic events or already-released pointers: the drag works anyway
        }
        const handle = hitHandle(wx, wy)
        if (handle) {
          resize.current = { name: handle.name, compType: handle.compType }
          return
        }
        // The camera's center marker sits above entities: it wins the pick.
        // While following there is no marker — the camera rides its target
        // and is only selectable from the Explorer.
        const game = gameRef.current
        if (showCamera && onSelectCamera && game) {
          const sceneCam = resolveSceneCamera(sceneRef.current.camera)
          const [px, py] = sceneCam.position
          const hs = game.view * 0.035
          if (!sceneCam.follow && Math.abs(wx - px) <= hs && Math.abs(wy - py) <= hs) {
            onSelectCamera()
            camDrag.current = { ox: wx - px, oy: wy - py }
            return
          }
        }
        const hit = pickAt(wx, wy)
        if (hit) {
          onSelect(hit.name)
          drag.current = { name: hit.name, ox: wx - hit.position.x, oy: wy - hit.position.y }
        } else {
          onSelect(null)
          pan.current = { px: e.clientX, py: e.clientY }
        }
      }}
      onPointerMove={(e) => {
        const game = gameRef.current
        if (!game || modeRef.current !== 'edit') return
        if (resize.current) {
          const [wx, wy] = toWorld(e)
          const entity = game.find(resize.current.name)
          const box = entity && findBox(entity, [resize.current.compType])
          if (entity && box) {
            // Boxes are centered on the entity, so a corner drag resizes
            // symmetrically; sizes snap to half cells (each side moves half).
            const g = gridRef.current
            const snap = snapActive(g.snap, e.shiftKey) ? g.size / 2 : 0
            let w = Math.abs(wx - entity.position.x) * 2
            let h = Math.abs(wy - entity.position.y) * 2
            if (snap) {
              w = Math.round(w / snap) * snap
              h = Math.round(h / snap) * snap
            }
            box.comp.width = Math.max(0.1, w)
            box.comp.height = Math.max(0.1, h)
          }
        } else if (camDrag.current) {
          const [wx, wy] = toWorld(e)
          const g = gridRef.current
          let [x, y] = [wx - camDrag.current.ox, wy - camDrag.current.oy]
          if (snapActive(g.snap, e.shiftKey)) [x, y] = snapPoint(g, x, y)
          camLive.current = { x, y }
        } else if (drag.current) {
          const [wx, wy] = toWorld(e)
          const g = gridRef.current
          let [x, y] = [wx - drag.current.ox, wy - drag.current.oy]
          if (snapActive(g.snap, e.shiftKey)) [x, y] = snapPoint(g, x, y)
          game.find(drag.current.name)?.position.set(x, y, 0)
        } else if (pan.current) {
          const rect = canvasRef.current?.getBoundingClientRect()
          if (!rect) return
          const perPx = (game.camera.right - game.camera.left) / rect.width
          game.camera.position.x -= (e.clientX - pan.current.px) * perPx
          game.camera.position.y += (e.clientY - pan.current.py) * perPx
          pan.current = { px: e.clientX, py: e.clientY }
        } else {
          // Hover feedback: a diagonal resize cursor over any corner handle.
          const [wx, wy] = toWorld(e)
          const hit = hitHandle(wx, wy)
          e.currentTarget.style.cursor = hit
            ? hit.corner[0] * hit.corner[1] > 0
              ? 'nesw-resize'
              : 'nwse-resize'
            : ''
        }
      }}
      onPointerUp={() => {
        if (resize.current) {
          const entity = gameRef.current?.find(resize.current.name)
          const box = entity && findBox(entity, [resize.current.compType])
          if (box) {
            onBoxResized?.(resize.current.name, resize.current.compType, [
              Math.round(box.comp.width * 100) / 100,
              Math.round(box.comp.height * 100) / 100,
            ])
          }
        }
        if (drag.current) {
          const entity = gameRef.current?.find(drag.current.name)
          if (entity) {
            onMoved(drag.current.name, [
              Math.round(entity.position.x * 100) / 100,
              Math.round(entity.position.y * 100) / 100,
            ])
          }
        }
        if (camDrag.current && camLive.current) {
          onCameraMoved?.([
            Math.round(camLive.current.x * 100) / 100,
            Math.round(camLive.current.y * 100) / 100,
          ])
        }
        resize.current = null
        drag.current = null
        pan.current = null
        camDrag.current = null
        camLive.current = null
      }}
      onWheel={(e) => {
        const game = gameRef.current
        if (!game || modeRef.current !== 'edit') return
        const next = game.view * (e.deltaY > 0 ? 1.1 : 1 / 1.1)
        game.setViewHeight(next)
        cam.current.view = game.view
      }}
      onDragOver={(e) => {
        if (!onDropPrefab || modeRef.current !== 'edit') return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropHover(true)
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        setDropHover(false)
        if (!onDropPrefab) return
        e.preventDefault()
        // 'waica/template' is the pre-explorer label format, still accepted.
        const ref = e.dataTransfer.getData('waica/prefab') || e.dataTransfer.getData('waica/template')
        if (!ref) return
        let world = toWorld(e)
        const g = gridRef.current
        if (snapActive(g.snap, e.shiftKey)) world = snapPoint(g, world[0], world[1])
        onDropPrefab(ref, world)
      }}
    />
    {mode === 'edit' && showCamera && (
      <div ref={uiFrameRef} className="ed-vp-ui">
        <div ref={uiScaleRef} />
      </div>
    )}
    {mode === 'edit' && onGridChange && (
      <div className="ed-vp-tools">
        <button
          title="Show grid"
          className={grid.show ? 'is-on' : ''}
          onClick={() => onGridChange({ ...grid, show: !grid.show })}
        >
          ⊞
        </button>
        <button
          title="Snap to grid (hold Shift to invert)"
          className={grid.snap ? 'is-on' : ''}
          onClick={() => onGridChange({ ...grid, snap: !grid.snap })}
        >
          🧲
        </button>
        <input
          type="number"
          title="Grid cell size (world units)"
          min={MIN_GRID_SIZE}
          step={0.25}
          value={sizeText}
          onChange={(e) => {
            setSizeText(e.target.value)
            const size = Number(e.target.value)
            if (isFinite(size) && size >= MIN_GRID_SIZE) onGridChange({ ...grid, size })
          }}
        />
      </div>
    )}
    {mode === 'edit' && (
      <div className="ed-vp-nav">
        <button title="Zoom in" onClick={() => zoomBy(1 / 1.25)}>
          ＋
        </button>
        <button title="Zoom out" onClick={() => zoomBy(1.25)}>
          −
        </button>
        {showCamera && (
          <button title="Go to the scene camera's framing" onClick={frameCamera}>
            🎥
          </button>
        )}
      </div>
    )}
    </>
  )
})
