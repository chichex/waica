import * as THREE from 'three'
import type { Component, ComponentClass } from './component'
import { Entity } from './entity'
import { Input } from './input'

export interface GameOptions {
  /** Canvas donde se dibuja el juego. */
  canvas: HTMLCanvasElement
  /** Color de fondo de la escena. */
  background?: THREE.ColorRepresentation
  /** Altura visible del mundo en unidades; la cámara 2D encuadra esto. */
  viewHeight?: number
}

export type UpdateFn = (dt: number) => void

/** Overrides persistidos: entity → componentName → prop → valor. */
export type ParamOverrides = Record<string, Record<string, Record<string, number | boolean>>>

/**
 * Núcleo del motor: loop, escena three unificada 2D/3D, cámara ortográfica,
 * entidades con componentes e input. Ver DESIGN.md.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.OrthographicCamera
  readonly input = new Input()
  readonly entities: Entity[] = []
  paramOverrides: ParamOverrides = {}

  // TODO(H1): migrar a WebGPURenderer (three/webgpu) con fallback WebGL2 automático.
  private readonly renderer: THREE.WebGLRenderer
  private readonly updateFns = new Set<UpdateFn>()
  private readonly viewHeight: number
  private lastTime = 0

  constructor(options: GameOptions) {
    const { canvas, background = 0x1a1a2e, viewHeight = 10 } = options
    this.viewHeight = viewHeight
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(background)
    this.camera = new THREE.OrthographicCamera()
    this.camera.position.z = 10
    this.resize()
    new ResizeObserver(() => this.resize()).observe(canvas)
  }

  /** Crea una entidad viva en la escena. */
  spawn(name: string): Entity {
    const entity = new Entity(this, name)
    this.entities.push(entity)
    this.scene.add(entity.node)
    return entity
  }

  /** Busca una entidad por nombre. */
  find(name: string): Entity | undefined {
    return this.entities.find((e) => e.name === name)
  }

  /** Carga overrides de parámetros persistidos (waica.params.json). */
  async loadParams(url: string): Promise<void> {
    try {
      const res = await fetch(url)
      if (res.ok) this.paramOverrides = (await res.json()) as ParamOverrides
    } catch {
      // sin archivo de params: se usan los defaults del arquetipo
    }
  }

  /** Aplica overrides persistidos a un componente recién agregado. */
  applyParamOverrides(entity: Entity, component: Component): void {
    const Class = component.constructor as unknown as ComponentClass
    const override = this.paramOverrides[entity.name]?.[Class.componentName]
    if (override) Object.assign(component, override)
  }

  /** Registra una función que corre una vez por frame. Devuelve el de-registro. */
  onUpdate(fn: UpdateFn): () => void {
    this.updateFns.add(fn)
    return () => this.updateFns.delete(fn)
  }

  start(): void {
    this.renderer.setAnimationLoop((time) => this.tick(time))
  }

  stop(): void {
    this.renderer.setAnimationLoop(null)
  }

  /** Interno: Entity.destroy() lo llama. */
  removeEntity(entity: Entity): void {
    const i = this.entities.indexOf(entity)
    if (i !== -1) this.entities.splice(i, 1)
  }

  private tick(time: number): void {
    // Clamp del dt: cambiar de pestaña o pausar no dispara la simulación.
    const dt = Math.min((time - this.lastTime) / 1000, 0.1)
    this.lastTime = time
    for (const entity of [...this.entities]) {
      for (const component of [...entity.components]) component.onUpdate?.(dt)
    }
    for (const fn of this.updateFns) fn(dt)
    this.input.endFrame()
    this.renderer.render(this.scene, this.camera)
  }

  private resize(): void {
    const canvas = this.renderer.domElement
    const { clientWidth: w, clientHeight: h } = canvas
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    const halfH = this.viewHeight / 2
    const halfW = halfH * (w / h)
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }
}
