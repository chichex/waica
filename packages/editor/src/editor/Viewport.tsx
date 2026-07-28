import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Game, GameUi, loadScene, resolveCollisionPoints, resolveSceneCamera, THREE, type CollisionPoint, type Entity, type GameResolution, type InputBindings, type SceneJson, type SceneRegistry, type StatValue } from '@waica/engine'
import { DEFAULT_EDITOR_SETTINGS, MIN_GRID_SIZE, type GridSettings } from '../project/editor-settings'
import { CAMERA_NODE } from '../scene/ops'
import { cornerResize } from './box-math'
import { gridCoverKey, gridLineVertices, snapActive, snapPoint } from './grid'
import { NumberField } from './NumberField'
import { uiFrameLayout } from './ui-preview'

export interface ViewportHandle {
  /** Applies a prop change to the live instance (without recreating the game). */
  applyProp(entity: string, componentType: string, key: string, value: unknown): void
  applyMove(entity: string, x: number, y: number): void
}

export interface ViewportComponentVisibility {
  appearance: boolean
  collision: boolean
}

const DEFAULT_COMPONENT_VISIBILITY: ViewportComponentVisibility = {
  appearance: true,
  collision: true,
}

interface Props {
  scene: SceneJson
  /** Components + project-owned prefabs used to load the scene. */
  registry: SceneRegistry
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
  /** Editor-only visibility of the selected entity's internal viewport layers. */
  componentVisibility?: ViewportComponentVisibility
  /** The selected entity name, or CAMERA_NODE for the scene camera. */
  selected: string | null
  /** Names in the multi-selection; dragging any member moves the whole group. */
  multiSelected?: string[]
  onSelect(name: string | null): void
  /** Shift-click on an entity: toggles it in the multi-selection. */
  onToggleSelect?(name: string): void
  /** Marquee (Shift-drag on empty space): replaces the selection wholesale. */
  onRangeSelect?(names: string[]): void
  onSelectCamera?(): void
  onMoved(name: string, position: [number, number]): void
  /** Commits a group drag as one undo step (multi-selection moves). */
  onMovedMany?(moves: Array<{ name: string; position: [number, number] }>): void
  /** Reports a scene-camera drag on pointer-up. */
  onCameraMoved?(position: [number, number]): void
  /**
   * Reports a box resize (collision or appearance corner-handle drag) on
   * pointer-up. The dragged corner moves and the opposite one stays pinned,
   * so the box's center shifts too — hence the offset.
   */
  onBoxResized?(
    name: string,
    componentType: string,
    size: [number, number],
    offset: [number, number],
  ): void
  /** Reports a component box offset after its outline is dragged. */
  onBoxMoved?(name: string, componentType: string, offset: [number, number]): void
  /** Reports freeform collision vertices after a polygon handle drag. */
  onPolygonChanged?(name: string, componentType: string, points: CollisionPoint[]): void
  /** Accepts 'waica/prefab' drops (refs); omit to reject drops (prefab stage). */
  onDropPrefab?(ref: string, world: [number, number]): void
}

