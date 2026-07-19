import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Game, loadScene, THREE, type Entity, type SceneJson } from '@waica/engine'
import { PLATFORMER_REGISTRY } from '@waica/archetype-platformer'

export interface ViewportHandle {
  /** Aplica un cambio de prop a la instancia viva (sin recrear el juego). */
  applyProp(entity: string, componentType: string, key: string, value: unknown): void
  applyMove(entity: string, x: number, y: number): void
}

interface Props {
  scene: SceneJson
  /** Cambios estructurales (crear/borrar) suben el epoch y recrean el juego. */
  epoch: number
  mode: 'edit' | 'play'
  selected: string | null
  onSelect(name: string | null): void
  onMoved(name: string, position: [number, number]): void
  onDropTemplate(label: string, world: [number, number]): void
  onCollect(): void
}

/** Tamaño visual de una entidad (para pick y gizmo): el mayor de sus cajas. */
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

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(
  { scene, epoch, mode, selected, onSelect, onMoved, onDropTemplate, onCollect },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const sceneRef = useRef(scene)
  const selectedRef = useRef(selected)
  const modeRef = useRef(mode)
  const cam = useRef({ x: 0, y: 0, view: 12 })
  const drag = useRef<{ name: string; ox: number; oy: number } | null>(null)
  const pan = useRef<{ px: number; py: number } | null>(null)

  sceneRef.current = scene
  selectedRef.current = selected
  modeRef.current = mode

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const game = new Game({ canvas, viewHeight: cam.current.view, background: 0x1a1a2e })
    gameRef.current = game
    loadScene(game, sceneRef.current, PLATFORMER_REGISTRY)
    game.simulate = mode === 'play'
    if (mode === 'edit') {
      game.camera.position.x = cam.current.x
      game.camera.position.y = cam.current.y
    }
    const offCollect = game.events.on('collect', () => onCollect())

    // Gizmo de selección: un rectángulo alrededor de la entidad.
    const gizmoGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
    ])
    const gizmo = new THREE.LineLoop(
      gizmoGeo,
      new THREE.LineBasicMaterial({ color: 0xffb703 }),
    )
    gizmo.position.z = 5
    gizmo.visible = false
    game.scene.add(gizmo)

    game.onUpdate(() => {
      const name = selectedRef.current
      const entity = name ? game.find(name) : undefined
      if (entity && modeRef.current === 'edit') {
        const [w, h] = entityBounds(entity)
        gizmo.visible = true
        gizmo.position.set(entity.position.x, entity.position.y, 5)
        gizmo.scale.set(w + 0.2, h + 0.2, 1)
      } else {
        gizmo.visible = false
      }
      if (modeRef.current === 'edit') {
        cam.current.x = game.camera.position.x
        cam.current.y = game.camera.position.y
      }
    })

    game.start()
    return () => {
      offCollect()
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

  return (
    <canvas
      ref={canvasRef}
      className={`ed-viewport ${mode === 'edit' ? 'is-edit' : 'is-play'}`}
      onPointerDown={(e) => {
        if (modeRef.current !== 'edit') return
        const [wx, wy] = toWorld(e)
        const hit = pickAt(wx, wy)
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // eventos sintéticos o punteros ya liberados: el drag funciona igual
        }
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
        if (drag.current) {
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
        if (drag.current) {
          const entity = gameRef.current?.find(drag.current.name)
          if (entity) {
            onMoved(drag.current.name, [
              Math.round(entity.position.x * 100) / 100,
              Math.round(entity.position.y * 100) / 100,
            ])
          }
        }
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
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e) => {
        e.preventDefault()
        const label = e.dataTransfer.getData('waica/template')
        if (label) onDropTemplate(label, toWorld(e))
      }}
    />
  )
})
