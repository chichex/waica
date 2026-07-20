import * as THREE from 'three'
import { aabbOverlap } from './aabb'
import type { Component, ComponentClass } from './component'
import { Hitbox } from './components/hitbox'
import { Entity } from './entity'
import { Emitter } from './events'
import { Input, type InputBindings } from './input'
import { Stats, type StatValue } from './stats'
import { GameUi } from './ui'

export interface GameOptions {
  /** Canvas the game draws into. */
  canvas: HTMLCanvasElement
  /** Scene background color. */
  background?: THREE.ColorRepresentation
  /** Visible world height in units; the 2D camera frames this. */
  viewHeight?: number
  /** Control overrides (action → key codes) on top of the defaults. */
  bindings?: InputBindings
  /** Initial stat values (points, lives…) from the project's stats.json. */
  stats?: Record<string, StatValue>
}

export type UpdateFn = (dt: number) => void

/** Persisted overrides: entity → componentName → prop → value. */
export type ParamOverrides = Record<string, Record<string, Record<string, number | boolean>>>

/**
 * Engine core: loop, unified 2D/3D three scene, orthographic camera,
 * entities with components, and input. See DESIGN.md.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.OrthographicCamera
  readonly input: Input
  readonly entities: Entity[] = []
  readonly events = new Emitter()
  readonly stats: Stats
  /** The HTML UI layer: presentation-only pieces toggled from code. */
  readonly ui: GameUi
  paramOverrides: ParamOverrides = {}
  /**
   * With false, the loop keeps rendering but runs no component updates
   * or collisions — the editor's edit mode.
   */
  simulate = true

  // TODO(H1): migrate to WebGPURenderer (three/webgpu) with automatic WebGL2 fallback.
  private readonly renderer: THREE.WebGLRenderer
  private readonly updateFns = new Set<UpdateFn>()
  private viewHeight: number
  private lastTime = 0

  constructor(options: GameOptions) {
    const { canvas, background = 0x1a1a2e, viewHeight = 10 } = options
    this.viewHeight = viewHeight
    this.input = new Input(options.bindings)
    this.stats = new Stats(options.stats)
    this.ui = new GameUi(this.stats, () => canvas.parentElement ?? document.body)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(background)
    this.camera = new THREE.OrthographicCamera()
    this.camera.position.z = 10
    this.resize()
    new ResizeObserver(() => this.resize()).observe(canvas)
  }

  /** Creates a live entity in the scene. */
  spawn(name: string): Entity {
    const entity = new Entity(this, name)
    this.entities.push(entity)
    this.scene.add(entity.node)
    return entity
  }

  /** Finds an entity by name. */
  find(name: string): Entity | undefined {
    return this.entities.find((e) => e.name === name)
  }

  /** Loads persisted parameter overrides (waica.params.json). */
  async loadParams(url: string): Promise<void> {
    try {
      const res = await fetch(url)
      if (res.ok) this.paramOverrides = (await res.json()) as ParamOverrides
    } catch {
      // no params file: the archetype defaults apply
    }
  }

  /** Applies persisted overrides to a freshly added component. */
  applyParamOverrides(entity: Entity, component: Component): void {
    const Class = component.constructor as unknown as ComponentClass
    const override = this.paramOverrides[entity.name]?.[Class.componentName]
    if (override) Object.assign(component, override)
  }

  /** Registers a function that runs once per frame. Returns the unsubscribe. */
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

  /** Internal: called by Entity.destroy(). */
  removeEntity(entity: Entity): void {
    const i = this.entities.indexOf(entity)
    if (i !== -1) this.entities.splice(i, 1)
  }

  /** Visible world height (2D camera zoom). */
  get view(): number {
    return this.viewHeight
  }

  setViewHeight(value: number): void {
    this.viewHeight = Math.min(Math.max(value, 2), 80)
    this.resize()
  }

  /** Shuts the game down completely (loop, input, GPU). */
  dispose(): void {
    this.stop()
    this.input.dispose()
    this.ui.dispose()
    for (const entity of [...this.entities]) entity.destroy()
    this.renderer.dispose()
  }

  private tick(time: number): void {
    // Clamp dt: switching tabs or pausing doesn't fast-forward the simulation.
    const dt = Math.min((time - this.lastTime) / 1000, 0.1)
    this.lastTime = time
    if (this.simulate) {
      for (const entity of [...this.entities]) {
        for (const component of [...entity.components]) component.onUpdate?.(dt)
      }
      this.dispatchCollisions()
    }
    // The UI must react to the pause itself (hide until resumed).
    this.ui.setActive(this.simulate)
    for (const fn of this.updateFns) fn(dt)
    this.input.endFrame()
    this.renderer.render(this.scene, this.camera)
  }

  private dispatchCollisions(): void {
    const boxed = this.entities.filter((e) => e.has(Hitbox))
    for (let i = 0; i < boxed.length; i++) {
      for (let j = i + 1; j < boxed.length; j++) {
        const a = boxed[i]
        const b = boxed[j]
        if (!a?.alive || !b?.alive) continue
        const ha = a.get(Hitbox)
        const hb = b.get(Hitbox)
        if (!ha || !hb) continue
        const hit = aabbOverlap(
          a.position.x, a.position.y, ha.width, ha.height,
          b.position.x, b.position.y, hb.width, hb.height,
        )
        if (!hit) continue
        for (const c of [...a.components]) c.onCollide?.(b)
        if (!a.alive || !b.alive) continue
        for (const c of [...b.components]) c.onCollide?.(a)
      }
    }
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