/** An entity's visual size (for picking and the gizmo), including box offsets. */
function entityBounds(entity: Entity): [number, number] {
  let w = 0.6
  let h = 0.6
  for (const c of entity.components) {
    const box = c as unknown as {
      width?: unknown
      height?: unknown
      offsetX?: unknown
      offsetY?: unknown
    }
    if (typeof box.width === 'number' && typeof box.height === 'number') {
      const offsetX = typeof box.offsetX === 'number' ? box.offsetX : 0
      const offsetY = typeof box.offsetY === 'number' ? box.offsetY : 0
      w = Math.max(w, Math.abs(offsetX) * 2 + box.width)
      h = Math.max(h, Math.abs(offsetY) * 2 + box.height)
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

type BoxRole = (typeof BOX_KINDS)[number]['role']

interface LiveBox {
  width: number
  height: number
  offsetX?: number
  offsetY?: number
  shape?: string
  points?: CollisionPoint[]
}

function boxShape(comp: LiveBox, role: BoxRole): 'rectangle' | 'circle' | 'polygon' {
  if (comp.shape === 'circle') return 'circle'
  if (role === 'collision' && comp.shape === 'polygon') return 'polygon'
  return 'rectangle'
}

function boxOutline(comp: LiveBox, role: BoxRole): CollisionPoint[] {
  const shape = boxShape(comp, role)
  if (shape === 'polygon') return resolveCollisionPoints(comp.points)
  if (shape === 'circle') {
    return Array.from({ length: 40 }, (_, index): CollisionPoint => {
      const angle = (index / 40) * Math.PI * 2
      return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5]
    })
  }
  return CORNERS.map(([x, y]) => [x, y])
}

function boxHandlePoints(comp: LiveBox, role: BoxRole): CollisionPoint[] {
  return boxShape(comp, role) === 'polygon'
    ? resolveCollisionPoints(comp.points)
    : CORNERS.map(([x, y]) => [x, y])
}

function boxCenter(entity: Entity, comp: LiveBox): CollisionPoint {
  return [entity.position.x + (comp.offsetX ?? 0), entity.position.y + (comp.offsetY ?? 0)]
}

function pointSegmentDistance(
  px: number,
  py: number,
  [ax, ay]: CollisionPoint,
  [bx, by]: CollisionPoint,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** The entity's live component of one of the given types, with its box. */
function findBox(
  entity: Entity,
  types: readonly string[],
): { comp: LiveBox; type: string } | null {
  for (const c of entity.components) {
    const type = (c.constructor as { componentName?: string }).componentName ?? ''
    if (!types.includes(type)) continue
    const comp = c as unknown as Partial<LiveBox>
    if (typeof comp.width === 'number' && typeof comp.height === 'number') {
      return { comp: comp as LiveBox, type }
    }
  }
  return null
}

type ResizeDrag =
  /** ax/ay: the opposite corner's world position, pinned for the whole drag. */
  | { kind: 'box'; name: string; compType: string; ax: number; ay: number }
  | { kind: 'polygon'; name: string; compType: string; point: number }
  | { kind: 'move'; name: string; compType: string; ox: number; oy: number }

type HandleHit =
  | { kind: 'box'; name: string; compType: string; corner: CollisionPoint }
  | { kind: 'polygon'; name: string; compType: string; point: number }

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(
  { scene, registry, epoch, mode, bindings, stats, viewHeight = 12, background = 0x1a1a2e, resolution, showCamera = false, grid = DEFAULT_EDITOR_SETTINGS.grid, onGridChange, componentVisibility = DEFAULT_COMPONENT_VISIBILITY, selected, multiSelected, onSelect, onToggleSelect, onRangeSelect, onSelectCamera, onMoved, onMovedMany, onCameraMoved, onBoxResized, onBoxMoved, onPolygonChanged, onDropPrefab },
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
  const multiRef = useRef(multiSelected)
  const modeRef = useRef(mode)
  const gridRef = useRef(grid)
  const componentVisibilityRef = useRef(componentVisibility)
  const [dropHover, setDropHover] = useState(false)
  const cam = useRef({ x: 0, y: 0, view: viewHeight })
  /** The edit camera starts framed like the scene camera, once per mount. */
  const camSeeded = useRef(false)
  /** Entity drag: the grabbed anchor plus every group member's pointer offset. */
  const drag = useRef<{
    anchor: { name: string; ox: number; oy: number }
    members: Array<{ name: string; ox: number; oy: number }>
  } | null>(null)
  /** Marquee selection (Cmd/Ctrl-drag on empty space), in world + client coords. */
  const marquee = useRef<{ x0: number; y0: number; x1: number; y1: number; cx0: number; cy0: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const pan = useRef<{ px: number; py: number } | null>(null)
  const resize = useRef<ResizeDrag | null>(null)
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
  multiRef.current = multiSelected
  modeRef.current = mode
  gridRef.current = grid
  componentVisibilityRef.current = componentVisibility

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

    // Multi-selection gizmos: one outline per group member, pooled.
    const multiGizmos: Array<ReturnType<typeof rectLoop>> = []
    const ensureMultiGizmos = (count: number): void => {
      while (multiGizmos.length < count) {
        const loop = rectLoop(0xffb703)
        loop.position.z = 4.9
        loop.visible = false
        game.scene.add(loop)
        multiGizmos.push(loop)
      }
    }

    // Box gizmos: the selected entity's collision and appearance boxes, with
    // corner handles to resize them by dragging.
    const boxGizmos = BOX_KINDS.map(({ types, color, role }) => {
      const loop = rectLoop(color)
      loop.position.z = 5
      loop.visible = false
      game.scene.add(loop)
      const handles: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>> = []
      const ensureHandles = (count: number): void => {
        while (handles.length < count) {
          const handle = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ color }),
          )
          handle.position.z = 5.1
          handle.visible = false
          game.scene.add(handle)
          handles.push(handle)
        }
      }
      ensureHandles(CORNERS.length)
      return { types, role, loop, handles, ensureHandles, outlineKey: 'rectangle' }
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
    let hiddenAppearance: { entity: Entity; wasVisible: boolean } | null = null
    const restoreAppearance = (): void => {
      if (!hiddenAppearance) return
      hiddenAppearance.entity.node.visible = hiddenAppearance.wasVisible
      hiddenAppearance = null
    }

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
      if (editing && !componentVisibilityRef.current.appearance) {
        if (hiddenAppearance?.entity !== entity) {
          restoreAppearance()
          hiddenAppearance = { entity, wasVisible: entity.node.visible }
        }
        entity.node.visible = false
      } else {
        restoreAppearance()
      }
      // Handles keep a constant screen size regardless of zoom.
      const hs = game.view * 0.018
      let appearanceBoxExists = false
      for (const g of boxGizmos) {
        const box = editing ? findBox(entity, g.types) : null
        if (editing && box && g.role === 'appearance') appearanceBoxExists = true
        if (editing && box && componentVisibilityRef.current[g.role]) {
          const outline = boxOutline(box.comp, g.role)
          const outlineKey = JSON.stringify(outline)
          if (outlineKey !== g.outlineKey) {
            g.outlineKey = outlineKey
            g.loop.geometry.dispose()
            g.loop.geometry = new THREE.BufferGeometry().setFromPoints(
              outline.map(([x, y]) => new THREE.Vector3(x, y, 0)),
            )
          }
          const [centerX, centerY] = boxCenter(entity, box.comp)
          g.loop.visible = true
          g.loop.position.set(centerX, centerY, 5)
          g.loop.scale.set(box.comp.width, box.comp.height, 1)

          const handlePoints = boxHandlePoints(box.comp, g.role)
          g.ensureHandles(handlePoints.length)
          g.handles.forEach((handle, index) => {
            const point = handlePoints[index]
            handle.visible = point != null
            if (!point) return
            handle.position.set(
              centerX + point[0] * box.comp.width,
              centerY + point[1] * box.comp.height,
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
        // The margin rect marks selection only when there is no appearance box.
        // A hidden appearance stays hidden instead of being replaced by this outline.
        gizmo.visible = !appearanceBoxExists
        const [w, h] = entityBounds(entity)
        gizmo.position.set(entity.position.x, entity.position.y, 5)
        gizmo.scale.set(w + 0.2, h + 0.2, 1)
      } else {
        gizmo.visible = false
      }
      // Outline every member of the multi-selection so the group reads at a glance.
      const multi = modeRef.current === 'edit' ? (multiRef.current ?? []) : []
      ensureMultiGizmos(multi.length)
      multiGizmos.forEach((loop, index) => {
        const name = multi.length > 1 ? multi[index] : undefined
        const target = name ? game.find(name) : undefined
        if (!target) {
          loop.visible = false
          return
        }
        const [w, h] = entityBounds(target)
        loop.visible = true
        loop.position.set(target.position.x, target.position.y, 4.9)
        loop.scale.set(w + 0.2, h + 0.2, 1)
      })
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
      restoreAppearance()
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

  /** A box corner or freeform polygon vertex under the pointer. */
  const hitHandle = (wx: number, wy: number): HandleHit | null => {
    const game = gameRef.current
    const name = selectedRef.current
    if (!game || !name) return null
    const entity = game.find(name)
    if (!entity) return null
    // Slightly larger than the visual handle so it's easy to grab.
    const hs = game.view * 0.02
    for (const { types, role } of BOX_KINDS) {
      if (!componentVisibilityRef.current[role]) continue
      const box = findBox(entity, types)
      if (!box) continue
      const [centerX, centerY] = boxCenter(entity, box.comp)
      const polygon = boxShape(box.comp, role) === 'polygon'
      const points = boxHandlePoints(box.comp, role)
      for (let index = 0; index < points.length; index++) {
        const point = points[index]!
        if (
          Math.abs(wx - (centerX + point[0] * box.comp.width)) <= hs &&
          Math.abs(wy - (centerY + point[1] * box.comp.height)) <= hs
        ) {
          return polygon
            ? { kind: 'polygon', name, compType: box.type, point: index }
            : { kind: 'box', name, compType: box.type, corner: point }
        }
      }
    }
    return null
  }

  /** An appearance or collision outline that can be dragged independently. */
  const hitBoxOutline = (
    wx: number,
    wy: number,
  ): { name: string; compType: string; center: CollisionPoint } | null => {
    const game = gameRef.current
    const name = selectedRef.current
    if (!game || !name) return null
    const entity = game.find(name)
    if (!entity) return null
    const threshold = game.view * 0.012
    for (const { types, role } of BOX_KINDS) {
      if (!componentVisibilityRef.current[role]) continue
      const box = findBox(entity, types)
      if (!box) continue
      const center = boxCenter(entity, box.comp)
      const points = boxOutline(box.comp, role).map(
        ([x, y]): CollisionPoint => [
          center[0] + x * box.comp.width,
          center[1] + y * box.comp.height,
        ],
      )
      for (let index = 0; index < points.length; index++) {
        if (
          pointSegmentDistance(wx, wy, points[index]!, points[(index + 1) % points.length]!) <=
          threshold
        ) {
          return { name, compType: box.type, center }
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
          if (handle.kind === 'polygon') {
            resize.current = handle
          } else {
            const entity = gameRef.current?.find(handle.name)
            const box = entity && findBox(entity, [handle.compType])
            if (entity && box) {
              const [centerX, centerY] = boxCenter(entity, box.comp)
              resize.current = {
                kind: 'box',
                name: handle.name,
                compType: handle.compType,
                ax: centerX - handle.corner[0] * box.comp.width,
                ay: centerY - handle.corner[1] * box.comp.height,
              }
            }
          }
          return
        }
        const outline = hitBoxOutline(wx, wy)
        if (outline) {
          resize.current = {
            kind: 'move',
            name: outline.name,
            compType: outline.compType,
            ox: wx - outline.center[0],
            oy: wy - outline.center[1],
          }
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
          if (e.shiftKey && onToggleSelect) {
            onToggleSelect(hit.name)
            return
          }
          // Grabbing a member of the multi-selection drags the whole group
          // (and keeps the group); anything else collapses to single-select.
          const multi = multiRef.current ?? []
          const grouped = multi.length > 1 && multi.includes(hit.name)
          if (!grouped) onSelect(hit.name)
          const members = (grouped ? multi : [hit.name]).flatMap((name) => {
            const entity = name === hit.name ? hit : game?.find(name)
            return entity ? [{ name, ox: wx - entity.position.x, oy: wy - entity.position.y }] : []
          })
          const anchor = members.find((m) => m.name === hit.name) ?? members[0]
          if (anchor) drag.current = { anchor, members }
        } else if (e.shiftKey && onRangeSelect) {
          marquee.current = { x0: wx, y0: wy, x1: wx, y1: wy, cx0: e.clientX, cy0: e.clientY }
          setMarqueeRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 })
        } else {
          onSelect(null)
          pan.current = { px: e.clientX, py: e.clientY }
        }
      }}
      onPointerMove={(e) => {
        const game = gameRef.current
        if (!game || modeRef.current !== 'edit') return
        if (resize.current) {
          const active = resize.current
          let [wx, wy] = toWorld(e)
          const entity = game.find(active.name)
          const box = entity && findBox(entity, [active.compType])
          if (entity && box && active.kind === 'move') {
            const g = gridRef.current
            let centerX = wx - active.ox
            let centerY = wy - active.oy
            if (snapActive(g.snap, e.shiftKey)) {
              const snapped = snapPoint(g, centerX, centerY)
              centerX = snapped[0]
              centerY = snapped[1]
            }
            box.comp.offsetX = centerX - entity.position.x
            box.comp.offsetY = centerY - entity.position.y
          } else if (entity && box && active.kind === 'polygon') {
            const g = gridRef.current
            if (snapActive(g.snap, e.shiftKey)) [wx, wy] = snapPoint(g, wx, wy)
            const [centerX, centerY] = boxCenter(entity, box.comp)
            const points = resolveCollisionPoints(box.comp.points)
            const width = Math.abs(box.comp.width) > 0.001 ? box.comp.width : 1
            const height = Math.abs(box.comp.height) > 0.001 ? box.comp.height : 1
            points[active.point] = [(wx - centerX) / width, (wy - centerY) / height]
            box.comp.points = points
          } else if (entity && box && active.kind === 'box') {
            // A corner drag pins the opposite corner: only the grabbed side
            // moves. The dragged corner itself snaps to the grid.
            const g = gridRef.current
            if (snapActive(g.snap, e.shiftKey)) [wx, wy] = snapPoint(g, wx, wy)
            const next = cornerResize(active.ax, active.ay, wx, wy)
            box.comp.width = next.width
            box.comp.height = next.height
            box.comp.offsetX = next.centerX - entity.position.x
            box.comp.offsetY = next.centerY - entity.position.y
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
          const { anchor, members } = drag.current
          // The grabbed entity snaps; the rest keep their offsets to it.
          const rawX = wx - anchor.ox
          const rawY = wy - anchor.oy
          let [x, y] = [rawX, rawY]
          if (snapActive(g.snap, e.shiftKey)) [x, y] = snapPoint(g, x, y)
          for (const m of members) {
            game.find(m.name)?.position.set(wx - m.ox + (x - rawX), wy - m.oy + (y - rawY), 0)
          }
        } else if (marquee.current) {
          const [wx, wy] = toWorld(e)
          marquee.current.x1 = wx
          marquee.current.y1 = wy
          setMarqueeRect({
            left: Math.min(marquee.current.cx0, e.clientX),
            top: Math.min(marquee.current.cy0, e.clientY),
            width: Math.abs(e.clientX - marquee.current.cx0),
            height: Math.abs(e.clientY - marquee.current.cy0),
          })
        } else if (pan.current) {
          const rect = canvasRef.current?.getBoundingClientRect()
          if (!rect) return
          const perPx = (game.camera.right - game.camera.left) / rect.width
          game.camera.position.x -= (e.clientX - pan.current.px) * perPx
          game.camera.position.y += (e.clientY - pan.current.py) * perPx
          pan.current = { px: e.clientX, py: e.clientY }
        } else {
          // Hover feedback: resize on handles, move on component outlines.
          const [wx, wy] = toWorld(e)
          const hit = hitHandle(wx, wy)
          e.currentTarget.style.cursor = hit
            ? hit.kind === 'polygon'
              ? 'move'
              : hit.corner[0] * hit.corner[1] > 0
                ? 'nesw-resize'
                : 'nwse-resize'
            : hitBoxOutline(wx, wy)
              ? 'move'
              : ''
        }
      }}
      onPointerUp={() => {
        if (resize.current) {
          const active = resize.current
          const entity = gameRef.current?.find(active.name)
          const box = entity && findBox(entity, [active.compType])
          if (box && active.kind === 'move') {
            onBoxMoved?.(active.name, active.compType, [
              Math.round((box.comp.offsetX ?? 0) * 100) / 100,
              Math.round((box.comp.offsetY ?? 0) * 100) / 100,
            ])
          } else if (box && active.kind === 'polygon') {
            const points = resolveCollisionPoints(box.comp.points).map(
              ([x, y]): CollisionPoint => [
                Math.round(x * 1000) / 1000,
                Math.round(y * 1000) / 1000,
              ],
            )
            onPolygonChanged?.(active.name, active.compType, points)
          } else if (box) {
            onBoxResized?.(
              active.name,
              active.compType,
              [
                Math.round(box.comp.width * 100) / 100,
                Math.round(box.comp.height * 100) / 100,
              ],
              [
                Math.round((box.comp.offsetX ?? 0) * 100) / 100,
                Math.round((box.comp.offsetY ?? 0) * 100) / 100,
              ],
            )
          }
        }
        if (drag.current) {
          const game = gameRef.current
          const moves = drag.current.members.flatMap((m) => {
            const entity = game?.find(m.name)
            return entity
              ? [
                  {
                    name: m.name,
                    position: [
                      Math.round(entity.position.x * 100) / 100,
                      Math.round(entity.position.y * 100) / 100,
                    ] as [number, number],
                  },
                ]
              : []
          })
          if (moves.length > 1 && onMovedMany) onMovedMany(moves)
          else if (moves[0]) onMoved(moves[0].name, moves[0].position)
        }
        if (marquee.current) {
          const { x0, y0, x1, y1 } = marquee.current
          const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)]
          const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)]
          const names = sceneRef.current.entities
            .filter((ent) => {
              const entity = gameRef.current?.find(ent.name)
              if (!entity) return false
              const { x, y } = entity.position
              return x >= minX && x <= maxX && y >= minY && y <= maxY
            })
            .map((ent) => ent.name)
          if (names.length > 0) onRangeSelect?.(names)
          else onSelect(null)
          marquee.current = null
          setMarqueeRect(null)
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
    {marqueeRect && (
      <div
        className="ed-marquee"
        style={{
          left: marqueeRect.left,
          top: marqueeRect.top,
          width: marqueeRect.width,
          height: marqueeRect.height,
        }}
      />
    )}
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
        <NumberField
          title="Grid cell size (world units)"
          min={MIN_GRID_SIZE}
          step={0.25}
          value={grid.size}
          onChange={(t) => {
            const size = Number(t)
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
