import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Game, loadScene, THREE, type Entity, type SceneJson, type SceneRegistry } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'

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
  /** Initial camera height in world units (zoom still applies). */
  viewHeight?: number
  selected: string | null
  onSelect(name: string | null): void
  onMoved(name: string, position: [number, number]): void
  /** Reports a collision-box resize (corner-handle drag) on pointer-up. */
  onCollisionResized?(name: string, componentType: 'Hitbox' | 'Solid', size: [number, number]): void
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

/** Hitbox first: when both boxes share a corner, its handle wins the hit-test. */
const COLLISION_KINDS = [
  { type: 'Hitbox', color: 0xef476f },
  { type: 'Solid', color: 0x06d6a0 },
] as const

/** The entity's live collision component of the given kind, if any. */
function findCollision(
  entity: Entity,
  type: 'Hitbox' | 'Solid',
): { width: number; height: number } | null {
  const comp = entity.components.find(
    (c) => (c.constructor as { componentName?: string }).componentName === type,
  ) as unknown as { width?: unknown; height?: unknown } | undefined
  if (typeof comp?.width !== 'number' || typeof comp.height !== 'number') return null
  return comp as { width: number; height: number }
}

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(
  { scene, registry = ACTIVE_ARCHETYPE.registry, epoch, mode, viewHeight = 12, selected, onSelect, onMoved, onCollisionResized, onDropPrefab },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const sceneRef = useRef(scene)
  const registryRef = useRef(registry)
  const selectedRef = useRef(selected)
  const modeRef = useRef(mode)
  const [dropHover, setDropHover] = useState(false)
  const cam = useRef({ x: 0, y: 0, view: viewHeight })
  const drag = useRef<{ name: string; ox: number; oy: number } | null>(null)
  const pan = useRef<{ px: number; py: number } | null>(null)
  const resize = useRef<{ name: string; compType: 'Hitbox' | 'Solid' } | null>(null)

  sceneRef.current = scene
  registryRef.current = registry
  selectedRef.current = selected
  modeRef.current = mode

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const game = new Game({ canvas, viewHeight: cam.current.view, background: 0x1a1a2e })
    gameRef.current = game
    loadScene(game, sceneRef.current, registryRef.current)
    game.simulate = mode === 'play'
    if (mode === 'edit') {
      game.camera.position.x = cam.current.x
      game.camera.position.y = cam.current.y
    }
    // Selection gizmo: a rectangle around the entity.
    const gizmo = rectLoop(0xffb703)
    gizmo.position.z = 5
    gizmo.visible = false
    game.scene.add(gizmo)

    // Collision gizmos: the selected entity's Hitbox/Solid boxes, with corner
    // handles to resize them by dragging.
    const collisionGizmos = COLLISION_KINDS.map(({ type, color }) => {
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
      return { type, loop, handles }
    })

    game.onUpdate(() => {
      const name = selectedRef.current
      const entity = name ? game.find(name) : undefined
      const editing = entity && modeRef.current === 'edit'
      if (editing) {
        const [w, h] = entityBounds(entity)
        gizmo.visible = true
        gizmo.position.set(entity.position.x, entity.position.y, 5)
        gizmo.scale.set(w + 0.2, h + 0.2, 1)
      } else {
        gizmo.visible = false
      }
      // Handles keep a constant screen size regardless of zoom.
      const hs = game.view * 0.018
      for (const g of collisionGizmos) {
        const comp = editing ? findCollision(entity, g.type) : null
        if (editing && comp) {
          g.loop.visible = true
          g.loop.position.set(entity.position.x, entity.position.y, 5)
          g.loop.scale.set(comp.width, comp.height, 1)
          g.handles.forEach((handle, i) => {
            const [cx, cy] = CORNERS[i] ?? [0, 0]
            handle.visible = true
            handle.position.set(
              entity.position.x + cx * comp.width,
              entity.position.y + cy * comp.height,
              5.1,
            )
            handle.scale.set(hs, hs, 1)
          })
        } else {
          g.loop.visible = false
          for (const handle of g.handles) handle.visible = false
        }
      }
      if (modeRef.current === 'edit') {
        cam.current.x = game.camera.position.x
        cam.current.y = game.camera.position.y
      }
    })

    game.start()
    return () => {
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

  /** A collision-box corner handle of the selected entity under the pointer. */
  const hitHandle = (wx: number, wy: number): { name: string; compType: 'Hitbox' | 'Solid' } | null => {
    const game = gameRef.current
    const name = selectedRef.current
    if (!game || !name) return null
    const entity = game.find(name)
    if (!entity) return null
    // Slightly larger than the visual handle so it's easy to grab.
    const hs = game.view * 0.02
    for (const { type } of COLLISION_KINDS) {
      const comp = findCollision(entity, type)
      if (!comp) continue
      for (const [cx, cy] of CORNERS) {
        if (
          Math.abs(wx - (entity.position.x + cx * comp.width)) <= hs &&
          Math.abs(wy - (entity.position.y + cy * comp.height)) <= hs
        ) {
          return { name, compType: type }
        }
      }
    }
    return null
  }

  return (
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
          resize.current = handle
          return
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
          const comp = entity && findCollision(entity, resize.current.compType)
          if (entity && comp) {
            // Boxes are centered on the entity, so a corner drag resizes symmetrically.
            const snap = e.shiftKey ? 0.25 : 0
            let w = Math.abs(wx - entity.position.x) * 2
            let h = Math.abs(wy - entity.position.y) * 2
            if (snap) {
              w = Math.round(w / snap) * snap
              h = Math.round(h / snap) * snap
            }
            comp.width = Math.max(0.1, w)
            comp.height = Math.max(0.1, h)
          }
        } else if (drag.current) {
          const [wx, wy] = toWorld(e)
          const snap = e.shiftKey ? 0.5 : 0
          let x = wx - drag.current.ox
          let y = wy - drag.current.oy
          if (snap) {
            x = Math.round(x / snap) * snap
            y = Math.round(y / snap) * snap
          }
          game.find(drag.current.name)?.position.set(x, y, 0)
        } else if (pan.current) {
          const rect = canvasRef.current?.getBoundingClientRect()
          if (!rect) return
          const perPx = (game.camera.right - game.camera.left) / rect.width
          game.camera.position.x -= (e.clientX - pan.current.px) * perPx
          game.camera.position.y += (e.clientY - pan.current.py) * perPx
          pan.current = { px: e.clientX, py: e.clientY }
        }
      }}
      onPointerUp={() => {
        if (resize.current) {
          const entity = gameRef.current?.find(resize.current.name)
          const comp = entity && findCollision(entity, resize.current.compType)
          if (comp) {
            onCollisionResized?.(resize.current.name, resize.current.compType, [
              Math.round(comp.width * 100) / 100,
              Math.round(comp.height * 100) / 100,
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
        resize.current = null
        drag.current = null
        pan.current = null
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
        if (ref) onDropPrefab(ref, toWorld(e))
      }}
    />
  )
})
